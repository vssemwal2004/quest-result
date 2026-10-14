import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, it } from 'node:test'
import { addStudents, startServer, student } from './helpers/server.js'

const until = async (fn, timeoutMs = 20_000, everyMs = 100) => {
  const end = Date.now() + timeoutMs
  for (;;) {
    if (await fn()) return
    if (Date.now() > end) throw new Error('condition not reached in time')
    await new Promise((r) => setTimeout(r, everyMs))
  }
}

describe('public show: pre-serialised payload with version ETag', () => {
  it('serves 200 + ETag, 304 for a matching If-None-Match, and a new ETag after a change', async () => {
    const srv = await startServer()
    try {
      const first = await srv.request('GET', '/api/public/show')
      assert.equal(first.status, 200)
      assert.equal(first.headers.get('cache-control'), 'no-cache')
      const etag = first.headers.get('etag')
      assert.match(etag, /^W\/"show-v\d+"$/)
      assert.equal(etag, `W/"show-v${first.body.version}"`)
      assert.deepEqual(Object.keys(first.body), ['settings', 'stages', 'state', 'totalWinners', 'version', 'serverTime'])
      assert.ok(Date.parse(first.body.serverTime))

      const again = await srv.request('GET', '/api/public/show', { headers: { 'If-None-Match': etag } })
      assert.equal(again.status, 304)
      assert.equal(again.body, '')

      const token = await srv.login()
      await srv.request('POST', '/api/admin/presentation/next', { token })
      const changed = await srv.request('GET', '/api/public/show', { headers: { 'If-None-Match': etag } })
      assert.equal(changed.status, 200)
      assert.notEqual(changed.headers.get('etag'), etag)
      assert.equal(changed.body.state.stageIndex, 1)
    } finally {
      await srv.close()
    }
  })
})

describe('rate limits', () => {
  it('login is limited per IP with a JSON RATE_LIMITED body and draft-7 headers', async () => {
    const srv = await startServer({ loginRateLimit: 2 })
    try {
      const statuses = []
      let last
      for (let i = 0; i < 3; i++) {
        last = await srv.request('POST', '/api/auth/login', { json: { email: 'x@y.z', password: 'x' } })
        statuses.push(last.status)
      }
      assert.deepEqual(statuses, [401, 401, 429])
      assert.equal(last.body.error.code, 'RATE_LIMITED')
      assert.ok(last.headers.get('ratelimit'), 'draft-7 RateLimit header')
    } finally {
      await srv.close()
    }
  })

  it('admin API, presentation control and public show have their own limits', async () => {
    const srv = await startServer({ adminRateLimit: 6, presentationRateLimit: 2, publicRateLimit: 2 })
    try {
      const token = await srv.login()
      const pres = []
      for (let i = 0; i < 3; i++) pres.push((await srv.request('POST', '/api/admin/presentation/next', { token })).status)
      assert.deepEqual(pres, [200, 200, 429])

      const admin = []
      for (let i = 0; i < 4; i++) admin.push((await srv.request('GET', '/api/admin/tiers', { token })).status)
      assert.equal(admin.at(-1), 429, `admin statuses ${admin}`)

      const pub = []
      for (let i = 0; i < 3; i++) pub.push((await srv.request('GET', '/api/public/show')).status)
      assert.deepEqual(pub, [200, 200, 429])
      assert.equal((await srv.request('GET', '/api/health')).status, 200, 'health is never limited')
    } finally {
      await srv.close()
    }
  })
})

describe('errors and request ids', () => {
  it('echoes a sane X-Request-Id and puts it in error bodies; replaces unsafe ones', async () => {
    const srv = await startServer()
    try {
      const res = await srv.request('GET', '/api/nope', { headers: { 'X-Request-Id': 'abc-123' } })
      assert.equal(res.headers.get('x-request-id'), 'abc-123')
      assert.equal(res.body.error.requestId, 'abc-123')
      const unsafe = await srv.request('GET', '/api/nope', { headers: { 'X-Request-Id': 'a b<script>' } })
      assert.match(unsafe.headers.get('x-request-id'), /^[0-9a-f-]{36}$/)
    } finally {
      await srv.close()
    }
  })
})

describe('database outage', () => {
  it('keeps serving the cached show, answers 503 DB_UNAVAILABLE for admin writes and health', async () => {
    const srv = await startServer()
    try {
      const token = await srv.login()
      await addStudents((m, r, o) => srv.request(m, r, { ...o, token }), null, [student(1), student(2)])
      const live = await srv.request('GET', '/api/public/show')
      assert.equal(live.status, 200)

      await srv.mongoServer.kill()
      await until(async () => (await srv.request('GET', '/api/health')).status === 503)
      const health = await srv.request('GET', '/api/health')
      assert.deepEqual(health.body, { ok: false, db: 'down' })

      const write = await srv.request('POST', '/api/admin/students', { token, json: student(3) })
      assert.equal(write.status, 503)
      assert.equal(write.body.error.code, 'DB_UNAVAILABLE')
      assert.equal(write.headers.get('retry-after'), '5')
      const login = await srv.request('POST', '/api/auth/login', { json: { email: 'a@gmail.com', password: '123456' } })
      assert.equal(login.status, 503)

      const t0 = Date.now()
      const cached = await srv.request('GET', '/api/public/show')
      assert.equal(cached.status, 200)
      assert.equal(cached.body.totalWinners, 2)
      assert.equal(cached.body.version, live.body.version)
      assert.ok(Date.now() - t0 < 1000, 'served from cache without waiting for the database')
    } finally {
      await srv.close()
    }
  })
})

describe('static client', () => {
  it('serves precompressed assets, immutable hashed assets, no-cache index and the SPA fallback', async () => {
    const dist = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-quest-dist-'))
    const js = 'console.log("hello");'.repeat(200)
    await fsp.mkdir(path.join(dist, 'assets'))
    await fsp.writeFile(path.join(dist, 'index.html'), '<!doctype html><title>x</title>')
    await fsp.writeFile(path.join(dist, 'assets', 'app-abc123.js'), js)
    await fsp.writeFile(path.join(dist, 'assets', 'app-abc123.js.br'), zlib.brotliCompressSync(js))
    await fsp.writeFile(path.join(dist, 'assets', 'plain-1.js'), js)
    const srv = await startServer({ clientDist: dist })
    try {
      const raw = (route, enc) =>
        fetch(srv.base + route, { headers: enc ? { 'Accept-Encoding': enc } : {}, decompress: false })
      const br = await raw('/assets/app-abc123.js', 'gzip, deflate, br')
      assert.equal(br.headers.get('content-encoding'), 'br')
      assert.match(br.headers.get('content-type'), /javascript/)
      assert.equal(br.headers.get('cache-control'), 'public, max-age=31536000, immutable')
      assert.equal(await br.text(), js, 'fetch decodes br transparently')

      const identity = await raw('/assets/app-abc123.js', 'identity')
      assert.equal(identity.headers.get('content-encoding'), null)
      assert.equal(await identity.text(), js)

      const gz = await raw('/assets/plain-1.js', 'gzip')
      assert.equal(gz.headers.get('content-encoding'), 'gzip', 'compression() for assets without a .br/.gz file')
      await gz.text()

      const spa = await raw('/admin/live', 'gzip')
      assert.equal(spa.status, 200)
      assert.equal(spa.headers.get('cache-control'), 'no-cache')
      await spa.text()
      assert.equal((await srv.request('GET', '/api/does-not-exist')).status, 404)
    } finally {
      await srv.close()
      await fsp.rm(dist, { recursive: true, force: true })
    }
  })
})

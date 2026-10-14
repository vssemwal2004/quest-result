import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { createLoginLockout } from '../src/auth.js'
import { ADMIN, startMemoryMongo, startServer } from './helpers/server.js'

describe('auth', () => {
  let srv
  before(async () => {
    srv = await startServer()
  })
  after(() => srv.close())

  it('health is public', async () => {
    const res = await srv.request('GET', '/api/health')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true, db: 'up' })
  })

  it('logs in with the seeded admin (case-insensitive email) and returns an HS256 JWT', async () => {
    const res = await srv.request('POST', '/api/auth/login', { json: { email: ' A@Gmail.com ', password: ADMIN.password } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.user, { email: ADMIN.email })
    const decoded = jwt.decode(res.body.token, { complete: true })
    assert.equal(decoded.header.alg, 'HS256')
    assert.equal(decoded.payload.email, ADMIN.email)
    assert.ok(decoded.payload.sub)
    assert.equal(decoded.payload.exp - decoded.payload.iat, 12 * 3600)

    const me = await srv.request('GET', '/api/auth/me', { token: res.body.token })
    assert.equal(me.status, 200)
    assert.deepEqual(me.body, { user: { email: ADMIN.email } })
  })

  it('rejects wrong password and unknown email with 401 INVALID_CREDENTIALS', async () => {
    for (const json of [
      { email: ADMIN.email, password: 'nope' },
      { email: 'b@gmail.com', password: ADMIN.password },
    ]) {
      const res = await srv.request('POST', '/api/auth/login', { json })
      assert.equal(res.status, 401)
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
    }
  })

  it('validates the login body', async () => {
    const res = await srv.request('POST', '/api/auth/login', { json: { email: '' } })
    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'VALIDATION')
    assert.ok(Array.isArray(res.body.error.details))
  })

  it('answers 401 UNAUTHORIZED without, with garbage, or with a foreign token', async () => {
    const foreign = jwt.sign({ sub: 'x', email: ADMIN.email }, 'some-other-secret-that-is-long-enough')
    for (const token of [undefined, 'garbage', foreign]) {
      const res = await srv.request('GET', '/api/admin/students', { token })
      assert.equal(res.status, 401)
      assert.equal(res.body.error.code, 'UNAUTHORIZED')
    }
  })

  it('returns JSON 404 for unknown API routes and 400 for malformed JSON', async () => {
    const res = await srv.request('GET', '/api/nope')
    assert.equal(res.status, 404)
    assert.equal(res.body.error.code, 'NOT_FOUND')

    const bad = await fetch(srv.base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).error.code, 'INVALID_JSON')
  })

  it('sends security headers with the required CSP', async () => {
    const res = await srv.request('GET', '/api/health')
    const csp = res.headers.get('content-security-policy')
    for (const part of [
      "default-src 'self'",
      "script-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "worker-src 'self' blob:",
    ]) {
      assert.ok(csp.includes(part), `CSP missing ${part}: ${csp}`)
    }
    assert.ok(!csp.includes('upgrade-insecure-requests'))
    assert.ok(csp.includes("frame-ancestors 'self'"))
    assert.equal(res.headers.get('x-powered-by'), null)
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.match(res.headers.get('x-request-id'), /^[\w.-]+$/)
  })

  it('changes the password (wrong current password is a 400, not a 401)', async () => {
    const token = await srv.login()
    const wrong = await srv.request('POST', '/api/auth/change-password', {
      token,
      json: { currentPassword: 'bad', newPassword: 'abcdef' },
    })
    assert.equal(wrong.status, 400)
    assert.equal(wrong.body.error.code, 'INVALID_CURRENT_PASSWORD')

    const short = await srv.request('POST', '/api/auth/change-password', {
      token,
      json: { currentPassword: ADMIN.password, newPassword: '123' },
    })
    assert.equal(short.status, 400)

    const ok = await srv.request('POST', '/api/auth/change-password', {
      token,
      json: { currentPassword: ADMIN.password, newPassword: 'quest-2026' },
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.ok, true)
    await assert.rejects(srv.login(ADMIN.email, ADMIN.password))
    assert.ok(await srv.login(ADMIN.email, 'quest-2026'))
    const stored = JSON.stringify(await mongoose.connection.db.collection('admins').find().toArray())
    assert.ok(!stored.includes('quest-2026'), 'only the bcrypt hash is stored')

    // Tokens issued before the change are revoked; the one returned by change-password works.
    assert.equal((await srv.request('GET', '/api/auth/me', { token })).status, 401)
    assert.equal((await srv.request('GET', '/api/admin/students', { token })).status, 401)
    assert.equal((await srv.request('GET', '/api/auth/me', { token: ok.body.token })).status, 200)
  })

  it('rejects tokens with a wrong issuer / audience / algorithm even when signed with the right secret', async () => {
    const token = await srv.login(ADMIN.email, 'quest-2026')
    const { payload } = jwt.decode(token, { complete: true })
    const secret = await srv.ctx.repo.meta.getOrCreateJwtSecret({ envSecret: null, nodeEnv: 'test' })
    const { iss: _i, aud: _a, iat: _t, exp: _e, ...claims } = payload
    for (const bad of [
      jwt.sign(claims, secret, { issuer: 'someone-else', audience: 'ai-quest', expiresIn: '1h' }),
      jwt.sign(claims, secret, { issuer: 'ai-quest', audience: 'other', expiresIn: '1h' }),
      jwt.sign(claims, secret, { algorithm: 'HS512', issuer: 'ai-quest', audience: 'ai-quest', expiresIn: '1h' }),
      jwt.sign(claims, secret, { issuer: 'ai-quest', audience: 'ai-quest', expiresIn: -60 }),
    ]) {
      assert.equal((await srv.request('GET', '/api/auth/me', { token: bad })).status, 401)
    }
    const good = jwt.sign(claims, secret, { issuer: 'ai-quest', audience: 'ai-quest', expiresIn: '1h' })
    assert.equal((await srv.request('GET', '/api/auth/me', { token: good })).status, 200)
  })
})

describe('auth: rate limit and persistence', () => {
  it('limits login attempts per IP', async () => {
    const srv = await startServer({ loginRateLimit: 3 })
    try {
      const statuses = []
      for (let i = 0; i < 4; i++) {
        statuses.push((await srv.request('POST', '/api/auth/login', { json: { email: 'x@y.z', password: 'x' } })).status)
      }
      assert.deepEqual(statuses, [401, 401, 401, 429])
    } finally {
      await srv.close()
    }
  })

  it('locks an email after 8 failed attempts with the same answer (no user enumeration)', async () => {
    const srv = await startServer({ loginRateLimit: 1000, loginLockoutFailures: 8, loginLockoutMs: 60_000 })
    try {
      const attempt = (email, password) => srv.request('POST', '/api/auth/login', { json: { email, password } })
      for (let i = 0; i < 8; i++) assert.equal((await attempt(ADMIN.email, 'wrong')).status, 401)
      // Locked: even the right password is refused, with the very same response.
      const locked = await attempt(ADMIN.email, ADMIN.password)
      assert.equal(locked.status, 401)
      assert.equal(locked.body.error.code, 'INVALID_CREDENTIALS')
      // Unknown emails behave identically (lock applies per email string, existing or not).
      for (let i = 0; i < 8; i++) await attempt('nobody@example.com', 'x')
      const ghost = await attempt('nobody@example.com', 'x')
      assert.deepEqual([ghost.status, ghost.body.error.code], [401, 'INVALID_CREDENTIALS'])
      // Other emails are unaffected.
      assert.equal((await attempt('other@example.com', 'x')).status, 401)
      srv.ctx.auth.lockout.succeed(ADMIN.email) // (lock expiry is covered by the unit test below)
      assert.equal((await attempt(ADMIN.email, ADMIN.password)).status, 200)
    } finally {
      await srv.close()
    }
  })

  it('persists the JWT secret and data across restarts', async () => {
    const mongo = await startMemoryMongo()
    let token
    try {
      const first = await startServer({ mongo, dbName: 'restart_test' })
      try {
        token = await first.login()
        await first.request('POST', '/api/admin/students', { token, json: { rank: 1, name: 'Asha', school: 'S' } })
      } finally {
        await first.close()
      }
    } catch (err) {
      await mongo.stop()
      throw err
    }

    const second = await startServer({ mongo, dbName: 'restart_test' }).catch(async (err) => {
      await mongo.stop()
      throw err
    })
    try {
      const res = await second.request('GET', '/api/admin/students', { token })
      assert.equal(res.status, 200)
      assert.deepEqual(
        res.body.students.map((s) => s.name),
        ['Asha'],
      )
    } finally {
      await second.close()
      await mongo.stop()
    }
  })

  it('uses JWT_SECRET when provided', async () => {
    const srv = await startServer({ jwtSecret: 'x'.repeat(40) })
    try {
      const token = await srv.login()
      assert.doesNotThrow(() => jwt.verify(token, 'x'.repeat(40), { algorithms: ['HS256'] }))
    } finally {
      await srv.close()
    }
  })
})

describe('login lockout (unit)', () => {
  it('locks after N failures for lockMs, then forgets; success resets the counter', () => {
    let t = 0
    const lock = createLoginLockout({ maxFailures: 3, lockMs: 1000, now: () => t })
    lock.fail('A@x.io ')
    lock.fail('a@x.io')
    assert.equal(lock.isLocked('a@x.io'), false)
    lock.succeed('a@x.io')
    lock.fail('a@x.io')
    lock.fail('a@x.io')
    assert.equal(lock.isLocked('a@x.io'), false, 'success reset the counter')
    lock.fail('a@x.io')
    assert.equal(lock.isLocked('a@x.io'), true)
    t = 999
    assert.equal(lock.isLocked('a@x.io'), true)
    t = 1001
    assert.equal(lock.isLocked('a@x.io'), false)
  })

  it('stays bounded under a spray of random emails', () => {
    const lock = createLoginLockout({ maxEntries: 50 })
    for (let i = 0; i < 500; i++) lock.fail(`u${i}@x.io`)
    assert.ok(lock.size <= 50)
  })
})

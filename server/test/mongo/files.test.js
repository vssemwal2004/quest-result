import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import express from 'express'
import mongoose from 'mongoose'
import { errorHandler } from '../../src/errors.js'
import { deleteFile, deleteFiles, findFile, readFileBuffer, saveBuffer, serveUpload } from '../../src/db/files.js'
import { listen, quietLogger, startMongo, TINY_PNG } from './helpers.js'

let mongo
let http
before(async () => {
  mongo = await startMongo()
  const app = express()
  app.get('/uploads/:id', serveUpload({ logger: quietLogger }))
  app.use(errorHandler(quietLogger))
  http = await listen(app)
})
after(async () => {
  await http?.close()
  await mongo?.stop()
})

const get = (path, headers = {}) => fetch(http.base + path, { headers })

describe('GridFS files', () => {
  test('saveBuffer stores bytes + metadata', async () => {
    const id = await saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', originalName: '17.png', kind: 'photo', studentId: 'abc' })
    const file = await findFile(id)
    assert.equal(file.length, TINY_PNG.length)
    assert.deepEqual(file.metadata, { kind: 'photo', contentType: 'image/png', originalName: '17.png', studentId: 'abc' })
    assert.ok((await readFileBuffer(id)).equals(TINY_PNG))
    await assert.rejects(saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', kind: 'banner' }), TypeError)
  })

  test('GET /uploads/:id streams with immutable caching and an ETag', async () => {
    const id = await saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', originalName: 'a.png', kind: 'logo' })
    const res = await get(`/uploads/${id}`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal(res.headers.get('etag'), `"${id}"`)
    assert.equal(res.headers.get('content-length'), String(TINY_PNG.length))
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(TINY_PNG))
  })

  test('If-None-Match → 304 without a body (quoted, weak, list and * forms)', async () => {
    const id = await saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', kind: 'photo' })
    for (const inm of [`"${id}"`, `W/"${id}"`, `"other", "${id}"`, '*']) {
      const res = await get(`/uploads/${id}`, { 'If-None-Match': inm })
      assert.equal(res.status, 304, inm)
      assert.equal(res.headers.get('etag'), `"${id}"`)
      assert.equal((await res.arrayBuffer()).byteLength, 0)
    }
    const miss = await get(`/uploads/${id}`, { 'If-None-Match': '"something-else"' })
    assert.equal(miss.status, 200)
    await miss.arrayBuffer()
  })

  test('SVG logos get a sandboxing CSP', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const id = await saveBuffer({ buffer: svg, contentType: 'image/svg+xml', kind: 'logo' })
    const res = await get(`/uploads/${id}`)
    assert.equal(res.headers.get('content-type'), 'image/svg+xml')
    assert.match(res.headers.get('content-security-policy'), /sandbox/)
    await res.arrayBuffer()
  })

  test('invalid or unknown ids → 404 NOT_FOUND JSON', async () => {
    for (const path of ['/uploads/not-an-id', '/uploads/0123456789abcdef01234567', '/uploads/photos%2Fx.jpg', '/uploads/abcdefabcdef']) {
      const res = await get(path)
      assert.equal(res.status, 404, path)
      const body = await res.json()
      assert.equal(body.error.code, 'NOT_FOUND')
      assert.equal(res.headers.get('cache-control')?.includes('immutable') ?? false, false)
    }
  })

  test('deleteFile removes the file (then 404) and ignores missing / invalid ids', async () => {
    const id = await saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', kind: 'photo' })
    assert.equal(await deleteFile(id), true)
    assert.equal(await findFile(id), null)
    assert.equal((await get(`/uploads/${id}`)).status, 404)
    assert.equal(await deleteFile(id), false)
    assert.equal(await deleteFile('0123456789abcdef01234567'), false)
    assert.equal(await deleteFile(null), false)
    assert.equal(await deleteFile('garbage'), false)
    await deleteFiles([id, null, undefined, 'garbage'])
  })

  test('chunks are removed with the file', async () => {
    const big = Buffer.alloc(600 * 1024, 7) // > 2 chunks of 255 KB
    const id = await saveBuffer({ buffer: big, contentType: 'image/jpeg', kind: 'photo' })
    const chunks = () => mongoose.connection.db.collection('uploads.chunks').countDocuments({ files_id: id })
    assert.equal(await chunks(), 3)
    const res = await get(`/uploads/${id}`)
    assert.equal(Buffer.from(await res.arrayBuffer()).length, big.length)
    await deleteFile(id)
    assert.equal(await chunks(), 0)
  })
})

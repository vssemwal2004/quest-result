import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { addStudents, fileForm, startServer, storedFileCount, student, TINY_PNG, UPLOAD_URL_RE } from './helpers/server.js'

let srv
let token
before(async () => {
  srv = await startServer()
  token = await srv.login()
})
after(() => srv.close())

const api = (method, route, opts = {}) => srv.request(method, route, { ...opts, token })
const fetchStatus = async (url) => (await fetch(srv.base + url)).status

beforeEach(async () => {
  await api('DELETE', '/api/admin/students', { json: { confirm: 'DELETE ALL' } })
})

describe('student CRUD', () => {
  it('creates, trims, lists sorted by rank and searches', async () => {
    const res = await api('POST', '/api/admin/students', {
      json: { rank: '5', name: '  Riya Negi ', school: ' Pine School ', city: '', score: '91.5' },
    })
    assert.equal(res.status, 201)
    assert.deepEqual(
      { rank: res.body.student.rank, name: res.body.student.name, school: res.body.student.school },
      { rank: 5, name: 'Riya Negi', school: 'Pine School' },
    )
    assert.equal(res.body.student.city, null)
    assert.equal(res.body.student.score, 91.5)
    assert.equal(res.body.student.photoUrl, null)

    await addStudents(api, null, [student(2, { city: 'Dehradun' }), student(9)])
    const list = await api('GET', '/api/admin/students')
    assert.deepEqual(
      list.body.students.map((s) => s.rank),
      [2, 5, 9],
    )

    const byCity = await api('GET', '/api/admin/students?q=dehra')
    assert.deepEqual(
      byCity.body.students.map((s) => s.rank),
      [2],
    )
    const byRank = await api('GET', '/api/admin/students?q=9')
    assert.deepEqual(
      byRank.body.students.map((s) => s.rank),
      [9],
    )
  })

  it('rejects invalid input with 400 VALIDATION', async () => {
    for (const json of [
      { rank: 'abc', name: 'A', school: 'S' },
      { rank: 0, name: 'A', school: 'S' },
      { rank: 1.5, name: 'A', school: 'S' },
      { rank: 1, name: '   ', school: 'S' },
      { rank: 1, name: 'A', school: 'S', score: 'high' },
      { rank: 1, name: 'x'.repeat(121), school: 'S' },
    ]) {
      const res = await api('POST', '/api/admin/students', { json })
      assert.equal(res.status, 400, JSON.stringify(json))
      assert.equal(res.body.error.code, 'VALIDATION')
    }
  })

  it('enforces unique ranks on create and update (409 RANK_TAKEN)', async () => {
    const [a, b] = await addStudents(api, null, [student(1), student(2)])
    const dup = await api('POST', '/api/admin/students', { json: student(1) })
    assert.equal(dup.status, 409)
    assert.equal(dup.body.error.code, 'RANK_TAKEN')
    assert.equal(dup.body.error.details.studentId, a.id)

    const clash = await api('PUT', `/api/admin/students/${b.id}`, { json: { rank: 1 } })
    assert.equal(clash.status, 409)
    assert.equal(clash.body.error.code, 'RANK_TAKEN')

    const same = await api('PUT', `/api/admin/students/${a.id}`, { json: { rank: 1, name: 'Renamed', city: 'Roorkee' } })
    assert.equal(same.status, 200)
    assert.equal(same.body.student.name, 'Renamed')
    assert.equal(same.body.student.city, 'Roorkee')

    const cleared = await api('PUT', `/api/admin/students/${a.id}`, { json: { city: null } })
    assert.equal(cleared.body.student.city, null)
    assert.equal(cleared.body.student.name, 'Renamed')
  })

  it('updates, deletes, and 404s unknown ids', async () => {
    const [a] = await addStudents(api, null, [student(3)])
    assert.equal((await api('PUT', '/api/admin/students/nope', { json: { name: 'x' } })).status, 404)
    assert.equal((await api('PUT', '/api/admin/students/0123456789abcdef01234567', { json: { name: 'x' } })).status, 404)
    assert.equal((await api('DELETE', `/api/admin/students/${a.id}`)).status, 200)
    assert.equal((await api('DELETE', `/api/admin/students/${a.id}`)).status, 404)
  })

  it('delete-all requires the confirmation phrase', async () => {
    await addStudents(api, null, [student(1), student(2)])
    const refused = await api('DELETE', '/api/admin/students', { json: { confirm: 'yes' } })
    assert.equal(refused.status, 400)
    const ok = await api('DELETE', '/api/admin/students', { json: { confirm: 'DELETE ALL' } })
    assert.deepEqual(ok.body, { ok: true, deleted: 2 })
  })
})

describe('photos', () => {
  it('uploads, serves, replaces and deletes a single photo', async () => {
    const [s] = await addStudents(api, null, [student(1)])
    const up = await api('POST', `/api/admin/students/${s.id}/photo`, {
      form: fileForm('photo', [['me.png', TINY_PNG, 'image/png']]),
    })
    assert.equal(up.status, 200)
    const firstUrl = up.body.student.photoUrl
    assert.match(firstUrl, UPLOAD_URL_RE)

    const served = await fetch(srv.base + firstUrl)
    assert.equal(served.status, 200)
    assert.equal(served.headers.get('content-type'), 'image/png')
    assert.match(served.headers.get('cache-control'), /max-age=\d+/)
    assert.ok(Buffer.from(await served.arrayBuffer()).equals(TINY_PNG))
    const revalidated = await fetch(srv.base + firstUrl, { headers: { 'If-None-Match': served.headers.get('etag') } })
    assert.equal(revalidated.status, 304)

    // A PNG saved with a .jpg name is accepted and stored under its real type.
    const replaced = await api('POST', `/api/admin/students/${s.id}/photo`, {
      form: fileForm('photo', [['renamed.jpg', TINY_PNG, 'image/jpeg']]),
    })
    assert.equal(replaced.status, 200)
    const replacedUrl = replaced.body.student.photoUrl
    assert.match(replacedUrl, UPLOAD_URL_RE)
    assert.equal((await fetch(srv.base + replacedUrl)).headers.get('content-type'), 'image/png', 'stored under its real type')
    assert.equal(await fetchStatus(firstUrl), 404, 'old photo removed')

    const removed = await api('DELETE', `/api/admin/students/${s.id}/photo`)
    assert.equal(removed.body.student.photoUrl, null)
    assert.equal(await fetchStatus(replacedUrl), 404)
    assert.equal(await storedFileCount(), 0)
  })

  it('rejects non-images, wrong extensions and unknown students', async () => {
    const [s] = await addStudents(api, null, [student(1)])
    const fake = await api('POST', `/api/admin/students/${s.id}/photo`, {
      form: fileForm('photo', [['evil.png', Buffer.from('<script>alert(1)</script>'), 'image/png']]),
    })
    assert.equal(fake.status, 400)
    assert.equal(fake.body.error.code, 'UNSUPPORTED_FILE')

    const gif = await api('POST', `/api/admin/students/${s.id}/photo`, {
      form: fileForm('photo', [['a.gif', TINY_PNG, 'image/gif']]),
    })
    assert.equal(gif.status, 400)

    const wrongField = await api('POST', `/api/admin/students/${s.id}/photo`, {
      form: fileForm('image', [['a.png', TINY_PNG, 'image/png']]),
    })
    assert.equal(wrongField.status, 400)
    assert.match(wrongField.body.error.message, /expected "photo"/)

    const missing = await api('POST', '/api/admin/students/nope/photo', {
      form: fileForm('photo', [['a.png', TINY_PNG, 'image/png']]),
    })
    assert.equal(missing.status, 404)
    assert.equal(await storedFileCount(), 0, 'nothing stored for rejected uploads')
  })

  it('rejects photos over 5 MB with a clear message', async () => {
    const [s] = await addStudents(api, null, [student(1)])
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(5 * 1024 * 1024)])
    const res = await api('POST', `/api/admin/students/${s.id}/photo`, {
      form: fileForm('photo', [['big.png', big, 'image/png']]),
    })
    assert.equal(res.status, 400)
    assert.match(res.body.error.message, /too large.*5 MB/)
    assert.equal(await storedFileCount(), 0, 'partial GridFS file deleted')
  })

  it('matches bulk photos by rank in the file name', async () => {
    const created = await addStudents(api, null, [student(1), student(2), student(17)])
    const res = await api('POST', '/api/admin/students/photos', {
      form: fileForm('photos', [
        ['1.png', TINY_PNG, 'image/png'],
        ['017.PNG', TINY_PNG, 'image/png'],
        ['99.png', TINY_PNG, 'image/png'],
        ['team photo.png', TINY_PNG, 'image/png'],
        ['01.png', TINY_PNG, 'image/png'],
      ]),
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.matched, 2)
    assert.deepEqual(res.body.unmatched.sort(), ['01.png', '99.png', 'team photo.png'])

    const list = (await api('GET', '/api/admin/students')).body.students
    const byRank = Object.fromEntries(list.map((s) => [s.rank, s.photoUrl]))
    assert.ok(byRank[1] && byRank[17])
    assert.equal(byRank[2], null)
    assert.equal(await storedFileCount(), 2, 'unmatched files never stored')

    // Deleting a student deletes their photo file too.
    await api('DELETE', `/api/admin/students/${created[0].id}`)
    assert.equal(await fetchStatus(byRank[1]), 404)
  })
})

describe('CSV template and export', () => {
  it('serves the template with BOM and sample rows', async () => {
    const res = await api('GET', '/api/admin/students/template.csv')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/csv/)
    assert.match(res.headers.get('content-disposition'), /attachment/)
    assert.ok(res.body.startsWith('rank,name,school,city,score\r\n'))
    assert.equal(res.body.trim().split('\r\n').length, 4)
    // fetch's text() strips the BOM, so check the raw bytes.
    const raw = await fetch(srv.base + '/api/admin/students/template.csv', { headers: { Authorization: `Bearer ${token}` } })
    assert.deepEqual([...new Uint8Array(await raw.arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf])
  })

  it('exports all students with proper escaping and formula protection', async () => {
    await addStudents(api, null, [
      { rank: 2, name: 'Ira "Ace" Joshi', school: 'Pine, Valley School', city: 'Dehradun', score: 88 },
      { rank: 1, name: '=HYPERLINK("x")', school: 'S', score: null },
    ])
    const res = await api('GET', '/api/admin/students/export.csv')
    const lines = res.body.replace(/^﻿/, '').trim().split('\r\n')
    assert.deepEqual(lines, [
      'rank,name,school,city,score',
      `1,"'=HYPERLINK(""x"")",S,,`,
      '2,"Ira ""Ace"" Joshi","Pine, Valley School",Dehradun,88',
    ])
  })

  it('requires auth for downloads', async () => {
    const res = await srv.request('GET', '/api/admin/students/export.csv')
    assert.equal(res.status, 401)
  })
})

describe('validation hardening', () => {
  it('rejects unknown body keys but tolerates echoed read-only fields', async () => {
    const extra = await api('POST', '/api/admin/students', { json: { ...student(4), isAdmin: true } })
    assert.equal(extra.status, 400)
    assert.equal(extra.body.error.code, 'VALIDATION')
    const echoed = await api('POST', '/api/admin/students', {
      json: { ...student(4), id: 'x', photoUrl: '/uploads/evil', createdAt: 'x', updatedAt: 'x' },
    })
    assert.equal(echoed.status, 201)
    assert.equal(echoed.body.student.photoUrl, null)
    assert.match(echoed.body.student.id, /^[0-9a-f]{24}$/)
    const put = await api('PUT', `/api/admin/students/${echoed.body.student.id}`, { json: { $set: { rank: 9 } } })
    assert.equal(put.status, 400)
  })

  it('malformed ids are 404 NOT_FOUND everywhere (never a CastError 500)', async () => {
    for (const [method, route] of [
      ['PUT', '/api/admin/students/zzz'],
      ['DELETE', '/api/admin/students/123'],
      ['DELETE', '/api/admin/students/abc/photo'],
      ['PUT', '/api/admin/tiers/not-an-id'],
      ['DELETE', '/api/admin/tiers/%24where'],
      ['GET', '/uploads/zzz'],
    ]) {
      const res = await api(method, route, { json: method === 'PUT' ? { name: 'x' } : undefined })
      assert.equal(res.status, 404, `${method} ${route}`)
      assert.equal(res.body.error.code, 'NOT_FOUND')
    }
  })

  it('limits the search text to 100 characters and treats it literally', async () => {
    await addStudents(api, null, [student(1, { name: 'A.B (c)' }), student(2, { name: 'AxB' })])
    assert.equal((await api('GET', `/api/admin/students?q=${'a'.repeat(101)}`)).status, 400)
    const literal = await api('GET', `/api/admin/students?q=${encodeURIComponent('a.b (')}`)
    assert.deepEqual(literal.body.students.map((s) => s.rank), [1])
    assert.equal((await api('GET', '/api/admin/students?q[$ne]=1')).status, 400)
  })

  it('bulk photos: non-images are reported unmatched, big files stream through, existing photos are replaced', async () => {
    await addStudents(api, null, [student(1), student(2), student(3)])
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(700 * 1024, 1)]) // several GridFS chunks
    const first = await api('POST', '/api/admin/students/photos', {
      form: fileForm('photos', [
        ['1.png', TINY_PNG, 'image/png'],
        ['2.jpg', Buffer.from('not really a jpeg'), 'image/jpeg'],
        ['02.png', big, 'image/png'],
      ]),
    })
    assert.equal(first.status, 200)
    assert.deepEqual([first.body.matched, first.body.unmatched], [2, ['2.jpg']])
    const before = Object.fromEntries((await api('GET', '/api/admin/students')).body.students.map((s) => [s.rank, s.photoUrl]))
    const served = await fetch(srv.base + before[2])
    assert.equal(Buffer.from(await served.arrayBuffer()).length, big.length)

    const second = await api('POST', '/api/admin/students/photos', { form: fileForm('photos[]', [['1.png', TINY_PNG, 'image/png']]) })
    assert.equal(second.body.matched, 1)
    assert.equal(await fetchStatus(before[1]), 404, 'replaced photo deleted')
    assert.equal(await storedFileCount(), 2)

    const none = await api('POST', '/api/admin/students/photos', { form: fileForm('photos', []) })
    assert.equal(none.status, 400)
    assert.equal(none.body.error.code, 'NO_FILE')
  })

  it('rejects JSON bodies over 1 MB with a clean 413', async () => {
    const res = await api('PUT', '/api/admin/settings', { json: { tagline: 'x'.repeat(1_100_000) } })
    assert.equal(res.status, 413)
    assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE')
  })
})

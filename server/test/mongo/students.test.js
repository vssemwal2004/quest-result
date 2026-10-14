import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { HttpError } from '../../src/errors.js'
import { findFile, saveBuffer } from '../../src/db/files.js'
import { Student } from '../../src/db/models/index.js'
import { startMongo, student, TINY_PNG } from './helpers.js'

let mongo
let repo
before(async () => {
  mongo = await startMongo()
  repo = mongo.repo
})
after(async () => {
  await mongo?.stop()
})
beforeEach(async () => {
  await repo.students.deleteAll()
})

const savePhoto = (studentId = null) =>
  saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', originalName: 'p.png', kind: 'photo', studentId })

async function assertRejectsWith(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof HttpError, `expected HttpError, got ${err?.name}: ${err?.message}`)
    assert.equal(err.status, status)
    assert.equal(err.code, code)
    return true
  })
}

describe('students', () => {
  test('create returns the SPEC shape with defaults', async () => {
    const s = await repo.students.create({ rank: 5, name: 'Asha', school: 'GEU School' })
    assert.match(s.id, /^[0-9a-f]{24}$/)
    assert.deepEqual(Object.keys(s), ['id', 'rank', 'name', 'school', 'city', 'score', 'photoUrl', 'createdAt', 'updatedAt'])
    assert.equal(s.city, null)
    assert.equal(s.score, null)
    assert.equal(s.photoUrl, null)
    assert.equal(new Date(s.createdAt).toISOString(), s.createdAt)
  })

  test('duplicate rank on create → 409 RANK_TAKEN with the clash in details', async () => {
    const first = await repo.students.create(student(7))
    await assert.rejects(repo.students.create(student(7, { name: 'Other' })), (err) => {
      assert.ok(err instanceof HttpError)
      assert.equal(err.status, 409)
      assert.equal(err.code, 'RANK_TAKEN')
      assert.equal(err.message, 'Rank 7 is already assigned to Student 7')
      assert.deepEqual(err.details, { rank: 7, studentId: first.id })
      return true
    })
    assert.equal(await repo.students.count(), 1)
  })

  test('duplicate rank on update → RANK_TAKEN; keeping its own rank is fine', async () => {
    await repo.students.create(student(1))
    const b = await repo.students.create(student(2))
    await assertRejectsWith(repo.students.update(b.id, { rank: 1 }), 409, 'RANK_TAKEN')
    const same = await repo.students.update(b.id, { rank: 2, name: 'Renamed' })
    assert.equal(same.name, 'Renamed')
    assert.ok(same.updatedAt >= b.updatedAt)
  })

  test('concurrent creates of the same rank: exactly one wins (unique index)', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => repo.students.create(student(42, { name: `N${i}` }))))
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    for (const r of results.filter((x) => x.status === 'rejected')) assert.equal(r.reason.code, 'RANK_TAKEN')
  })

  test('update ignores undefined keys, can null optional fields; unknown / malformed id → 404', async () => {
    const s = await repo.students.create(student(3, { city: 'Dehradun', score: 91 }))
    const u = await repo.students.update(s.id, { city: null, score: undefined })
    assert.equal(u.city, null)
    assert.equal(u.score, 91)
    await assertRejectsWith(repo.students.update('0123456789abcdef01234567', { name: 'x' }), 404, 'NOT_FOUND')
    await assertRejectsWith(repo.students.update('not-an-id', { name: 'x' }), 404, 'NOT_FOUND')
    assert.equal(await repo.students.get('not-an-id'), null)
  })

  test('schema validation errors become 400 VALIDATION', async () => {
    await assertRejectsWith(repo.students.create({ rank: 1.5, name: 'A', school: 'B' }), 400, 'VALIDATION')
    await assertRejectsWith(repo.students.create({ rank: 1, name: 'x'.repeat(121), school: 'B' }), 400, 'VALIDATION')
  })

  test('list is sorted by rank; search is case-insensitive and regex-escaped', async () => {
    await repo.students.create(student(30, { name: 'Zed (Jr.)', school: 'Alpha', city: 'Roorkee' }))
    await repo.students.create(student(10, { name: 'abc', school: 'Beta', city: null }))
    await repo.students.create(student(20, { name: 'aXc', school: 'Gamma.School', city: 'Dehradun' }))
    assert.deepEqual((await repo.students.list()).map((s) => s.rank), [10, 20, 30])
    assert.deepEqual((await repo.students.list('ABC')).map((s) => s.rank), [10])
    // "." must be literal, not "any character" (would match abc / aXc)
    assert.deepEqual((await repo.students.list('a.c')).map((s) => s.rank), [])
    assert.deepEqual((await repo.students.list('gamma.')).map((s) => s.rank), [20])
    // regex metacharacters do not throw and match literally
    assert.deepEqual((await repo.students.list('(jr.)')).map((s) => s.rank), [30])
    assert.deepEqual(await repo.students.list('.*'), [])
    assert.deepEqual(await repo.students.list('[('), [])
    // city search, digits also match an exact rank
    assert.deepEqual((await repo.students.list('dehra')).map((s) => s.rank), [20])
    assert.deepEqual((await repo.students.list(' 20 ')).map((s) => s.rank), [20])
    assert.equal((await repo.students.list('')).length, 3)
  })

  test('setPhoto replaces and deletes the old file; removePhoto deletes it; delete removes the file', async () => {
    const s = await repo.students.create(student(1))
    const f1 = await savePhoto(s.id)
    const withPhoto = await repo.students.setPhoto(s.id, f1)
    assert.equal(withPhoto.photoUrl, `/uploads/${f1}`)

    const f2 = await savePhoto(s.id)
    const replaced = await repo.students.setPhoto(s.id, f2)
    assert.equal(replaced.photoUrl, `/uploads/${f2}`)
    assert.equal(await findFile(f1), null, 'old photo file deleted')

    const cleared = await repo.students.removePhoto(s.id)
    assert.equal(cleared.photoUrl, null)
    assert.equal(await findFile(f2), null)

    const f3 = await savePhoto(s.id)
    await repo.students.setPhoto(s.id, f3)
    const deleted = await repo.students.delete(s.id)
    assert.equal(deleted.id, s.id)
    assert.equal(await findFile(f3), null, 'photo file removed with the student')
    await assertRejectsWith(repo.students.delete(s.id), 404, 'NOT_FOUND')
  })

  test('setPhoto on an unknown student deletes the new file and throws 404', async () => {
    const f = await savePhoto()
    await assertRejectsWith(repo.students.setPhoto('0123456789abcdef01234567', f), 404, 'NOT_FOUND')
    assert.equal(await findFile(f), null)
  })

  test('deleteAll removes every student and their photo files', async () => {
    const a = await repo.students.create(student(1))
    await repo.students.create(student(2))
    const f = await savePhoto(a.id)
    await repo.students.setPhoto(a.id, f)
    assert.equal(await repo.students.deleteAll(), 2)
    assert.equal(await Student.countDocuments(), 0)
    assert.equal(await findFile(f), null)
    assert.equal(await repo.students.deleteAll(), 0)
  })

  test('assignPhotosByRank matches by rank, replaces old photos, deletes orphans', async () => {
    const a = await repo.students.create(student(1))
    await repo.students.create(student(2))
    const old = await savePhoto(a.id)
    await repo.students.setPhoto(a.id, old)
    const [p1, p2, p9] = await Promise.all([savePhoto(), savePhoto(), savePhoto()])
    const result = await repo.students.assignPhotosByRank(new Map([[1, p1], [2, p2], [9, p9]]))
    assert.deepEqual(result, { matched: 2, orphanedRanks: [9] })
    assert.equal((await repo.students.getByRank(1)).photoUrl, `/uploads/${p1}`)
    assert.equal((await repo.students.getByRank(2)).photoUrl, `/uploads/${p2}`)
    assert.equal(await findFile(old), null)
    assert.equal(await findFile(p9), null)
    assert.deepEqual(await repo.students.listRanks(), [1, 2])
  })
})

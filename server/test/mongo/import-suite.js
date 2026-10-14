/** Shared import tests, run against a replica set (transactions) and a standalone mongod (fallback). */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { findFile, saveBuffer } from '../../src/db/files.js'
import { planImport } from '../../src/importer.js'
import { student, TINY_PNG } from './helpers.js'

const ALL_COLUMNS = { rank: 0, name: 1, school: 2, city: 3, score: 4 }
const row = (rank, extra = {}) => ({ rank, name: `Student ${rank}`, school: `School ${rank % 7}`, city: null, score: null, ...extra })

/** @param {() => ReturnType<import('../../src/db/repository.js').createRepository>} getRepo */
export function defineImportTests(getRepo) {
  beforeEach(async () => {
    await getRepo().students.deleteAll()
  })

  async function seedWithPhoto() {
    const repo = getRepo()
    const s1 = await repo.students.create(student(1, { city: 'Dehradun', score: 99 }))
    const s2 = await repo.students.create(student(2))
    const s3 = await repo.students.create(student(3))
    const photo1 = await saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', kind: 'photo', studentId: s1.id })
    const photo3 = await saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', kind: 'photo', studentId: s3.id })
    await repo.students.setPhoto(s1.id, photo1)
    await repo.students.setPhoto(s3.id, photo3)
    return { s1, s2, s3, photo1, photo3 }
  }

  test('merge: upserts by rank, keeps photos, counts only real changes', async () => {
    const repo = getRepo()
    const { s1, photo1 } = await seedWithPhoto()
    const rows = [
      row(1, { name: 'Renamed One', city: 'Dehradun', score: 99 }), // updated
      row(2), // unchanged
      row(4, { city: 'Haridwar', score: 50 }), // created
    ]
    const expected = planImport(await repo.students.list(), rows, { mode: 'merge', columns: ALL_COLUMNS })
    const result = await repo.students.upsertManyByRank(rows, { mode: 'merge', columns: ALL_COLUMNS })
    assert.deepEqual(result, { created: 1, updated: 1, removed: [] })
    assert.equal(result.created, expected.created)
    assert.equal(result.updated, expected.updated)

    const list = await repo.students.list()
    assert.deepEqual(list.map((s) => s.rank), [1, 2, 3, 4])
    const one = list[0]
    assert.equal(one.id, s1.id, 'same document, not re-created')
    assert.equal(one.name, 'Renamed One')
    assert.equal(one.photoUrl, `/uploads/${photo1}`, 'photo kept on merge')
    const four = list[3]
    assert.equal(four.city, 'Haridwar')
    assert.equal(four.score, 50)
    assert.equal(four.photoUrl, null)
    assert.ok(four.createdAt && four.updatedAt, 'timestamps set on upserted rows')
  })

  test('merge with city/score columns absent leaves existing values untouched', async () => {
    const repo = getRepo()
    await repo.students.create(student(1, { city: 'Dehradun', score: 99 }))
    const result = await repo.students.upsertManyByRank([row(1, { name: 'New Name' }), row(5)], {
      mode: 'merge',
      columns: { rank: 0, name: 1, school: 2 },
    })
    assert.equal(result.created, 1)
    assert.equal(result.updated, 1)
    const [one, five] = await repo.students.list()
    assert.equal(one.city, 'Dehradun')
    assert.equal(one.score, 99)
    assert.equal(five.city, null)
    assert.equal(five.score, null)
  })

  test('replace: removes students not in the file and deletes their photo files', async () => {
    const repo = getRepo()
    const { s3, photo1, photo3 } = await seedWithPhoto()
    const rows = [row(1, { city: 'Dehradun', score: 99 }), row(2, { name: 'Two' }), row(10)]
    const expected = planImport(await repo.students.list(), rows, { mode: 'replace', columns: ALL_COLUMNS })
    const result = await repo.students.upsertManyByRank(rows, { mode: 'replace', columns: ALL_COLUMNS })
    assert.equal(result.created, expected.created)
    assert.equal(result.updated, expected.updated)
    assert.deepEqual(result.removed.map((s) => s.rank), expected.removed.map((s) => s.rank))
    assert.deepEqual(result.removed.map((s) => s.id), [s3.id])
    assert.equal(result.removed[0].photoUrl, `/uploads/${photo3}`)

    assert.deepEqual((await repo.students.list()).map((s) => s.rank), [1, 2, 10])
    assert.equal(await findFile(photo3), null, 'photo of removed student deleted')
    assert.ok(await findFile(photo1), 'photo of kept student untouched')
  })

  test('replace with an identical file is a no-op', async () => {
    const repo = getRepo()
    await repo.students.create(student(1))
    const result = await repo.students.upsertManyByRank([row(1)], { mode: 'replace', columns: ALL_COLUMNS })
    assert.deepEqual(result, { created: 0, updated: 0, removed: [] })
  })

  test('unknown mode is rejected', async () => {
    await assert.rejects(getRepo().students.upsertManyByRank([], { mode: 'wipe' }), TypeError)
  })
}

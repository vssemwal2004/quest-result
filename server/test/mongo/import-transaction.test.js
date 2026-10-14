import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startMongo } from './helpers.js'
import { defineImportTests } from './import-suite.js'

let mongo
before(async () => {
  mongo = await startMongo({ replSet: true })
})
after(async () => {
  await mongo?.stop()
})

describe('import on a replica set (transactions)', () => {
  test('transactions are detected', async () => {
    assert.equal(await mongo.repo.supportsTransactions(), true)
  })

  test('a failing transaction rolls back every write', async () => {
    const { repo } = mongo
    await repo.students.create({ rank: 900, name: 'Keep', school: 'S' })
    await assert.rejects(
      repo.inTransaction(async (session) => {
        const { Student } = await import('../../src/db/models/index.js')
        await Student.deleteMany({ rank: 900 }, { session })
        throw new Error('boom')
      }),
      /boom/,
    )
    assert.equal((await repo.students.getByRank(900))?.name, 'Keep')
    await repo.students.deleteAll()
  })

  defineImportTests(() => mongo.repo)
})

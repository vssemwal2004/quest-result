import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startMongo } from './helpers.js'
import { defineImportTests } from './import-suite.js'

let mongo
before(async () => {
  mongo = await startMongo()
})
after(async () => {
  await mongo?.stop()
})

describe('import on a standalone mongod (ordered fallback)', () => {
  test('transactions are not available', async () => {
    assert.equal(await mongo.repo.supportsTransactions(), false)
  })

  defineImportTests(() => mongo.repo)
})

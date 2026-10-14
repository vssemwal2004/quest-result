import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcryptjs'
import { migrateJsonToMongo } from '../../scripts/migrate-json-to-mongo.js'
import { readFileBuffer } from '../../src/db/files.js'
import { fileIdFromUrl } from '../../src/db/mappers.js'
import { Admin, Student } from '../../src/db/models/index.js'
import { seedMongo } from '../../src/db/seedMongo.js'
import { defaultSettings, presetTiers } from '../../src/seed.js'
import { quietLogger, startMongo, TINY_PNG } from './helpers.js'

let mongo
let dir
before(async () => {
  mongo = await startMongo()
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-quest-migrate-'))
})
after(async () => {
  await mongo?.stop()
  if (dir) await fsp.rm(dir, { recursive: true, force: true })
})

async function writeLegacy() {
  // Shape of the legacy server/data/db.json written by the old JSON store.
  const now = new Date().toISOString()
  const db = {
    schemaVersion: 1,
    meta: { version: 1, createdAt: now },
    admin: { id: 'legacyadmin1', email: 'a@gmail.com', passwordHash: bcrypt.hashSync('legacy-pass', 4), updatedAt: now },
    settings: defaultSettings(now),
    tiers: presetTiers('classic-5'),
    students: [],
    state: { stageIndex: 0, step: 0, stageKey: 'intro', updatedAt: now },
  }
  db.settings.eventTitle = 'Legacy Quest'
  db.settings.logoUrl = '/uploads/branding/logo.png'
  db.students = [
    { id: 'n1', rank: 1, name: 'One', school: 'S1', city: 'Dehradun', score: 99, photoUrl: '/uploads/photos/one.png', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'n2', rank: 2, name: 'Two', school: 'S2', city: null, score: null, photoUrl: '/uploads/photos/missing.png', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]
  await fsp.mkdir(path.join(dir, 'uploads', 'photos'), { recursive: true })
  await fsp.mkdir(path.join(dir, 'uploads', 'branding'), { recursive: true })
  await fsp.writeFile(path.join(dir, 'uploads', 'photos', 'one.png'), TINY_PNG)
  await fsp.writeFile(path.join(dir, 'uploads', 'branding', 'logo.png'), TINY_PNG)
  const file = path.join(dir, 'db.json')
  await fsp.writeFile(file, JSON.stringify(db))
  return file
}

describe('migrate-json-to-mongo', () => {
  test('missing db.json is a no-op', async () => {
    const r = await migrateJsonToMongo({ file: path.join(dir, 'nope.json'), uploadDir: dir, repo: mongo.repo, logger: quietLogger })
    assert.equal(r.skipped, true)
  })

  test('imports students, photos, logo, settings, adopts the legacy admin password; re-run is idempotent', async () => {
    await seedMongo(mongo.repo, { logger: quietLogger }) // server booted first with the default admin
    const file = await writeLegacy()
    const args = { file, uploadDir: path.join(dir, 'uploads'), repo: mongo.repo, logger: quietLogger }

    const dry = await migrateJsonToMongo({ ...args, dryRun: true })
    assert.equal(dry.students.created, 2)
    assert.equal(await Student.countDocuments(), 0, 'dry run writes nothing')

    const first = await migrateJsonToMongo(args)
    assert.equal(first.students.created, 2)
    assert.equal(first.students.photos, 1)
    assert.deepEqual(first.missingFiles, ['/uploads/photos/missing.png'])
    assert.equal(first.settings, true)
    assert.equal(first.logo, true)
    assert.equal(first.admin, 'password adopted from db.json')

    const [one, two] = await mongo.repo.students.list()
    assert.equal(one.createdAt, '2026-01-01T00:00:00.000Z')
    assert.ok((await readFileBuffer(fileIdFromUrl(one.photoUrl))).equals(TINY_PNG))
    assert.equal(two.photoUrl, null)
    const settings = await mongo.repo.settings.get()
    assert.equal(settings.eventTitle, 'Legacy Quest')
    assert.match(settings.logoUrl, /^\/uploads\/[0-9a-f]{24}$/)
    const admin = await Admin.findOne({ email: 'a@gmail.com' }).lean()
    assert.ok(await bcrypt.compare('legacy-pass', admin.passwordHash))
    assert.equal((await mongo.repo.tiers.list()).length, 5)

    const snapshot = JSON.stringify({ s: await mongo.repo.students.list(), t: await mongo.repo.tiers.list(), st: await mongo.repo.settings.get() })
    const second = await migrateJsonToMongo(args)
    assert.deepEqual(second.students, { created: 0, updated: 0, unchanged: 2, photos: 0 })
    assert.deepEqual(second.tiers, { created: 0, updated: 0, pruned: 0 })
    assert.equal(second.settings, false)
    assert.equal(second.logo, false)
    assert.equal(second.admin, 'unchanged')
    assert.equal(second.filesCopied, 0)
    assert.equal(
      JSON.stringify({ s: await mongo.repo.students.list(), t: await mongo.repo.tiers.list(), st: await mongo.repo.settings.get() }),
      snapshot,
    )
  })
})

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { findFile, saveBuffer } from '../../src/db/files.js'
import { AppMeta, AppSettings, ShowState } from '../../src/db/models/index.js'
import { defaultSettings, presetTiers } from '../../src/seed.js'
import { buildPayload, buildStages, nextPosition } from '../../src/show.js'
import { buildOverview } from '../../src/routes/overview.js'
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

const logo = () => saveBuffer({ buffer: TINY_PNG, contentType: 'image/png', kind: 'logo', originalName: 'logo.png' })

describe('settings', () => {
  test('get returns the defaults when nothing is stored (without writing)', async () => {
    const s = await repo.settings.get()
    const { updatedAt: _a, ...rest } = s
    const { updatedAt: _b, ...defaults } = defaultSettings()
    assert.deepEqual(rest, defaults)
    assert.equal(await AppSettings.countDocuments(), 0)
  })

  test('update upserts, merges, validates; no internal fields leak', async () => {
    const s = await repo.settings.update({ eventTitle: 'AI Quest X', autoScrollSpeed: 60, handwrittenLines: ['A', 'B'] })
    assert.equal(s.eventTitle, 'AI Quest X')
    assert.equal(s.autoScrollSpeed, 60)
    assert.deepEqual(s.handwrittenLines, ['A', 'B'])
    assert.equal(s.tagline, defaultSettings().tagline)
    assert.ok(!('logoFileId' in s) && !('_id' in s))
    const s2 = await repo.settings.update({ quality: 'low' })
    assert.equal(s2.eventTitle, 'AI Quest X')
    assert.ok(s2.updatedAt >= s.updatedAt)
    await assert.rejects(repo.settings.update({ autoScrollSpeed: 5000 }), (e) => e.code === 'VALIDATION')
    await assert.rejects(repo.settings.update({ quality: 'ultra' }), (e) => e.code === 'VALIDATION')
    assert.equal(await repo.settings.ensureDefaults(), false, 'doc already exists')
  })

  test('setLogo / removeLogo manage the GridFS file', async () => {
    const f1 = await logo()
    assert.equal((await repo.settings.setLogo(f1)).logoUrl, `/uploads/${f1}`)
    const f2 = await logo()
    assert.equal((await repo.settings.setLogo(f2)).logoUrl, `/uploads/${f2}`)
    assert.equal(await findFile(f1), null, 'previous logo deleted')
    assert.equal((await repo.settings.removeLogo()).logoUrl, null)
    assert.equal(await findFile(f2), null)
    assert.equal((await repo.settings.removeLogo()).logoUrl, null, 'no logo → no-op')
  })
})

describe('show state', () => {
  test('ensure + get + set increments version atomically', async () => {
    assert.equal(await repo.show.ensure(), true)
    assert.equal(await repo.show.ensure(), false)
    const s0 = await repo.show.get()
    assert.deepEqual({ ...s0, updatedAt: 'x' }, { stageIndex: 0, step: 0, stageKey: 'intro', updatedAt: 'x', version: 1 })
    const s1 = await repo.show.set({ stageIndex: 1, step: 0, stageKey: 'tier:abc' })
    assert.equal(s1.version, 2)
    assert.equal(s1.stageKey, 'tier:abc')
    await Promise.all(Array.from({ length: 25 }, () => repo.show.bumpVersion()))
    assert.equal(await repo.show.version(), 27)
    await repo.show.set({ stageIndex: 0, step: 0, stageKey: 'intro' })
  })

  test('transition: CAS loop never loses concurrent Next presses', async () => {
    await repo.tiers.replaceAll(presetTiers('quick-3'))
    for (const r of [4, 5, 6, 1, 2, 3]) await repo.students.create(student(r))
    await repo.show.set({ stageIndex: 0, step: 0, stageKey: 'intro' })
    const next = (snap) => {
      const stages = buildStages(snap)
      const pos = nextPosition(stages, snap.state)
      return { ...pos, stageKey: stages[pos.stageIndex].key }
    }
    const v0 = await repo.show.version()
    await Promise.all(Array.from({ length: 4 }, () => repo.show.transition(next)))
    const s = await repo.show.get()
    // intro(1) → grid tier (2 steps) → podium (1 + 3): 4 presses = stage 2 step 1
    assert.deepEqual([s.stageIndex, s.step], [2, 1])
    assert.equal(s.version, v0 + 4)
    const noop = await repo.show.transition(() => null)
    assert.equal(noop.changed, false)
    assert.equal(await repo.show.version(), v0 + 4)
  })

  test('syncAfterChange clamps to the new stage list, follows the stage by key and bumps version', async () => {
    const before = await repo.show.get()
    assert.equal(before.stageKey.startsWith('tier:'), true)
    await repo.students.deleteAll() // podium now has 0 students → stepCount 1
    const after = await repo.show.syncAfterChange()
    assert.equal(after.stageIndex, 2)
    assert.equal(after.step, 0)
    assert.equal(after.version, before.version + 1)
    assert.notEqual(after.updatedAt, before.updatedAt, 'position moved → updatedAt changes')

    const again = await repo.show.syncAfterChange()
    assert.equal(again.version, after.version + 1)
    assert.equal(again.updatedAt, after.updatedAt, 'no move → updatedAt kept')
  })

  test('loadSnapshot feeds show.js buildPayload and buildOverview unchanged', async () => {
    await repo.students.create(student(1))
    const snap = await repo.loadSnapshot()
    assert.deepEqual(Object.keys(snap).sort(), ['meta', 'settings', 'state', 'students', 'tiers'])
    const payload = buildPayload(snap, { filtered: true })
    assert.equal(payload.version, snap.meta.version)
    assert.equal(payload.totalWinners, 1)
    assert.deepEqual(Object.keys(payload.state), ['stageIndex', 'step', 'updatedAt'])
    const overview = buildOverview(snap, 0)
    assert.equal(overview.studentCount, 1)
    assert.ok(Array.isArray(overview.missingRanks))
    await ShowState.deleteMany({})
    const fresh = await repo.loadSnapshot()
    assert.equal(fresh.meta.stateExists, false)
  })
})

describe('meta', () => {
  test('JWT secret: env wins, otherwise created once and reused', async () => {
    assert.equal(await repo.meta.getOrCreateJwtSecret({ envSecret: 'from-env', nodeEnv: 'production' }), 'from-env')
    const [a, b] = await Promise.all([
      repo.meta.getOrCreateJwtSecret({ envSecret: '', nodeEnv: 'development' }),
      repo.meta.getOrCreateJwtSecret({ envSecret: undefined, nodeEnv: 'development' }),
    ])
    assert.equal(a, b)
    assert.ok(a.length >= 32)
    assert.equal(await repo.meta.getOrCreateJwtSecret({ envSecret: null, nodeEnv: 'test' }), a)
    assert.equal(await AppMeta.countDocuments({ _id: 'jwt-secret' }), 1)
  })

  test('JWT secret: refuses the stored fallback in production', async () => {
    await assert.rejects(repo.meta.getOrCreateJwtSecret({ envSecret: '', nodeEnv: 'production' }), /JWT_SECRET must be set/)
  })
})

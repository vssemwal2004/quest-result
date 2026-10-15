import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { HttpError } from '../../src/errors.js'
import { Tier } from '../../src/db/models/index.js'
import { assertValidTier } from '../../src/routes/tiers.js'
import { presetTiers } from '../../src/seed.js'
import { startMongo } from './helpers.js'

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
  await Tier.deleteMany({})
})

const input = (name, rankFrom, rankTo, extra = {}) => ({
  name,
  subtitle: '',
  rankFrom,
  rankTo,
  prize: '',
  prizeAmount: '',
  style: 'scroll',
  color: '#38bdf8',
  icon: 'award',
  sortDirection: 'asc',
  enabled: true,
  ...extra,
})

describe('tiers', () => {
  test('create appends order, list is sorted by order, SPEC shape', async () => {
    const a = await repo.tiers.create(input('A', 10, 20))
    const b = await repo.tiers.create(input('B', 1, 3, { style: 'podium' }))
    assert.equal(a.order, 0)
    assert.equal(b.order, 1)
    assert.deepEqual(Object.keys(a), [
      'id', 'name', 'subtitle', 'rankFrom', 'rankTo', 'prize', 'prizeAmount', 'podiumPrizes', 'style', 'color', 'icon', 'sortDirection', 'gridPageCounts', 'order', 'enabled',
    ])
    assert.deepEqual((await repo.tiers.list()).map((t) => t.name), ['A', 'B'])
  })

  test('validate hook (assertValidTier) blocks overlaps on create and update', async () => {
    const a = await repo.tiers.create(input('A', 10, 20), { validate: assertValidTier })
    await assert.rejects(repo.tiers.create(input('B', 15, 30), { validate: assertValidTier }), (e) => e instanceof HttpError && e.code === 'TIER_OVERLAP')
    const b = await repo.tiers.create(input('B', 21, 30), { validate: assertValidTier })
    await assert.rejects(repo.tiers.update(b.id, { rankFrom: 20 }, { validate: assertValidTier }), (e) => e.code === 'TIER_OVERLAP')
    // disabled tiers may overlap
    const disabled = await repo.tiers.update(b.id, { rankFrom: 20, enabled: false }, { validate: assertValidTier })
    assert.equal(disabled.enabled, false)
    await assert.rejects(repo.tiers.update(a.id, { style: 'podium' }, { validate: assertValidTier }), (e) => e.status === 400)
    assert.equal(await Tier.countDocuments(), 2)
  })

  test('update / delete unknown → 404; schema enforces enums', async () => {
    await assert.rejects(repo.tiers.update('0123456789abcdef01234567', { name: 'x' }), (e) => e.status === 404)
    await assert.rejects(repo.tiers.delete('nope'), (e) => e.status === 404)
    await assert.rejects(repo.tiers.create(input('Bad', 1, 2, { style: 'carousel' })), (e) => e.code === 'VALIDATION')
    const t = await repo.tiers.create(input('C', 1, 2))
    assert.equal((await repo.tiers.delete(t.id)).id, t.id)
    assert.equal(await repo.tiers.get(t.id), null)
  })

  test('reorder: listed first, others keep relative order; unknown ids → 400', async () => {
    const [a, b, c] = [await repo.tiers.create(input('A', 1, 1)), await repo.tiers.create(input('B', 2, 2)), await repo.tiers.create(input('C', 3, 3))]
    const out = await repo.tiers.reorder([c.id])
    assert.deepEqual(out.map((t) => [t.name, t.order]), [['C', 0], ['A', 1], ['B', 2]])
    await assert.rejects(repo.tiers.reorder([a.id, 'zzz']), (e) => e.status === 400 && /zzz/.test(e.message))
    assert.deepEqual((await repo.tiers.reorder([b.id, a.id, c.id])).map((t) => t.name), ['B', 'A', 'C'])
  })

  test('replaceAll applies a preset (ignores preset ids, keeps order)', async () => {
    await repo.tiers.create(input('Old', 1, 500))
    const out = await repo.tiers.replaceAll(presetTiers('classic-5'))
    assert.deepEqual(out.map((t) => t.name), ['Merit Achievers', 'Rising Innovators', 'AI Explorers', 'Top 20 Stars', 'The Champions'])
    assert.deepEqual(out.map((t) => t.order), [0, 1, 2, 3, 4])
    assert.ok(out.every((t) => /^[0-9a-f]{24}$/.test(t.id)))
    assert.equal(await Tier.countDocuments(), 5)
    const quick = await repo.tiers.replaceAll(presetTiers('quick-3'))
    assert.equal(quick.length, 2)
  })

  test('replaceAll with an invalid tier keeps the old tiers', async () => {
    await repo.tiers.create(input('Old', 1, 5))
    await assert.rejects(repo.tiers.replaceAll([input('Bad', 1, 2, { icon: 'nope' })]), (e) => e.code === 'VALIDATION')
    assert.deepEqual((await repo.tiers.list()).map((t) => t.name), ['Old'])
  })
})

import { Router } from 'express'
import { asyncHandler, HttpError, notFound } from '../errors.js'
import { findPreset, presetTiers, TIER_PRESETS } from '../seed.js'
import { OBJECT_ID_RE, parse, presetSchema, reorderSchema, tierCreateSchema, tierUpdateSchema } from '../validation.js'

export const MAX_PODIUM_SPAN = 4

const rangeLabel = (t) => (t.rankFrom === t.rankTo ? `${t.rankFrom}` : `${t.rankFrom}–${t.rankTo}`)

/** Enforce the tier invariants against the other tiers. Throws 400 / 409. */
export function assertValidTier(tier, otherTiers) {
  if (tier.rankFrom > tier.rankTo) {
    throw new HttpError(400, 'VALIDATION', 'rankTo: "Rank to" must be greater than or equal to "Rank from"', [
      { path: 'rankTo', message: 'Must be ≥ rankFrom' },
    ])
  }
  if (tier.style === 'podium' && tier.rankTo - tier.rankFrom + 1 > MAX_PODIUM_SPAN) {
    throw new HttpError(400, 'VALIDATION', `rankTo: A podium tier can hold at most ${MAX_PODIUM_SPAN} ranks`, [
      { path: 'rankTo', message: `Podium spans at most ${MAX_PODIUM_SPAN} ranks` },
    ])
  }
  if (tier.podiumPrizes !== null && tier.podiumPrizes !== undefined) {
    const entries = tier.podiumPrizes
    const ranks = new Set(Array.isArray(entries) ? entries.map((entry) => entry.rank) : [])
    if (tier.style !== 'podium' || !Array.isArray(entries) || entries.length !== tier.rankTo - tier.rankFrom + 1 || ranks.size !== entries.length || entries.some((entry) => entry.rank < tier.rankFrom || entry.rank > tier.rankTo)) {
      throw new HttpError(400, 'VALIDATION', 'Individual podium prizes must have exactly one entry for each rank in this podium tier', [
        { path: 'podiumPrizes', message: 'Include every podium rank exactly once' },
      ])
    }
  }
  if (tier.gridPageCounts !== null && tier.gridPageCounts !== undefined) {
    const validStyle = tier.style === 'grid' || tier.style === 'scroll'
    const counts = tier.gridPageCounts
    const total = Array.isArray(counts) ? counts.reduce((sum, count) => sum + count, 0) : NaN
    if (!validStyle || !Array.isArray(counts) || counts.length < 1 || counts.some((count) => !Number.isInteger(count) || count < 1 || count > 25) || total !== tier.rankTo - tier.rankFrom + 1) {
      throw new HttpError(400, 'VALIDATION', 'Grid pages must cover every rank exactly once, with 1–25 ranks per page', [
        { path: 'gridPageCounts', message: 'Page counts must total the tier rank range; each page holds 1–25 ranks' },
      ])
    }
  }
  if (!tier.enabled) return
  const clash = otherTiers.find((o) => o.enabled && o.rankFrom <= tier.rankTo && tier.rankFrom <= o.rankTo)
  if (clash) {
    throw new HttpError(
      409,
      'TIER_OVERLAP',
      `Ranks ${rangeLabel(tier)} overlap with "${clash.name}" (${rangeLabel(clash)})`,
      { tierId: clash.id, tierName: clash.name, rankFrom: clash.rankFrom, rankTo: clash.rankTo },
    )
  }
}

export function tierRoutes({ repo, changed }) {
  const router = Router()

  router.param('id', (_req, _res, next, id) => (OBJECT_ID_RE.test(id) ? next() : next(notFound('Tier'))))

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'no-store').json({ tiers: await repo.tiers.list() })
    }),
  )

  router.get('/presets', (_req, res) => {
    res.json({
      presets: TIER_PRESETS.map((p) => ({ key: p.key, name: p.name, description: p.description, tiers: p.tiers() })),
    })
  })

  router.post(
    '/apply-preset',
    asyncHandler(async (req, res) => {
      const { key } = parse(presetSchema, req.body)
      if (!findPreset(key)) throw new HttpError(404, 'PRESET_NOT_FOUND', `Unknown preset "${key}"`)
      const tiers = await repo.tiers.replaceAll(presetTiers(key))
      await changed()
      res.json({ tiers })
    }),
  )

  router.post(
    '/reorder',
    asyncHandler(async (req, res) => {
      const { ids } = parse(reorderSchema, req.body)
      const tiers = await repo.tiers.reorder(ids) // 400 VALIDATION for unknown ids
      await changed()
      res.json({ tiers })
    }),
  )

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parse(tierCreateSchema, req.body)
      const tier = await repo.tiers.create(input, { validate: assertValidTier })
      await changed()
      res.status(201).json({ tier })
    }),
  )

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const input = parse(tierUpdateSchema, req.body)
      const tier = await repo.tiers.update(req.params.id, input, { validate: assertValidTier })
      await changed()
      res.json({ tier })
    }),
  )

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await repo.tiers.delete(req.params.id)
      await changed()
      res.json({ ok: true })
    }),
  )

  return router
}

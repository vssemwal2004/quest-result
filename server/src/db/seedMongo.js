/**
 * First-boot seeding on MongoDB. Every step only writes when its collection / document is missing,
 * so it is safe to run on every boot and from several instances at once.
 * Defaults and presets come from ../seed.js (single source of truth).
 */
import { DEFAULT_ADMIN, presetTiers } from '../seed.js'
import { META_IDS, Tier } from './models/index.js'

export const DEFAULT_TIER_PRESET = 'classic-5'

/** Upgrade only an untouched legacy Top 4 preset; keep custom tiers and individual prizes intact. */
async function upgradeLegacyChampions() {
  const champion = await Tier.findOne({
    name: 'The Champions', rankFrom: 1, rankTo: 4, style: 'podium',
    podiumMode: { $exists: false }, podiumPrizes: null,
    prize: 'Cash Prizes + Exciting Scholarships', prizeAmount: 'Up to ₹1 Lakh',
  }).lean()
  if (!champion) return false

  const previous = await Tier.findOne({ order: champion.order - 1, rankFrom: 5, podiumMode: { $exists: false } }).lean()
  const oldPreset = [
    ['Top 20 Stars', 20, 'spotlight'],
    ['Top 10 Stars', 10, 'spotlight'],
    ['AI Quest Winners', 200, 'grid'],
  ]
  if (!previous || !oldPreset.some(([name, to, style]) => previous.name === name && previous.rankTo === to && previous.style === style)) return false

  await Tier.updateOne({ _id: champion._id, rankTo: 4, podiumMode: { $exists: false } }, {
    $set: { rankTo: 3, podiumMode: 'hybrid', ...(champion.subtitle === 'Ranks 1 – 4' ? { subtitle: 'Ranks 1 – 3' } : {}) },
  })
  await Tier.updateOne({ _id: previous._id, rankFrom: 5 }, {
    $set: { rankFrom: 4, ...(previous.subtitle === `Ranks 5 – ${previous.rankTo}` ? { subtitle: `Ranks 4 – ${previous.rankTo}` } : {}) },
  })
  return true
}

/**
 * @param {ReturnType<import('./repository.js').createRepository>} repo
 * @param {{ adminEmail?: string, adminPassword?: string, logger?: Console }} [options]
 * @returns {Promise<{ admin: boolean, settings: boolean, tiers: boolean, showState: boolean }>} what was created
 */
export async function seedMongo(
  repo,
  { adminEmail = DEFAULT_ADMIN.email, adminPassword = DEFAULT_ADMIN.password, logger = console } = {},
) {
  await repo.init()
  const created = { admin: false, settings: false, tiers: false, showState: false }

  created.admin = (await repo.admins.seedIfEmpty({ email: adminEmail, password: adminPassword })).created
  created.settings = await repo.settings.ensureDefaults()

  // Tiers are seeded once per database: an admin who deliberately deletes every tier
  // must not get classic-5 back on the next restart. The marker lives in app_meta.
  const marker = await repo.meta.get(META_IDS.seed)
  if (!marker?.tiers) {
    if ((await repo.tiers.count()) === 0) {
      await repo.tiers.replaceAll(presetTiers(DEFAULT_TIER_PRESET))
      created.tiers = true
    }
    await repo.meta.set(META_IDS.seed, { ...(marker ?? {}), tiers: true, at: new Date().toISOString() })
  }

  created.showState = await repo.show.ensure()
  if (await upgradeLegacyChampions()) {
    await repo.show.syncAfterChange()
    logger.info?.('[db] upgraded the default Champions tier to Top 3 Hybrid')
  }

  const what = Object.entries(created)
    .filter(([, v]) => v)
    .map(([k]) => k)
  if (what.length) logger.info?.(`[db] seeded: ${what.join(', ')}`)
  return created
}

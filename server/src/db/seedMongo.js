/**
 * First-boot seeding on MongoDB. Every step only writes when its collection / document is missing,
 * so it is safe to run on every boot and from several instances at once.
 * Defaults and presets come from ../seed.js (single source of truth).
 */
import { DEFAULT_ADMIN, presetTiers } from '../seed.js'
import { META_IDS } from './models/index.js'

export const DEFAULT_TIER_PRESET = 'classic-5'

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

  const what = Object.entries(created)
    .filter(([, v]) => v)
    .map(([k]) => k)
  if (what.length) logger.info?.(`[db] seeded: ${what.join(', ')}`)
  return created
}

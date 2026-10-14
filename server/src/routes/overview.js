import { Router } from 'express'
import { asyncHandler } from '../errors.js'
import { inTier, publicState, sortTiers } from '../show.js'

/**
 * Admin dashboard data: tier fill levels, gaps in the rank list and students outside every tier.
 * maxRank is the highest rank the enabled tiers cover (or the highest student rank when no tier
 * is enabled), so a single mistyped rank like 99999 shows up as "unassigned" instead of
 * producing a 100k-entry missingRanks list.
 * @param {{ tiers: any[], students: any[], state: any }} db snapshot (repo.loadSnapshot())
 */
export function buildOverview(db, viewers) {
  const enabled = db.tiers.filter((t) => t.enabled)
  const ranks = new Set(db.students.map((s) => s.rank))
  const maxRank = enabled.length ? Math.max(...enabled.map((t) => t.rankTo)) : Math.max(0, ...ranks)
  const missingRanks = []
  for (let r = 1; r <= maxRank; r++) if (!ranks.has(r)) missingRanks.push(r)

  return {
    studentCount: db.students.length,
    tierCount: db.tiers.length,
    tiers: sortTiers(db.tiers).map((tier) => ({
      tier,
      studentCount: db.students.filter((s) => inTier(tier, s.rank)).length,
      expected: tier.rankTo - tier.rankFrom + 1,
    })),
    unassignedStudents: db.students
      .filter((s) => !enabled.some((t) => inTier(t, s.rank)))
      .sort((a, b) => a.rank - b.rank),
    missingRanks,
    viewers,
    state: publicState(db.state),
  }
}

export function overviewRoutes({ cache, realtime }) {
  const router = Router()

  router.get(
    '/overview',
    asyncHandler(async (_req, res) => {
      const [snapshot, viewers] = await Promise.all([cache.snapshot(), realtime.viewerCount()])
      res.set('Cache-Control', 'no-store').json(buildOverview(snapshot, viewers))
    }),
  )

  // Unfiltered payload for admin preview / rehearsal.
  router.get(
    '/show',
    asyncHandler(async (_req, res) => {
      const { json } = await cache.adminJson()
      res.set('Cache-Control', 'no-store').type('application/json; charset=utf-8').send(json)
    }),
  )

  return router
}

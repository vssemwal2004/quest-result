import { Router } from 'express'
import { asyncHandler } from '../errors.js'
import {
  buildStages,
  gotoPosition,
  nextPosition,
  prevPosition,
  publicState,
  reconcileState,
  resetPosition,
  samePosition,
} from '../show.js'
import { gotoSchema, parse } from '../validation.js'

export function presentationRoutes({ repo, cache, realtime }) {
  const router = Router()

  /**
   * Apply a navigation function atomically (compare-and-swap on the show version, so concurrent clicks
   * from two admin screens are never lost). No-ops (e.g. Next on the last step) do not write or broadcast.
   */
  async function move(compute) {
    const result = await repo.show.transition((snap) => {
      const stages = buildStages(snap)
      const current = reconcileState(snap.state, stages)
      const pos = compute(stages, current)
      const stageKey = stages[pos.stageIndex].key
      return samePosition(pos, snap.state) && stageKey === snap.state.stageKey ? null : { ...pos, stageKey }
    })
    if (result.changed) {
      cache.invalidate()
      realtime.broadcastShow()
    }
    return { state: publicState(result.state) }
  }

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const [snap, viewers] = await Promise.all([cache.snapshot(), realtime.viewerCount()])
      res.set('Cache-Control', 'no-store').json({ state: publicState(snap.state), stages: buildStages(snap), viewers })
    }),
  )

  const handle = (compute) => asyncHandler(async (req, res) => res.json(await move(compute(req))))

  router.post('/next', handle(() => nextPosition))
  router.post('/prev', handle(() => prevPosition))
  router.post('/reset', handle(() => resetPosition))
  router.post(
    '/goto',
    handle((req) => {
      const { stageIndex, step } = parse(gotoSchema, req.body)
      return (stages) => gotoPosition(stages, stageIndex, step ?? 0)
    }),
  )

  return router
}

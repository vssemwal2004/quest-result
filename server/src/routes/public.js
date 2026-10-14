import { Router } from 'express'
import { pingDb } from '../db/connect.js'
import { asyncHandler } from '../errors.js'

/** If-None-Match contains `etag` (weak comparison, list and * forms). */
export function etagMatches(header, etag) {
  if (typeof header !== 'string' || !header) return false
  if (header.trim() === '*') return true
  const bare = etag.replace(/^W\//, '')
  return header.split(',').some((part) => part.trim().replace(/^W\//, '') === bare)
}

export function publicRoutes({ cache, limiters }) {
  const router = Router()

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const up = await pingDb()
      res
        .set('Cache-Control', 'no-store')
        .status(up ? 200 : 503)
        .json(up ? { ok: true, db: 'up' } : { ok: false, db: 'down' })
    }),
  )

  // Served from the payload cache (pre-serialised once per version); keeps working from the last known
  // payload while the database is down. ETag = version, so polling clients get cheap 304s.
  router.get(
    '/public/show',
    limiters.publicShow,
    asyncHandler(async (req, res) => {
      const { json, version } = await cache.publicJson()
      const etag = `W/"show-v${version}"`
      res.set({ 'Cache-Control': 'no-cache', ETag: etag })
      if (etagMatches(req.get('if-none-match'), etag)) return res.status(304).end()
      res.type('application/json; charset=utf-8').send(json)
    }),
  )

  return router
}

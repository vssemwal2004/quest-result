import { isDbUp } from './db/connect.js'
import { dbUnavailable } from './errors.js'
import { buildPayload } from './show.js'

/**
 * In-memory cache of the show snapshot + the derived ShowPayloads, keyed by `show_state.version`.
 *
 * - `invalidate()` is called locally after every change (and, in multi-instance mode, when another
 *   instance announces one), so the next read reloads from MongoDB.
 * - As a safety net the cached version is re-checked against MongoDB at most every `revalidateMs`
 *   (one tiny query), which bounds staleness if an invalidation message is ever missed.
 * - While MongoDB is unreachable the last snapshot keeps being served, so the big screen never breaks.
 * - Payloads are serialised once per version (`publicJson()`); only `serverTime` is appended per call.
 */
export function createShowCache({ repo, revalidateMs = 1000, logger = console }) {
  /** @type {{ snapshot: any, checkedAt: number, built: Record<string, { body: object, json: string }> } | null} */
  let entry = null
  /** Last snapshot ever loaded — survives invalidate() so it can be served while the DB is down. */
  let lastGood = null
  let loading = null
  let generation = 0
  let lastWarnAt = 0

  function warnStale(err) {
    if (Date.now() - lastWarnAt < 10_000) return
    lastWarnAt = Date.now()
    logger.warn?.(`[cache] database unavailable, serving the last known show (v${lastGood?.snapshot.meta.version}): ${err?.message ?? 'DB down'}`)
  }

  function refresh(prev) {
    const gen = generation
    const p = (async () => {
      if (prev) {
        const version = await repo.show.version()
        if (version === prev.snapshot.meta.version) {
          if (gen === generation) prev.checkedAt = Date.now()
          return prev
        }
      }
      const snapshot = await repo.loadSnapshot()
      const next = { snapshot, checkedAt: Date.now(), built: {} }
      if (gen === generation) {
        entry = next
        lastGood = next
      }
      return next
    })()
    const tracked = p.finally(() => {
      if (loading === tracked) loading = null
    })
    return tracked
  }

  /** @returns {Promise<{ snapshot: any, built: object }>} */
  async function current() {
    const e = entry
    if (e && Date.now() - e.checkedAt < revalidateMs) return e
    const fallback = e ?? lastGood
    if (fallback && !isDbUp()) {
      warnStale()
      return fallback
    }
    loading ??= refresh(e)
    try {
      return await loading
    } catch (err) {
      if (fallback) {
        warnStale(err)
        return fallback
      }
      if (!isDbUp()) throw dbUnavailable()
      throw err
    }
  }

  /** Latest snapshot (shape of repo.loadSnapshot()). */
  async function snapshot() {
    return (await current()).snapshot
  }

  function built(e, filtered) {
    const key = filtered ? 'public' : 'admin'
    let b = e.built[key]
    if (!b) {
      // serverTime is the LAST key of a ShowPayload; it is appended per response.
      const { serverTime: _omit, ...body } = buildPayload(e.snapshot, { filtered })
      const json = JSON.stringify(body)
      b = { body, json, version: e.snapshot.meta.version }
      e.built[key] = b
    }
    return b
  }

  async function payload(filtered) {
    const b = built(await current(), filtered)
    return { ...b.body, serverTime: new Date().toISOString() }
  }

  /**
   * Pre-serialised payload for HTTP: `{ json, version }`; `json` is byte-identical to
   * `JSON.stringify(payload)` with a fresh serverTime.
   */
  async function payloadJson(filtered) {
    const b = built(await current(), filtered)
    const json = b.json.slice(0, -1) + `,"serverTime":${JSON.stringify(new Date().toISOString())}}`
    return { json, version: b.version }
  }

  function invalidate() {
    generation++
    entry = null
    loading = null
  }

  return {
    snapshot,
    publicPayload: () => payload(true),
    adminPayload: () => payload(false),
    publicJson: () => payloadJson(true),
    adminJson: () => payloadJson(false),
    invalidate,
  }
}

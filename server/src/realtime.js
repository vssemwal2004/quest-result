import { createAdapter } from '@socket.io/mongo-adapter'
import mongoose from 'mongoose'
import { Server } from 'socket.io'

export const SOCKET_EVENTS_COLLECTION = 'socket_io_events'
const SOCKET_EVENTS_CAP_BYTES = 16 * 1024 * 1024
const INVALIDATE_EVENT = 'show:invalidate'
const COUNT_EVENT = 'viewers:local'

/**
 * Capped collection used by @socket.io/mongo-adapter (created once; never dropped).
 * @param {import('mongodb').Db} db
 */
export async function ensureSocketEventsCollection(db, logger = console) {
  const [existing] = await db.listCollections({ name: SOCKET_EVENTS_COLLECTION }).toArray()
  if (existing) {
    if (!existing.options?.capped) {
      logger.warn?.(`[realtime] "${SOCKET_EVENTS_COLLECTION}" exists but is not capped; it will grow without bound.`)
    }
  } else {
    try {
      await db.createCollection(SOCKET_EVENTS_COLLECTION, { capped: true, size: SOCKET_EVENTS_CAP_BYTES })
    } catch (err) {
      if (err?.code !== 48 && err?.codeName !== 'NamespaceExists') throw err // another instance created it
    }
  }
  return db.collection(SOCKET_EVENTS_COLLECTION)
}

/** The mongo adapter listens with a change stream, which needs a replica set (every Atlas cluster is one). */
async function assertReplicaSet(db) {
  const hello = await db.admin().command({ hello: 1 })
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error(
      'SOCKET_ADAPTER=mongo needs a MongoDB replica set (change streams). Atlas clusters are replica sets; a standalone mongod is not.',
    )
  }
}

/**
 * Socket.IO fan-out of the spoiler-filtered ShowPayload.
 * - `show:update` to a socket on connect (from the payload cache), and to everyone shortly after any change
 *   (bursts are coalesced; the payload is built once per broadcast, socket.io encodes it once for all sockets).
 * - `viewers` `{ count }` to everyone when connections change (throttled).
 * - `adapter: 'mongo'` → @socket.io/mongo-adapter: broadcasts reach the clients of every instance, other
 *   instances drop their payload cache (`show:invalidate`), and viewer counts are summed across instances.
 * Listening needs no auth; clients cannot send anything meaningful.
 *
 * @param {{ httpServer: import('node:http').Server, cache: ReturnType<import('./cache.js').createShowCache>,
 *           corsOrigins?: string[] | null, broadcastDelayMs?: number, viewersThrottleMs?: number,
 *           adapter?: 'none' | 'mongo', db?: import('mongodb').Db, logger?: Console }} options
 */
export async function createRealtime({
  httpServer,
  cache,
  corsOrigins,
  broadcastDelayMs = 60,
  viewersThrottleMs = 1000,
  adapter = 'none',
  db = mongoose.connection.db,
  logger = console,
}) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    transports: ['websocket', 'polling'],
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 1e5,
    perMessageDeflate: { threshold: 1024 },
    httpCompression: { threshold: 1024 },
    cors: corsOrigins ? { origin: corsOrigins } : undefined,
  })

  const multi = adapter === 'mongo'
  if (multi) {
    await assertReplicaSet(db)
    io.adapter(createAdapter(await ensureSocketEventsCollection(db, logger), { requestsTimeout: 3000 }))
    // Another instance changed something: its own broadcast already reached our clients; just refresh the cache.
    io.on(INVALIDATE_EVENT, () => cache.invalidate())
    io.on(COUNT_EVENT, (ack) => typeof ack === 'function' && ack(io.of('/').sockets.size))
  }

  const localCount = () => io.of('/').sockets.size

  /** Sum of the local counts of every instance (only one instance → no round trip). */
  function clusterCount() {
    return new Promise((resolve) => {
      io.serverSideEmit(COUNT_EVENT, (err, responses = []) => {
        if (err) logger.warn?.(`[realtime] viewer count incomplete: ${err.message}`)
        resolve(localCount() + responses.reduce((n, c) => n + (Number.isFinite(c) ? c : 0), 0))
      })
    })
  }

  let viewerCache = { count: 0, at: 0 }
  let viewerFetch = null
  /** @param {{ fresh?: boolean }} [options] @returns {Promise<number>} */
  async function viewerCount({ fresh = false } = {}) {
    if (!multi) return localCount()
    if (!fresh && Date.now() - viewerCache.at < viewersThrottleMs) return viewerCache.count
    viewerFetch ??= clusterCount()
      .then((count) => {
        viewerCache = { count, at: Date.now() }
        return count
      })
      .finally(() => {
        viewerFetch = null
      })
    return viewerFetch
  }

  let broadcastTimer = null
  let broadcasting = false
  let pending = false
  let closed = false

  async function flush() {
    broadcastTimer = null
    if (broadcasting) {
      pending = true
      return
    }
    broadcasting = true
    try {
      const payload = await cache.publicPayload()
      if (closed) return
      if (multi) io.serverSideEmit(INVALIDATE_EVENT)
      io.emit('show:update', payload)
    } catch (err) {
      logger.error?.(`[realtime] broadcast failed: ${err.message}`)
    } finally {
      broadcasting = false
      if (pending && !closed) {
        pending = false
        broadcastShow()
      }
    }
  }

  /** Schedule a `show:update` broadcast (call after `cache.invalidate()`). */
  function broadcastShow() {
    if (broadcastTimer || closed) return
    broadcastTimer = setTimeout(() => void flush(), broadcastDelayMs)
  }

  let viewersTimer = null
  let lastViewersAt = 0
  function scheduleViewers() {
    if (viewersTimer || closed) return
    const wait = Math.max(0, lastViewersAt + viewersThrottleMs - Date.now())
    viewersTimer = setTimeout(async () => {
      lastViewersAt = Date.now()
      try {
        const count = await viewerCount({ fresh: true })
        if (!closed) io.emit('viewers', { count })
      } catch (err) {
        logger.warn?.(`[realtime] viewer count failed: ${err.message}`)
      } finally {
        viewersTimer = null
      }
    }, wait)
  }

  io.on('connection', (socket) => {
    cache
      .publicPayload()
      .then((payload) => socket.connected && socket.emit('show:update', payload))
      .catch((err) => logger.warn?.(`[realtime] could not send the show to a new viewer: ${err.message}`))
    scheduleViewers()
    socket.on('disconnect', scheduleViewers)
  })

  /**
   * Disconnect all sockets and stop the HTTP server. With `drainMs` > 0, in-flight HTTP requests may finish
   * for up to that long before their connections are cut; idle keep-alive connections are closed at once.
   */
  function close({ drainMs = 0 } = {}) {
    closed = true
    clearTimeout(broadcastTimer)
    clearTimeout(viewersTimer)
    broadcastTimer = viewersTimer = null
    return new Promise((resolve) => {
      const force = drainMs > 0 ? setTimeout(() => httpServer.closeAllConnections?.(), drainMs) : null
      force?.unref?.()
      io.close(() => {
        clearTimeout(force)
        resolve()
      })
      httpServer.closeIdleConnections?.()
      if (!force) httpServer.closeAllConnections?.()
    })
  }

  return { io, viewerCount, broadcastShow, close }
}

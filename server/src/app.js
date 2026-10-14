import crypto from 'node:crypto'
import http from 'node:http'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { createAuth, createLoginLockout } from './auth.js'
import { createShowCache } from './cache.js'
import { loadConfig, MEMORY_URI } from './config.js'
import { connectMongo, disconnectMongo, resolveDbName } from './db/connect.js'
import { serveUpload } from './db/files.js'
import { startMemoryMongo } from './db/memory.js'
import { createRepository } from './db/repository.js'
import { seedMongo } from './db/seedMongo.js'
import { errorHandler, notFound } from './errors.js'
import { createLimiters } from './limits.js'
import { createRealtime } from './realtime.js'
import { authRoutes } from './routes/auth.js'
import { overviewRoutes } from './routes/overview.js'
import { presentationRoutes } from './routes/presentation.js'
import { publicRoutes } from './routes/public.js'
import { settingsRoutes } from './routes/settings.js'
import { studentRoutes } from './routes/students.js'
import { tierRoutes } from './routes/tiers.js'
import { serveClient } from './static.js'
import { createUploads } from './uploads.js'

function securityHeaders(corsOrigins) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        // blob: — the 3D text renderer (troika, behind drei <Text>) runs in a blob: worker that importScripts()
        // further blob: modules; workers inherit this policy, and without it the podium never renders.
        scriptSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        // The admin Live Control page embeds a same-origin preview iframe.
        frameAncestors: ["'self'"],
        // The show often runs over plain http on a venue LAN; upgrading would break it.
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: corsOrigins ? 'cross-origin' : 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'sameorigin' },
    xContentTypeOptions: true,
  })
}

const REQUEST_ID_RE = /^[\w.-]{1,64}$/

/** `req.id` from a sane incoming X-Request-Id, else a new UUID; echoed in the response header. */
function requestId(req, res, next) {
  const incoming = req.get('x-request-id')
  req.id = incoming && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomUUID()
  res.setHeader('X-Request-Id', req.id)
  next()
}

/** Never compress socket.io traffic or stored images (already compressed); 1 KB threshold. */
function compressionFilter(req, res) {
  if (/^\/(socket\.io|uploads)(\/|$)/.test(req.path)) return false
  return compression.filter(req, res)
}

/**
 * Build the whole backend without listening (tests start it on port 0 against an in-memory MongoDB).
 * Boot: [in-memory mongod] → connect → seed (only what is missing) → JWT secret → routes → Socket.IO.
 * @param {Parameters<typeof loadConfig>[0]} [overrides]
 */
export async function createApp(overrides = {}) {
  const config = loadConfig(overrides)
  const { logger } = config
  const corsOrigins = config.corsOrigin
    ? config.corsOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : null

  if (config.nodeEnv === 'production' && !config.jwtSecret) {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production.')
  }

  let memory = null
  let uri = config.mongoUri
  if (uri === MEMORY_URI) {
    memory = await startMemoryMongo({ nodeEnv: config.nodeEnv, replSet: config.socketAdapter === 'mongo', logger })
    uri = memory.uri
  }

  let db
  try {
    db = await connectMongo({ uri, dbName: resolveDbName(uri ?? '', config.mongoDb ?? undefined), logger })
  } catch (err) {
    await memory?.stop().catch(() => {})
    throw err
  }

  try {
    const repo = createRepository({ logger })
    const secret = await repo.meta.getOrCreateJwtSecret({ envSecret: config.jwtSecret, nodeEnv: config.nodeEnv })
    await seedMongo(repo, { adminEmail: config.adminEmail, adminPassword: config.adminPassword, logger })
    const lockout = createLoginLockout({ maxFailures: config.loginLockoutFailures, lockMs: config.loginLockoutMs })
    const auth = createAuth({ secret, repo, lockout })
    const uploads = createUploads()
    const cache = createShowCache({ repo, revalidateMs: config.cacheRevalidateMs, logger })
    const limiters = createLimiters(config)

    const app = express()
    const httpServer = http.createServer(
      { headersTimeout: config.headersTimeoutMs, requestTimeout: config.requestTimeoutMs },
      app,
    )
    const realtime = await createRealtime({
      httpServer,
      cache,
      corsOrigins,
      broadcastDelayMs: config.broadcastDelayMs,
      viewersThrottleMs: config.viewersThrottleMs,
      adapter: config.socketAdapter,
      logger,
    })

    /** After every students / tiers / settings change: clamp the show, bump `version`, refresh caches, broadcast. */
    async function changed() {
      try {
        await repo.show.syncAfterChange()
      } catch (err) {
        logger.error(`[show] could not re-sync the presentation after a change: ${err.message}`)
      }
      cache.invalidate()
      realtime.broadcastShow()
    }

    const ctx = { config, repo, auth, uploads, cache, realtime, limiters, changed }

    app.disable('x-powered-by')
    app.set('trust proxy', config.trustProxy)
    app.use(requestId)
    app.use(securityHeaders(corsOrigins))
    if (corsOrigins) app.use(cors({ origin: corsOrigins }))
    app.use(compression({ threshold: 1024, filter: compressionFilter }))
    app.use(express.json({ limit: '1mb' }))

    app.get('/uploads/:id', serveUpload({ logger }))
    app.use('/uploads', (_req, _res, next) => next(notFound('File')))

    app.use('/api', publicRoutes(ctx))
    app.use('/api/auth', authRoutes(ctx))
    const admin = express.Router()
    admin.use(limiters.admin)
    admin.use(auth.requireAuth)
    admin.use('/students', studentRoutes(ctx))
    admin.use('/tiers', tierRoutes(ctx))
    admin.use('/settings', settingsRoutes(ctx))
    admin.use('/presentation', limiters.presentation, presentationRoutes(ctx))
    admin.use(overviewRoutes(ctx))
    app.use('/api/admin', admin)
    app.use('/api', (_req, _res, next) => next(notFound('API route')))

    const clientServed = serveClient(app, config.clientDist)
    app.use((_req, _res, next) => next(notFound()))
    app.use(errorHandler(logger))

    let closing = null
    /** @param {{ drainMs?: number }} [options] let in-flight requests finish for up to drainMs */
    function close({ drainMs = 0 } = {}) {
      closing ??= (async () => {
        await realtime.close({ drainMs })
        await disconnectMongo()
        await memory?.stop()
      })()
      return closing
    }

    return {
      app,
      httpServer,
      io: realtime.io,
      repo,
      cache,
      realtime,
      auth,
      config,
      clientServed,
      close,
      dbTarget: db.target,
      dbName: db.dbName,
      memoryDb: Boolean(memory),
    }
  } catch (err) {
    await disconnectMongo().catch(() => {})
    await memory?.stop().catch(() => {})
    throw err
  }
}

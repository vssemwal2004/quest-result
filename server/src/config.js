import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_ADMIN } from './seed.js'

/** Absolute path of the `server/` folder. */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** `MONGO_URI=memory` runs against a throw-away in-memory MongoDB (dev / smoke tests only). */
export const MEMORY_URI = 'memory'

/**
 * Express `trust proxy` setting from TRUST_PROXY.
 * "true"/"false", a hop count ("1"), or a named/CIDR list ("loopback", "10.0.0.0/8").
 * Defaults to false so X-Forwarded-For cannot be spoofed to dodge the rate limits.
 */
export function parseTrustProxy(value) {
  if (value === undefined || value === '') return false
  const v = String(value).trim().toLowerCase()
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^\d+$/.test(v)) return Number(v)
  return String(value).trim()
}

/** SOCKET_ADAPTER: '' / 'none' → single instance (default); 'mongo' → @socket.io/mongo-adapter. */
export function parseSocketAdapter(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
  if (v === '' || v === 'none') return 'none'
  if (v === 'mongo') return 'mongo'
  throw new Error(`SOCKET_ADAPTER must be "mongo" or empty (got "${value}")`)
}

const num = (value, fallback) => {
  const n = Number(value)
  return value !== undefined && value !== null && value !== '' && Number.isFinite(n) ? n : fallback
}

/**
 * Runtime configuration. Explicit `overrides` (used by tests) win over the environment.
 * Secrets are never logged anywhere.
 */
export function loadConfig(overrides = {}) {
  const env = process.env
  return {
    port: Number(overrides.port ?? env.PORT) || 4000,
    nodeEnv: overrides.nodeEnv ?? (env.NODE_ENV || 'development'),
    mongoUri: overrides.mongoUri ?? (env.MONGO_URI || null),
    mongoDb: overrides.mongoDb ?? (env.MONGO_DB || null),
    socketAdapter: parseSocketAdapter(overrides.socketAdapter ?? env.SOCKET_ADAPTER),
    clientDist: overrides.clientDist ?? path.resolve(SERVER_ROOT, '..', 'client', 'dist'),
    jwtSecret: overrides.jwtSecret ?? (env.JWT_SECRET || null),
    adminEmail: (overrides.adminEmail ?? (env.ADMIN_EMAIL || DEFAULT_ADMIN.email)).trim().toLowerCase(),
    adminPassword: overrides.adminPassword ?? (env.ADMIN_PASSWORD || DEFAULT_ADMIN.password),
    corsOrigin: overrides.corsOrigin ?? (env.CORS_ORIGIN || null),
    trustProxy: overrides.trustProxy ?? parseTrustProxy(env.TRUST_PROXY),
    // Rate limits (per IP unless noted).
    loginRateLimit: overrides.loginRateLimit ?? 10, // per minute
    loginLockoutFailures: overrides.loginLockoutFailures ?? 8, // per email
    loginLockoutMs: overrides.loginLockoutMs ?? 5 * 60_000,
    adminRateLimit: overrides.adminRateLimit ?? 300, // per minute
    presentationRateLimit: overrides.presentationRateLimit ?? 60, // per 10 s
    publicRateLimit: overrides.publicRateLimit ?? 120, // GET /api/public/show per minute
    // HTTP server timeouts. requestTimeout bounds the WHOLE request including a bulk photo upload.
    headersTimeoutMs: overrides.headersTimeoutMs ?? num(env.HEADERS_TIMEOUT_MS, 30_000),
    requestTimeoutMs: overrides.requestTimeoutMs ?? num(env.REQUEST_TIMEOUT_MS, 120_000),
    broadcastDelayMs: overrides.broadcastDelayMs ?? 60,
    viewersThrottleMs: overrides.viewersThrottleMs ?? 1000,
    cacheRevalidateMs: overrides.cacheRevalidateMs ?? 1000,
    logger: overrides.logger ?? console,
  }
}

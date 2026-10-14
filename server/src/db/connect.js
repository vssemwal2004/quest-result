import mongoose from 'mongoose'

export const DEFAULT_DB_NAME = 'ai_quest'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_POOL_SIZE = 20

const URI_RE = /^(mongodb(?:\+srv)?:\/\/)(?:([^:@/]*)(?::([^@/]*))?@)?([^/?#]+)(?:\/([^?#]*))?/i

/**
 * Credential-free form of a MongoDB URI for logs:
 * `mongodb+srv://<user>:****@<host>/<db>`. The query string is dropped (it can carry secrets).
 * @param {string | undefined | null} uri
 */
export function redactMongoUri(uri) {
  const m = typeof uri === 'string' ? URI_RE.exec(uri.trim()) : null
  if (!m) return '<malformed MongoDB URI>'
  const [, scheme, user, password, hosts, db] = m
  let auth = ''
  if (user !== undefined) auth = `${user || '<user>'}${password !== undefined ? ':****' : ''}@`
  return `${scheme.toLowerCase()}${auth}${hosts}/${db ?? ''}`
}

/** Database name in the URI path (`.../student_cards?retryWrites=true` → `student_cards`), or null. */
export function dbNameFromUri(uri) {
  const m = typeof uri === 'string' ? URI_RE.exec(uri.trim()) : null
  if (!m || !m[5]) return null
  try {
    return decodeURIComponent(m[5]) || null
  } catch {
    return m[5]
  }
}

/**
 * Database name: `MONGO_DB` (explicit override) → URI path → `ai_quest`.
 * @param {string | undefined} uri
 * @param {string | undefined} [envDbName] value of MONGO_DB
 */
export function resolveDbName(uri, envDbName) {
  const override = typeof envDbName === 'string' ? envDbName.trim() : ''
  return override || dbNameFromUri(uri) || DEFAULT_DB_NAME
}

/** Remove anything credential-like from a driver error message. */
function scrub(message, uri) {
  let out = String(message ?? '')
  if (typeof uri === 'string' && uri) out = out.split(uri).join(redactMongoUri(uri))
  const pw = typeof uri === 'string' ? URI_RE.exec(uri.trim())?.[3] : undefined
  if (pw) {
    out = out.split(pw).join('****')
    try {
      out = out.split(decodeURIComponent(pw)).join('****')
    } catch {
      /* not URI-encoded */
    }
  }
  return out.replace(/(mongodb(?:\+srv)?:\/\/)[^\s@/]+@/gi, '$1****@')
}

/**
 * Human hints for the usual causes of a failed connection.
 * @param {any} err
 * @returns {string[]}
 */
export function connectionHints(err) {
  const name = String(err?.name ?? '')
  const msg = String(err?.message ?? '')
  const hints = []
  if (name === 'MongoParseError' || /invalid scheme|uri must|malformed|URI (?:is )?(?:not|in)valid|unescaped/i.test(msg)) {
    hints.push(
      'MONGO_URI looks malformed: it must start with mongodb:// or mongodb+srv://, and special characters in the password must be URL-encoded (e.g. @ → %40).',
    )
  }
  if (err?.code === 18 || err?.codeName === 'AuthenticationFailed' || /auth(?:entication)? failed|bad auth/i.test(msg)) {
    hints.push('Authentication failed: check the database user name and password in MONGO_URI (Atlas → Database Access).')
  }
  if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    hints.push('The cluster host name could not be resolved: check the host in MONGO_URI and your internet / DNS connection.')
  }
  if (/ServerSelection/i.test(name) || /server selection|timed out|ECONNREFUSED|ETIMEDOUT|whitelist|IP.*access/i.test(msg)) {
    hints.push(
      "Could not reach the cluster: on Atlas add this machine's public IP under Network Access (IP Access List); also check firewalls / VPN.",
    )
  }
  if (!hints.length) {
    hints.push(
      'Common causes: Atlas Network Access IP allow-list, wrong user/password, malformed MONGO_URI (URL-encode special characters).',
    )
  }
  return hints
}

let listenersAttached = false
let activeLogger = console
let activeTarget = ''

function attachListeners() {
  if (listenersAttached) return
  listenersAttached = true
  const c = mongoose.connection
  c.on('connected', () => activeLogger.info?.(`[db] connected to ${activeTarget}`))
  c.on('disconnected', () => activeLogger.warn?.(`[db] disconnected from ${activeTarget}`))
  c.on('reconnected', () => activeLogger.info?.(`[db] reconnected to ${activeTarget}`))
  c.on('error', (err) => activeLogger.error?.(`[db] connection error: ${scrub(err?.message, '')}`))
}

/**
 * Connect the default mongoose connection. Fails fast with a credential-free error.
 * @param {{ uri?: string, dbName?: string, logger?: Console, serverSelectionTimeoutMS?: number, maxPoolSize?: number }} [options]
 * @returns {Promise<{ connection: mongoose.Connection, dbName: string, target: string }>}
 */
export async function connectMongo({
  uri = process.env.MONGO_URI,
  dbName,
  logger = console,
  serverSelectionTimeoutMS = DEFAULT_TIMEOUT_MS,
  maxPoolSize = DEFAULT_POOL_SIZE,
} = {}) {
  if (!uri || !String(uri).trim()) {
    throw new Error('MONGO_URI is not set. Add it to server/.env (see .env.example).')
  }
  uri = String(uri).trim()
  const name = dbName || resolveDbName(uri, process.env.MONGO_DB)
  const target = redactMongoUri(uri).replace(/\/[^/]*$/, `/${name}`)
  activeLogger = logger
  activeTarget = target
  mongoose.set('strictQuery', true)
  attachListeners()
  try {
    await mongoose.connect(uri, { dbName: name, serverSelectionTimeoutMS, maxPoolSize })
  } catch (err) {
    await mongoose.disconnect().catch(() => {})
    const hints = connectionHints(err)
    const error = new Error(
      `Could not connect to MongoDB at ${target}: ${scrub(err?.message, uri)}\n` + hints.map((h) => `  - ${h}`).join('\n'),
    )
    error.code = 'DB_CONNECT_FAILED'
    error.hints = hints
    throw error
  }
  return { connection: mongoose.connection, dbName: name, target }
}

/** Close the default connection (graceful shutdown). Safe to call twice. */
export async function disconnectMongo() {
  await mongoose.disconnect()
}

/** True while the driver reports an open connection. */
export function isDbUp() {
  return mongoose.connection.readyState === 1
}

/**
 * Round-trip ping for `/api/health`.
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function pingDb(timeoutMs = 2000) {
  if (!isDbUp()) return false
  let timer
  try {
    return await Promise.race([
      mongoose.connection.db.admin().ping().then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

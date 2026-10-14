/**
 * In-memory MongoDB (mongodb-memory-server, a devDependency imported only on demand) for
 * `MONGO_URI=memory` (development / rehearsal / smoke tests) and the test suite.
 *
 * Disk hygiene: every mongod gets its own dbPath under `server/.tmp/mongo-<random>` (never the OS temp
 * folder on C:), is stopped with `{ doCleanup: true, force: true }` and its folder is removed afterwards —
 * also when start-up fails. The mongod binary is cached in `server/node_modules/.cache/mongodb-memory-server`.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { SERVER_ROOT } from '../config.js'

export const MEMORY_TMP_ROOT = path.join(SERVER_ROOT, '.tmp')
const LAUNCH_TIMEOUT_MS = 90_000

process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(SERVER_ROOT, 'node_modules', '.cache', 'mongodb-memory-server')

async function removeDir(dir) {
  for (let attempt = 1; ; attempt++) {
    try {
      await fsp.rm(dir, { recursive: true, force: true })
      return
    } catch (err) {
      // Windows keeps mongod's files locked for a moment after the process exits.
      if (attempt >= 10 || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(err.code)) return
      await new Promise((r) => setTimeout(r, 200 * attempt))
    }
  }
}

async function loadLib() {
  try {
    return await import('mongodb-memory-server')
  } catch {
    throw new Error('An in-memory MongoDB needs the devDependency "mongodb-memory-server" (run "npm install" in server/).')
  }
}

/**
 * Start a throw-away mongod (or a single-node replica set, needed for transactions / change streams).
 * @param {{ replSet?: boolean }} [options]
 * @returns {Promise<{ uri: string, dbPath: string, getUri: () => string, stop: () => Promise<void> }>}
 */
export async function createMemoryMongo({ replSet = false } = {}) {
  const lib = await loadLib()
  await fsp.mkdir(MEMORY_TMP_ROOT, { recursive: true })
  const dbPath = await fsp.mkdtemp(path.join(MEMORY_TMP_ROOT, 'mongo-'))
  const instance = { dbPath, launchTimeout: LAUNCH_TIMEOUT_MS }
  let server
  try {
    server = replSet
      ? await lib.MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, instanceOpts: [instance] })
      : await lib.MongoMemoryServer.create({ instance })
  } catch (err) {
    await removeDir(dbPath)
    throw err
  }
  const uri = server.getUri()
  let stopping = null
  return {
    uri,
    dbPath,
    getUri: () => uri,
    /** Idempotent: stops mongod (if still running) and deletes its folder. */
    stop() {
      stopping ??= (async () => {
        try {
          await server.stop({ doCleanup: true, force: true })
        } catch {
          /* already stopped / crashed — the folder is removed below anyway */
        }
        await removeDir(dbPath)
      })()
      return stopping
    },
    /** Stop mongod but keep the folder (simulates a database outage); stop() later still cleans up. */
    async kill() {
      await server.stop({ doCleanup: false })
    },
  }
}

/**
 * `MONGO_URI=memory` for the server process. Refused in production.
 * @param {{ nodeEnv?: string, replSet?: boolean, logger?: Console }} [options]
 */
export async function startMemoryMongo({ nodeEnv = process.env.NODE_ENV, replSet = false, logger = console } = {}) {
  if (nodeEnv === 'production') {
    throw new Error('MONGO_URI=memory is a development convenience and is refused when NODE_ENV=production.')
  }
  const mongo = await createMemoryMongo({ replSet })
  logger.warn?.('[db] IN-MEMORY DATABASE — data is lost on exit (MONGO_URI=memory)')
  return mongo
}

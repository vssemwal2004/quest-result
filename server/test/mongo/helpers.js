import crypto from 'node:crypto'
import http from 'node:http'
import { connectMongo, disconnectMongo } from '../../src/db/connect.js'
import { createMemoryMongo } from '../../src/db/memory.js'
import { createRepository } from '../../src/db/repository.js'

export const quietLogger = { ...console, log() {}, info() {}, warn() {}, debug() {} }

/** 1×1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * Standalone in-memory mongod with its dbPath under server/.tmp (90 s launch timeout: every test file starts
 * its own mongod in parallel). `stop()` always cleans up (doCleanup + force) and removes the folder.
 */
export function createMemoryServer() {
  return createMemoryMongo()
}

/**
 * Fresh in-memory mongod (or single-node replica set for transactions) + connected default mongoose
 * connection + repository. Call `stop()` in `after()`.
 * @param {{ replSet?: boolean, transactions?: 'auto' | false }} [options]
 */
export async function startMongo({ replSet = false, transactions = 'auto' } = {}) {
  const server = await createMemoryMongo({ replSet })
  const uri = server.getUri()
  const dbName = `test_${crypto.randomBytes(4).toString('hex')}`
  try {
    await connectMongo({ uri, dbName, logger: quietLogger, serverSelectionTimeoutMS: 20_000 })
  } catch (err) {
    await server.stop()
    throw err
  }
  const repo = createRepository({ logger: quietLogger, transactions })
  await repo.init()
  return {
    uri,
    dbName,
    repo,
    async stop() {
      try {
        await disconnectMongo()
      } finally {
        await server.stop()
      }
    },
  }
}

export const student = (rank, extra = {}) => ({ rank, name: `Student ${rank}`, school: `School ${rank % 7}`, ...extra })

/** Start a bare http server for an Express app on an ephemeral port. */
export async function listen(app) {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

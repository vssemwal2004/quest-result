import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import { createApp } from '../../src/app.js'
import { createMemoryServer } from '../mongo/helpers.js'

export const ADMIN = { email: 'a@gmail.com', password: '123456' }

/** 1×1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

export const UPLOAD_URL_RE = /^\/uploads\/[0-9a-f]{24}$/

const quietLogger = { ...console, log() {}, warn() {}, info() {}, error() {} }

/** Number of files in the GridFS bucket of the running app (same process, same mongoose connection). */
export const storedFileCount = () => mongoose.connection.db.collection('uploads.files').countDocuments()

/**
 * Start the full app on an ephemeral port against an in-memory MongoDB.
 * By default a fresh mongod is started and stopped by close(). Pass `mongo: { uri }` (from
 * `startMemoryMongo()`) to reuse one across several app instances (restart tests); `dbName` keeps the data.
 * @param {{ mongo?: { uri: string }, dbName?: string } & Record<string, unknown>} [options]
 */
export async function startServer({ mongo, dbName, ...overrides } = {}) {
  const ownMongo = mongo ? null : await createMemoryServer()
  const uri = mongo?.uri ?? ownMongo.getUri()
  let ctx
  try {
    ctx = await createApp({
      mongoUri: uri,
      mongoDb: dbName ?? `test_${crypto.randomBytes(4).toString('hex')}`,
      clientDist: path.join(os.tmpdir(), 'ai-quest-no-client'),
      jwtSecret: null,
      nodeEnv: 'test',
      socketAdapter: 'none',
      adminEmail: ADMIN.email,
      adminPassword: ADMIN.password,
      broadcastDelayMs: 30,
      viewersThrottleMs: 20,
      cacheRevalidateMs: 1000,
      adminRateLimit: 100_000,
      presentationRateLimit: 100_000,
      publicRateLimit: 100_000,
      logger: quietLogger,
      ...overrides,
    })
  } catch (err) {
    await ownMongo?.stop()
    throw err
  }
  await new Promise((resolve) => ctx.httpServer.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${ctx.httpServer.address().port}`

  /**
   * @param {string} method
   * @param {string} route
   * @param {{ token?: string, json?: unknown, form?: FormData, headers?: Record<string, string> }} [opts]
   */
  async function request(method, route, { token, json, form, headers: extra = {} } = {}) {
    const headers = { ...extra }
    if (token) headers.Authorization = `Bearer ${token}`
    if (json !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(base + route, {
      method,
      headers,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
    })
    const type = res.headers.get('content-type') ?? ''
    const body = type.includes('application/json') ? await res.json() : await res.text()
    return { status: res.status, body, headers: res.headers }
  }

  async function login(email = ADMIN.email, password = ADMIN.password) {
    const res = await request('POST', '/api/auth/login', { json: { email, password } })
    if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`)
    return res.body.token
  }

  async function close() {
    try {
      await ctx.close()
    } finally {
      await ownMongo?.stop() // always: doCleanup + force, folder removed
    }
  }

  return { ctx, base, uri, request, login, close, mongoServer: ownMongo }
}

/** A memory mongod that outlives several startServer() calls (restart tests). */
export async function startMemoryMongo() {
  const server = await createMemoryServer() // { uri, getUri, stop, kill }
  return server
}

export function fileForm(field, files, fields = {}) {
  const form = new FormData()
  for (const [name, content, type = 'application/octet-stream'] of files) {
    form.append(field, new Blob([content], { type }), name)
  }
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return form
}

export async function addStudents(request, token, list) {
  const created = []
  for (const s of list) {
    const res = await request('POST', '/api/admin/students', { token, json: s })
    if (res.status !== 201) throw new Error(`create failed: ${JSON.stringify(res.body)}`)
    created.push(res.body.student)
  }
  return created
}

export const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

export const student = (rank, extra = {}) => ({ rank, name: `Student ${rank}`, school: `School ${rank % 7}`, ...extra })

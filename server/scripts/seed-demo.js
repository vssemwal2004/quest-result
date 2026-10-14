#!/usr/bin/env node
/**
 * Insert 200 clearly fake demo winners (ranks 1–200) for rehearsals.
 *
 *   npm run seed:demo                 # refuses if the database holds students that are not demo data
 *   npm run seed:demo -- --force      # replace ALL existing students with the demo set
 *   npm run seed:demo -- --url http://localhost:4000   # server address (default http://localhost:$PORT)
 *
 * If a server answers at --url it goes through the HTTP API (admin login + CSV import), so the live show
 * updates immediately — this is the way to fill a `npm run dev:memory` server. Otherwise it writes to
 * MongoDB directly (MONGO_URI / MONGO_DB, printed redacted before anything is written).
 * Credentials for the API path: ADMIN_EMAIL / ADMIN_PASSWORD (env or server/.env), default the seeded admin.
 */
import path from 'node:path'
import { parseArgs } from 'node:util'
import dotenv from 'dotenv'
import { loadConfig, MEMORY_URI, SERVER_ROOT } from '../src/config.js'
import { toCsv } from '../src/csv.js'
import { connectMongo, disconnectMongo, redactMongoUri, resolveDbName } from '../src/db/connect.js'
import { createRepository } from '../src/db/repository.js'
import { seedMongo } from '../src/db/seedMongo.js'

dotenv.config({ path: path.join(SERVER_ROOT, '.env') })

const { values: args } = parseArgs({
  options: {
    force: { type: 'boolean', default: false },
    url: { type: 'string' },
    count: { type: 'string', default: '200' },
  },
})

const FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Atharv', 'Kabir', 'Rudra', 'Dhruv', 'Arnav', 'Yash', 'Pranav', 'Rohan', 'Kartik',
  'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Myra', 'Aarohi', 'Anika', 'Ira', 'Kiara', 'Navya',
  'Pari', 'Riya', 'Sara', 'Tanvi', 'Vanya', 'Meher', 'Ishita', 'Kavya', 'Nidhi', 'Shreya',
  'Aryan', 'Harsh', 'Manav', 'Nikhil', 'Parth', 'Samar', 'Tanmay', 'Uday', 'Ved', 'Zoya',
]
const LAST = [
  'Sharma', 'Negi', 'Rawat', 'Bisht', 'Joshi', 'Pant', 'Verma', 'Gupta', 'Singh', 'Chauhan',
  'Thapa', 'Bhatt', 'Nautiyal', 'Semwal', 'Uniyal', 'Dobhal', 'Kandari', 'Rana', 'Mehta', 'Agarwal',
  'Kapoor', 'Saxena', 'Mishra', 'Pandey', 'Tiwari', 'Yadav', 'Khan', 'Dhyani', 'Bahuguna', 'Kumar',
]
const SCHOOLS = [
  'Himalayan Heights Public School', 'Green Valley Senior Secondary School', 'Sunrise Convent School',
  'Pinewood International School', 'Riverside Academy', 'Silver Oak Public School', 'Mountain View School',
  'Cedar Grove Senior Secondary School', 'Lotus Valley Academy', 'Bright Future Public School',
  'Starlight Convent School', 'New Horizon International School', 'Evergreen Public School',
  'Blue Bells Senior Secondary School', 'Maple Leaf Academy', 'Rising Sun Public School',
  'Crystal Valley School', 'Golden Gate Academy', 'Snow Peak Public School', 'Little Flower Convent School',
  'Harmony International School', 'Deodar Public School', 'Valley Crest Academy', 'Morning Star School',
]
const CITIES = [
  'Dehradun', 'Haridwar', 'Rishikesh', 'Roorkee', 'Haldwani', 'Nainital', 'Mussoorie', 'Rudrapur',
  'Kashipur', 'Almora', 'Pithoragarh', 'Saharanpur', 'Kotdwar', 'Srinagar (Garhwal)', 'Vikasnagar',
]

/** Deterministic PRNG so every rehearsal uses the same demo data. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function demoStudents(count) {
  const rand = mulberry32(2026)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const usedNames = new Set()
  const rows = []
  for (let rank = 1; rank <= count; rank++) {
    let name
    do name = `${pick(FIRST)} ${pick(LAST)}`
    while (usedNames.has(name) && usedNames.size < FIRST.length * LAST.length)
    usedNames.add(name)
    const score = Math.round((99.6 - (rank - 1) * 0.18 - rand() * 0.05) * 10) / 10
    rows.push({ line: rank + 1, rank, name, school: pick(SCHOOLS), city: pick(CITIES), score })
  }
  return rows
}

async function serverIsUp(base) {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function api(base, token, method, route, body) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status} on ${route}`)
  return data
}

/** Students that are not part of the deterministic demo set (by rank + name + school). */
function foreignStudents(existing, demoRows) {
  const demo = new Map(demoRows.map((r) => [r.rank, r]))
  return existing.filter((s) => {
    const d = demo.get(s.rank)
    return !d || d.name !== s.name || d.school !== s.school
  })
}

function refusal(foreign) {
  const sample = foreign
    .slice(0, 3)
    .map((s) => `#${s.rank} ${s.name}`)
    .join(', ')
  return { refused: foreign.length, sample }
}

async function seedViaApi(base, config, rows) {
  const { token } = await api(base, null, 'POST', '/api/auth/login', {
    email: config.adminEmail,
    password: config.adminPassword,
  }).catch((err) => {
    throw new Error(`Admin login failed (${err.message}). Set ADMIN_EMAIL / ADMIN_PASSWORD to the current admin credentials.`)
  })
  const { students } = await api(base, token, 'GET', '/api/admin/students')
  const foreign = foreignStudents(students, rows)
  if (foreign.length && !args.force) return refusal(foreign)

  const csv = toCsv(
    ['rank', 'name', 'school', 'city', 'score'],
    rows.map((r) => [r.rank, r.name, r.school, r.city, r.score]),
  )
  const form = new FormData()
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'demo-students.csv')
  form.append('mode', args.force ? 'replace' : 'merge')
  form.append('dryRun', 'false')
  const result = await api(base, token, 'POST', '/api/admin/students/import', form)
  return result.summary
}

async function seedDirect(config, rows) {
  if (config.mongoUri === MEMORY_URI) {
    throw new Error(
      'MONGO_URI=memory: an in-memory database only lives inside the server process. Start it (npm run dev:memory) and re-run this script; it will seed through the API.',
    )
  }
  const dbName = resolveDbName(config.mongoUri ?? '', config.mongoDb ?? undefined)
  const target = redactMongoUri(config.mongoUri).replace(/\/[^/]*$/, `/${dbName}`)
  console.log(`Target database: ${target}`)
  await connectMongo({ uri: config.mongoUri, dbName, logger: { ...console, info() {} } })
  try {
    const repo = createRepository()
    await seedMongo(repo, { adminEmail: config.adminEmail, adminPassword: config.adminPassword, logger: { info() {} } })
    const foreign = foreignStudents(await repo.students.list(), rows)
    if (foreign.length && !args.force) return refusal(foreign)
    const columns = { rank: 0, name: 1, school: 2, city: 3, score: 4 }
    const result = await repo.students.upsertManyByRank(rows, { mode: args.force ? 'replace' : 'merge', columns })
    await repo.show.syncAfterChange()
    return { created: result.created, updated: result.updated, removed: result.removed.length }
  } finally {
    await disconnectMongo()
  }
}

async function main() {
  const config = loadConfig()
  const count = Number(args.count)
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('--count must be 1..1000')
  const rows = demoStudents(count)
  const base = (args.url ?? `http://localhost:${config.port}`).replace(/\/$/, '')

  const online = await serverIsUp(base)
  console.log(online ? `Server found at ${base} — importing through the API…` : `No server at ${base} — writing to MongoDB directly…`)
  const outcome = online ? await seedViaApi(base, config, rows) : await seedDirect(config, rows)

  if (outcome.refused) {
    console.error(
      `The database already holds ${outcome.refused} student(s) that are not demo data (e.g. ${outcome.sample}). Nothing changed.\n` +
        'Re-run with --force to REPLACE all students with demo data.',
    )
    process.exitCode = 1
    return
  }
  console.log(`Demo data ready: ${outcome.created} created, ${outcome.updated} updated, ${outcome.removed} removed.`)
  if (!online) console.log('A running server picks the change up within a second (payload cache revalidation).')
}

main().catch((err) => {
  console.error(`seed:demo failed: ${err.message}`)
  process.exitCode = 1
})
#!/usr/bin/env node
/**
 * One-off import of a legacy JSON store (server/data/db.json) + server/uploads into MongoDB.
 * Idempotent: running it again changes nothing.
 *
 *   npm run migrate:json                        # uses MONGO_URI / MONGO_DB from server/.env; legacy files from
 *                                               # DATA_DIR / UPLOAD_DIR (default server/data, server/uploads)
 *   npm run migrate:json -- --dry-run           # report only, write nothing
 *   npm run migrate:json -- --file path/to/db.json --uploads path/to/uploads
 *   npm run migrate:json -- --prune-tiers       # also delete Mongo tiers whose name is not in db.json
 *
 * What it does
 * - students: upsert by rank (name, school, city, score, createdAt); a legacy photo is copied into GridFS
 *   only when the Mongo student has no photo yet (re-runs reuse the already copied file via metadata.legacyUrl).
 * - tiers: upsert by name (all fields incl. order/enabled).
 * - settings: legacy values are written over the stored ones; the logo is copied into GridFS once.
 * - admin: inserted when its email is missing; if it exists but still has the default password, the legacy
 *   password hash is adopted. A password changed in Mongo is never overwritten.
 * - show state: not copied (the show starts at the intro); the version is bumped so caches refresh.
 * It never drops or empties anything.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { SERVER_ROOT } from '../src/config.js'
import { connectMongo, disconnectMongo } from '../src/db/connect.js'
import { getBucket, saveBuffer } from '../src/db/files.js'
import { createRepository } from '../src/db/repository.js'
import { Admin, AppSettings, SETTINGS_ID, Student, Tier } from '../src/db/models/index.js'
import { assertValidTier } from '../src/routes/tiers.js'
import { detectImageType } from '../src/uploads.js'
import { DEFAULT_ADMIN, defaultSettings } from '../src/seed.js'

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' }
const LEGACY_URL_RE = /^\/uploads\/(photos|branding)\/([^/\\]+)$/
const TIER_FIELDS = ['name', 'subtitle', 'rankFrom', 'rankTo', 'prize', 'prizeAmount', 'style', 'color', 'icon', 'sortDirection', 'order', 'enabled']
const SETTINGS_FIELDS = Object.keys(defaultSettings()).filter((k) => k !== 'logoUrl' && k !== 'updatedAt')

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]))
const toDate = (v) => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/**
 * Copy a legacy `/uploads/<dir>/<file>` into GridFS once.
 * @returns {Promise<import('mongoose').Types.ObjectId | null>} null when the url/file is unusable
 */
async function importLegacyFile({ url, uploadDir, kind, studentId, dryRun, report }) {
  const m = typeof url === 'string' ? LEGACY_URL_RE.exec(url) : null
  if (!m || m[2] === '.' || m[2] === '..') return null
  const existing = await getBucket().find({ 'metadata.legacyUrl': url }).limit(1).next()
  if (existing) return existing._id
  let buffer
  try {
    buffer = await fsp.readFile(path.join(uploadDir, m[1], m[2]))
  } catch (err) {
    if (err.code === 'ENOENT') {
      report.missingFiles.push(url)
      return null
    }
    throw err
  }
  const type = detectImageType(buffer.subarray(0, 1024))
  if (!type || (kind === 'photo' && type === 'svg')) {
    report.missingFiles.push(`${url} (not a valid image)`)
    return null
  }
  report.filesCopied++
  if (dryRun) return null
  return saveBuffer({ buffer, contentType: MIME[type], originalName: m[2], kind, studentId, legacyUrl: url })
}

/**
 * @param {{ file: string, uploadDir: string, repo?: ReturnType<typeof createRepository>, dryRun?: boolean,
 *           pruneTiers?: boolean, logger?: Console }} options
 */
export async function migrateJsonToMongo({ file, uploadDir, repo = createRepository(), dryRun = false, pruneTiers = false, logger = console }) {
  let raw
  try {
    raw = await fsp.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.info?.(`[migrate] ${file} not found — nothing to migrate.`)
      return { skipped: true }
    }
    throw err
  }
  const db = JSON.parse(raw.replace(/^﻿/, ''))
  await repo.init()

  const report = {
    skipped: false,
    dryRun,
    students: { created: 0, updated: 0, unchanged: 0, photos: 0 },
    tiers: { created: 0, updated: 0, pruned: 0 },
    settings: false,
    logo: false,
    admin: 'unchanged',
    filesCopied: 0,
    missingFiles: [],
    warnings: [],
  }

  // ---- students (upsert by rank)
  for (const s of Array.isArray(db.students) ? db.students : []) {
    if (!Number.isInteger(s?.rank) || s.rank < 1 || !s.name || !s.school) {
      report.warnings.push(`skipped invalid student ${JSON.stringify({ rank: s?.rank, name: s?.name })}`)
      continue
    }
    const fields = { name: s.name, school: s.school, city: s.city ?? null, score: s.score ?? null }
    const current = await Student.findOne({ rank: s.rank }).lean()
    const changed = !current || Object.entries(fields).some(([k, v]) => (current[k] ?? null) !== v)
    if (!current) report.students.created++
    else if (changed) report.students.updated++
    else report.students.unchanged++
    let studentId = current?._id
    if (!dryRun && changed) {
      const createdAt = toDate(s.createdAt) ?? new Date()
      // timestamps: false — mongoose would otherwise replace the legacy createdAt with "now".
      const doc = await Student.findOneAndUpdate(
        { rank: s.rank },
        { $set: { ...fields, updatedAt: new Date() }, $setOnInsert: { photoFileId: null, createdAt } },
        { upsert: true, new: true, lean: true, runValidators: true, setDefaultsOnInsert: false, timestamps: false },
      )
      studentId = doc._id
    }
    if (s.photoUrl && !current?.photoFileId) {
      const fileId = await importLegacyFile({ url: s.photoUrl, uploadDir, kind: 'photo', studentId, dryRun, report })
      if (fileId && !dryRun) {
        await Student.updateOne({ rank: s.rank, photoFileId: null }, { $set: { photoFileId: fileId } })
        report.students.photos++
      }
    }
  }

  // ---- tiers (upsert by name)
  const legacyTiers = Array.isArray(db.tiers) ? db.tiers : []
  for (const [i, t] of legacyTiers.entries()) {
    const fields = { order: i, enabled: true, ...pick(t, TIER_FIELDS) }
    const current = await Tier.findOne({ name: fields.name }).lean()
    const changed = !current || Object.entries(fields).some(([k, v]) => current[k] !== v)
    if (!changed) continue
    report.tiers[current ? 'updated' : 'created']++
    if (!dryRun) {
      await Tier.updateOne({ name: fields.name }, { $set: fields }, { upsert: true, runValidators: true, setDefaultsOnInsert: true })
    }
  }
  if (legacyTiers.length) {
    const legacyNames = new Set(legacyTiers.map((t) => t.name))
    const extra = await Tier.find({ name: { $nin: [...legacyNames] } }).lean()
    if (extra.length && pruneTiers) {
      report.tiers.pruned = extra.length
      if (!dryRun) await Tier.deleteMany({ _id: { $in: extra.map((t) => t._id) } })
    } else if (extra.length) {
      report.warnings.push(`tiers not in db.json kept: ${extra.map((t) => t.name).join(', ')} (use --prune-tiers to remove)`)
    }
    if (!dryRun) {
      const all = await repo.tiers.list()
      for (const tier of all) {
        try {
          assertValidTier(tier, all.filter((o) => o.id !== tier.id))
        } catch (err) {
          report.warnings.push(`tier "${tier.name}": ${err.message}`)
        }
      }
    }
  }

  // ---- settings (+ logo)
  if (db.settings && typeof db.settings === 'object') {
    const patch = pick(db.settings, SETTINGS_FIELDS)
    const stored = await AppSettings.findById(SETTINGS_ID).lean()
    const differs = Object.entries(patch).some(([k, v]) => JSON.stringify(stored?.[k]) !== JSON.stringify(v))
    if (differs) {
      report.settings = true
      if (!dryRun) await repo.settings.update(patch)
    }
    if (db.settings.logoUrl && !stored?.logoFileId) {
      const fileId = await importLegacyFile({ url: db.settings.logoUrl, uploadDir, kind: 'logo', dryRun, report })
      if (fileId && !dryRun) {
        await repo.settings.setLogo(fileId)
        report.logo = true
      }
    }
  }

  // ---- admin
  const legacyAdmin = db.admin
  if (legacyAdmin?.email && legacyAdmin?.passwordHash) {
    const email = String(legacyAdmin.email).trim().toLowerCase()
    const current = await Admin.findOne({ email }).lean()
    if (!current) {
      report.admin = 'created'
      if (!dryRun) await Admin.create({ email, passwordHash: legacyAdmin.passwordHash })
    } else if (current.passwordHash !== legacyAdmin.passwordHash && (await bcrypt.compare(DEFAULT_ADMIN.password, current.passwordHash))) {
      report.admin = 'password adopted from db.json'
      if (!dryRun) await Admin.updateOne({ _id: current._id }, { $set: { passwordHash: legacyAdmin.passwordHash } })
    }
  }

  if (!dryRun) {
    await repo.show.ensure()
    await repo.show.syncAfterChange()
  }
  return report
}

async function main() {
  dotenv.config({ path: path.join(SERVER_ROOT, '.env') })
  const { values: args } = parseArgs({
    options: {
      file: { type: 'string' },
      uploads: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'prune-tiers': { type: 'boolean', default: false },
    },
  })
  // Legacy JSON-store locations (the JSON store itself is gone; these only point at old files).
  const dataDir = path.resolve(SERVER_ROOT, process.env.DATA_DIR || 'data')
  const file = path.resolve(args.file ?? path.join(dataDir, 'db.json'))
  const uploadDir = path.resolve(args.uploads ?? path.resolve(SERVER_ROOT, process.env.UPLOAD_DIR || 'uploads'))

  const { target } = await connectMongo({ uri: process.env.MONGO_URI })
  console.log(`[migrate] ${file} → ${target}${args['dry-run'] ? ' (dry run)' : ''}`)
  try {
    const report = await migrateJsonToMongo({ file, uploadDir, dryRun: args['dry-run'], pruneTiers: args['prune-tiers'] })
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await disconnectMongo()
  }
}

/** True when this file is the entry point (not imported by tests). Drive-letter case differs on Windows. */
function isEntryPoint() {
  if (!process.argv[1]) return false
  try {
    const self = fs.realpathSync(fileURLToPath(import.meta.url))
    const entry = fs.realpathSync(path.resolve(process.argv[1]))
    return process.platform === 'win32' ? self.toLowerCase() === entry.toLowerCase() : self === entry
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  main().catch((err) => {
    console.error(`[migrate] ${err.message}`)
    process.exit(1)
  })
}

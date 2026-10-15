/**
 * Async data access for the whole app on MongoDB (replaces the JSON `Store`).
 *
 * - Every function returns the exact SPEC JSON shapes (via ./mappers.js), never mongoose documents.
 * - Mutators throw the same `HttpError`s the routes already use (404 NOT_FOUND, 409 RANK_TAKEN, 400 VALIDATION).
 * - Only the app's own collections are touched (see models/index.js); nothing is ever dropped.
 * - Replacing / removing a photo or logo deletes the old GridFS file.
 * - `version` (show_state) is the cache key of the public ShowPayload: callers bump it after content
 *   changes with `show.syncAfterChange()`, which also clamps the presentation to the new stage list.
 */
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { HttpError, notFound } from '../errors.js'
import { BCRYPT_ROUNDS, defaultSettings } from '../seed.js'
import { buildStages, reconcileState, samePosition } from '../show.js'
import { deleteFile, deleteFiles } from './files.js'
import { parseObjectId, SETTINGS_KEYS, toAdmin, toSettings, toShowState, toStudent, toTier } from './mappers.js'
import {
  Admin,
  ALL_MODELS,
  AppMeta,
  AppSettings,
  META_IDS,
  SETTINGS_ID,
  SHOW_STATE_ID,
  ShowState,
  Student,
  Tier,
} from './models/index.js'

/**
 * @typedef {{ id: string, rank: number, name: string, school: string, city: string | null, score: number | null,
 *             photoUrl: string | null, createdAt: string, updatedAt: string }} Student
 * @typedef {{ id: string, name: string, subtitle: string, rankFrom: number, rankTo: number, prize: string,
 *             prizeAmount: string, podiumPrizes: { rank: number, prize: string, prizeAmount: string }[] | null, style: 'scroll'|'grid'|'spotlight'|'podium', color: string, icon: string,
 *             sortDirection: 'asc'|'desc', gridPageCounts: number[] | null, order: number, enabled: boolean }} Tier
 * @typedef {Record<string, any> & { logoUrl: string | null, updatedAt: string }} Settings
 * @typedef {{ stageIndex: number, step: number, stageKey: string, updatedAt: string, version: number }} ShowStateRecord
 * @typedef {{ id: string, email: string, passwordHash: string, passwordChangedAt: string | null,
 *             createdAt: string, updatedAt: string }} AdminRecord
 * @typedef {{ settings: Settings, tiers: Tier[], students: Student[],
 *             state: { stageIndex: number, step: number, stageKey: string, updatedAt: string },
 *             meta: { version: number, stateExists: boolean } }} Snapshot
 *   Same shape as the JSON store's `db`, so show.js `buildPayload/buildStages` and `buildOverview` work unchanged.
 * @typedef {{ rank: number, name: string, school: string, city?: string | null, score?: number | null }} ImportRowInput
 * @typedef {{ created: number, updated: number, removed: Student[] }} ImportCommit
 * @typedef {(candidate: object, otherTiers: Tier[]) => void} TierValidator throws HttpError when invalid
 */

export const MAX_SEARCH_LENGTH = 100
const STUDENT_FIELDS = ['rank', 'name', 'school', 'city', 'score']
const TIER_FIELDS = ['name', 'subtitle', 'rankFrom', 'rankTo', 'prize', 'prizeAmount', 'podiumPrizes', 'style', 'color', 'icon', 'sortDirection', 'gridPageCounts', 'enabled']
const SETTINGS_FIELDS = SETTINGS_KEYS.filter((k) => k !== 'logoUrl' && k !== 'updatedAt')

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Copy the listed keys whose value is not `undefined`. */
function pickDefined(input, keys) {
  const out = {}
  for (const k of keys) if (input?.[k] !== undefined) out[k] = input[k]
  return out
}

const sessionOpt = (session) => (session ? { session } : {})

function isDuplicateKey(err) {
  return err?.code === 11000 || (Array.isArray(err?.writeErrors) && err.writeErrors.some((e) => e?.code === 11000))
}

function duplicateRank(err) {
  const candidates = [err?.keyValue, ...(err?.writeErrors ?? []).map((e) => e?.err?.keyValue ?? e?.keyValue)]
  for (const kv of candidates) if (kv && typeof kv.rank === 'number') return kv.rank
  const m = /rank:\s*(\d+)/.exec(String(err?.message ?? err?.errmsg ?? ''))
  return m ? Number(m[1]) : undefined
}

async function rankTakenError(rank) {
  const clash = rank === undefined ? null : await Student.findOne({ rank }).lean()
  const label = rank === undefined ? 'This rank' : `Rank ${rank}`
  return new HttpError(
    409,
    'RANK_TAKEN',
    clash ? `${label} is already assigned to ${clash.name}` : `${label} is already taken`,
    { rank: rank ?? null, studentId: clash ? String(clash._id) : null },
  )
}

/** Map driver / mongoose write errors to the API's HttpError shapes; anything else passes through. */
async function mapWriteError(err, context = {}) {
  if (err instanceof HttpError) return err
  if (isDuplicateKey(err)) {
    const pattern = err.keyPattern ?? err.writeErrors?.[0]?.err?.keyPattern ?? {}
    if ('rank' in pattern || /rank/.test(String(err.message))) return rankTakenError(duplicateRank(err) ?? context.rank)
    if ('email' in pattern) return new HttpError(409, 'EMAIL_TAKEN', 'An admin with this email already exists')
    return new HttpError(409, 'DUPLICATE', 'This record already exists')
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }))
    return new HttpError(400, 'VALIDATION', details[0] ? `${details[0].path}: ${details[0].message}` : 'Invalid input', details)
  }
  if (err instanceof mongoose.Error.CastError) {
    return new HttpError(400, 'VALIDATION', `${err.path}: invalid value`, [{ path: err.path, message: 'Invalid value' }])
  }
  return err
}

async function guard(promise, context) {
  try {
    return await promise
  } catch (err) {
    throw await mapWriteError(err, context)
  }
}

const TX_UNSUPPORTED = (err) =>
  err?.code === 20 || /Transaction numbers are only allowed|does not support (?:retryable writes|transactions)/i.test(String(err?.message))

/**
 * @param {{ logger?: Console, transactions?: 'auto' | false }} [options]
 *   `transactions: false` forces the ordered (non-transactional) fallback.
 */
export function createRepository({ logger = console, transactions = 'auto' } = {}) {
  /** @type {boolean | null} */
  let txSupport = transactions === false ? false : null

  // ---------------------------------------------------------------- infrastructure

  /** Create the app's collections and indexes (idempotent; never drops anything). */
  async function init() {
    for (const model of ALL_MODELS) await model.init()
  }

  /** True on a replica set / sharded cluster (Atlas); false on a standalone mongod. Cached. */
  async function supportsTransactions() {
    if (txSupport !== null) return txSupport
    try {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 })
      txSupport = Boolean((hello.setName || hello.msg === 'isdbgrid') && hello.logicalSessionTimeoutMinutes != null)
    } catch {
      txSupport = false
    }
    return txSupport
  }

  /**
   * Run `fn(session)` in a transaction when supported, else `fn(null)` (ordered operations).
   * `fn` may be retried on transient errors, so it must recompute everything it writes.
   * @template T @param {(session: mongoose.ClientSession | null) => Promise<T>} fn @returns {Promise<T>}
   */
  async function inTransaction(fn) {
    if (!(await supportsTransactions())) return fn(null)
    const session = await mongoose.startSession()
    try {
      let result
      await session.withTransaction(async () => {
        result = await fn(session)
      })
      return result
    } catch (err) {
      if (!TX_UNSUPPORTED(err)) throw err
      txSupport = false
      logger.warn?.('[db] transactions are not supported by this deployment; using ordered writes')
      return fn(null)
    } finally {
      await session.endSession()
    }
  }

  // ---------------------------------------------------------------- admins

  const admins = {
    /** @param {string} email @returns {Promise<AdminRecord | null>} */
    async findByEmail(email) {
      if (typeof email !== 'string' || !email.trim()) return null
      return toAdmin(await Admin.findOne({ email: email.trim().toLowerCase() }).lean())
    },

    /** @param {string} id @returns {Promise<AdminRecord | null>} */
    async findById(id) {
      const oid = parseObjectId(id)
      return oid ? toAdmin(await Admin.findById(oid).lean()) : null
    },

    /** Oldest admin (the seeded one) — for the "default password" boot warning. @returns {Promise<AdminRecord | null>} */
    async getPrimary() {
      return toAdmin(await Admin.findOne().sort({ createdAt: 1, _id: 1 }).lean())
    },

    /** @returns {Promise<number>} */
    async count() {
      return Admin.countDocuments({})
    },

    /**
     * @param {string} id @param {string} passwordHash bcrypt hash
     * @returns {Promise<AdminRecord>} throws 404 when the admin does not exist
     */
    async updatePassword(id, passwordHash) {
      const oid = parseObjectId(id)
      // Tokens carry the passwordChangedAt they were issued under (auth.js `pwv` claim); changing it revokes them.
      const passwordChangedAt = new Date()
      const doc = oid
        ? await guard(
            Admin.findOneAndUpdate({ _id: oid }, { $set: { passwordHash, passwordChangedAt } }, { new: true, runValidators: true, lean: true }),
          )
        : null
      if (!doc) throw notFound('Admin')
      return toAdmin(doc)
    },

    /**
     * Create the first admin only when the `admins` collection is empty.
     * @param {{ email: string, password: string }} seed
     * @returns {Promise<{ created: boolean, admin: AdminRecord | null }>}
     */
    async seedIfEmpty({ email, password }) {
      if ((await Admin.countDocuments({})) > 0) return { created: false, admin: await admins.getPrimary() }
      if (!email || !password) throw new Error('seedIfEmpty: email and password are required')
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      try {
        const doc = await Admin.create({ email: email.trim().toLowerCase(), passwordHash })
        return { created: true, admin: toAdmin(doc) }
      } catch (err) {
        if (isDuplicateKey(err)) return { created: false, admin: await admins.findByEmail(email) } // another instance won
        throw await mapWriteError(err)
      }
    },
  }

  // ---------------------------------------------------------------- students

  function searchFilter(q) {
    const text = typeof q === 'string' ? q.trim().slice(0, MAX_SEARCH_LENGTH) : ''
    if (!text) return {}
    const re = new RegExp(escapeRegex(text), 'i')
    const or = [{ name: re }, { school: re }, { city: re }]
    if (/^\d+$/.test(text)) or.push({ rank: Number(text) })
    return { $or: or }
  }

  async function requireStudentDoc(id) {
    const oid = parseObjectId(id)
    const doc = oid ? await Student.findById(oid).lean() : null
    if (!doc) throw notFound('Student')
    return doc
  }

  const students = {
    /**
     * Students sorted by rank asc; `q` = case-insensitive substring of name/school/city (regex-escaped),
     * or an exact rank when `q` is all digits.
     * @param {string} [q] @returns {Promise<Student[]>}
     */
    async list(q = '') {
      return (await Student.find(searchFilter(q)).sort({ rank: 1 }).lean()).map(toStudent)
    },

    /** @returns {Promise<number>} */
    async count() {
      return Student.countDocuments({})
    },

    /** @param {string} id @returns {Promise<Student | null>} null for unknown or malformed ids */
    async get(id) {
      const oid = parseObjectId(id)
      return oid ? toStudent(await Student.findById(oid).lean()) : null
    },

    /** @param {number} rank @returns {Promise<Student | null>} */
    async getByRank(rank) {
      return toStudent(await Student.findOne({ rank }).lean())
    },

    /** All ranks in use, ascending. @returns {Promise<number[]>} */
    async listRanks() {
      return (await Student.distinct('rank')).sort((a, b) => a - b)
    },

    /**
     * @param {{ rank: number, name: string, school: string, city?: string | null, score?: number | null }} input
     * @returns {Promise<Student>} throws 409 RANK_TAKEN
     */
    async create(input) {
      const doc = await guard(
        Student.create({
          rank: input.rank,
          name: input.name,
          school: input.school,
          city: input.city ?? null,
          score: input.score ?? null,
          photoFileId: null,
        }),
        { rank: input.rank },
      )
      return toStudent(doc)
    },

    /**
     * Partial update (undefined keys are ignored). @param {string} id
     * @param {Partial<{ rank: number, name: string, school: string, city: string | null, score: number | null }>} patch
     * @returns {Promise<Student>} throws 404 NOT_FOUND / 409 RANK_TAKEN
     */
    async update(id, patch) {
      const oid = parseObjectId(id)
      if (!oid) throw notFound('Student')
      const $set = pickDefined(patch, STUDENT_FIELDS)
      const doc = await guard(
        Student.findOneAndUpdate({ _id: oid }, { $set }, { new: true, runValidators: true, lean: true }),
        { rank: $set.rank },
      )
      if (!doc) throw notFound('Student')
      return toStudent(doc)
    },

    /** Delete a student and its photo file. @param {string} id @returns {Promise<Student>} the deleted student; 404 if unknown */
    async delete(id) {
      const oid = parseObjectId(id)
      const doc = oid ? await Student.findOneAndDelete({ _id: oid }).lean() : null
      if (!doc) throw notFound('Student')
      await deleteFile(doc.photoFileId)
      return toStudent(doc)
    },

    /** Delete every student and their photo files (students collection only). @returns {Promise<number>} deleted count */
    async deleteAll() {
      const docs = await Student.find({}, { _id: 1, photoFileId: 1 }).lean()
      if (!docs.length) return 0
      const { deletedCount } = await Student.deleteMany({ _id: { $in: docs.map((d) => d._id) } })
      await deleteFiles(docs.map((d) => d.photoFileId))
      return deletedCount
    },

    /**
     * Point a student at an already stored GridFS file; the previous photo file is deleted.
     * If the student does not exist the NEW file is deleted and 404 is thrown.
     * @param {string} id @param {mongoose.Types.ObjectId | string} fileId @returns {Promise<Student>}
     */
    async setPhoto(id, fileId) {
      const fid = parseObjectId(fileId)
      if (!fid) throw new TypeError('setPhoto: invalid file id')
      const oid = parseObjectId(id)
      const before = oid
        ? await Student.findOneAndUpdate({ _id: oid }, { $set: { photoFileId: fid } }, { new: false, lean: true })
        : null
      if (!before) {
        await deleteFile(fid)
        throw notFound('Student')
      }
      if (before.photoFileId && !before.photoFileId.equals(fid)) await deleteFile(before.photoFileId)
      return toStudent(await requireStudentDoc(oid))
    },

    /** Clear a student's photo and delete the file. @param {string} id @returns {Promise<Student>} 404 if unknown */
    async removePhoto(id) {
      const oid = parseObjectId(id)
      const before = oid
        ? await Student.findOneAndUpdate({ _id: oid }, { $set: { photoFileId: null } }, { new: false, lean: true })
        : null
      if (!before) throw notFound('Student')
      await deleteFile(before.photoFileId)
      return toStudent(await requireStudentDoc(oid))
    },

    /**
     * Bulk photo upload: assign stored files to students by rank. Replaced photos and files whose
     * rank no longer exists (deleted meanwhile) are deleted.
     * @param {Map<number, mongoose.Types.ObjectId | string> | Iterable<[number, mongoose.Types.ObjectId | string]>} assignments
     * @returns {Promise<{ matched: number, orphanedRanks: number[] }>}
     */
    async assignPhotosByRank(assignments) {
      const entries = [...new Map(assignments)]
      const toDelete = []
      const orphanedRanks = []
      let matched = 0
      await Promise.all(
        entries.map(async ([rank, fileId]) => {
          const fid = parseObjectId(fileId)
          if (!fid) return
          const before = await Student.findOneAndUpdate({ rank }, { $set: { photoFileId: fid } }, { new: false, lean: true })
          if (!before) {
            orphanedRanks.push(rank)
            toDelete.push(fid)
            return
          }
          matched++
          if (before.photoFileId && !before.photoFileId.equals(fid)) toDelete.push(before.photoFileId)
        }),
      )
      await deleteFiles(toDelete)
      return { matched, orphanedRanks: orphanedRanks.sort((a, b) => a - b) }
    },

    /**
     * Import commit (rows already validated, ranks unique within `rows`). Same semantics as importer.planImport:
     * - merge: upsert by rank (photo kept); a column absent from the file (`columns.city/score === undefined`)
     *   leaves the existing value untouched; `updated` counts only rows that actually change something.
     * - replace: additionally delete students whose rank is not in the file, and their photo files.
     * Runs in a transaction when supported, otherwise as one ordered bulkWrite.
     * @param {ImportRowInput[]} rows
     * @param {{ mode?: 'merge' | 'replace', columns?: Record<string, number> }} [options]
     * @returns {Promise<ImportCommit>}
     */
    async upsertManyByRank(rows, { mode = 'merge', columns = { city: 3, score: 4 } } = {}) {
      if (mode !== 'merge' && mode !== 'replace') throw new TypeError(`upsertManyByRank: unknown mode "${mode}"`)
      const hasCity = columns.city !== undefined
      const hasScore = columns.score !== undefined

      const run = async (session) => {
        const current = await Student.find({}, null, sessionOpt(session)).lean()
        const byRank = new Map(current.map((s) => [s.rank, s]))
        const fileRanks = new Set(rows.map((r) => r.rank))
        const removed = mode === 'replace' ? current.filter((s) => !fileRanks.has(s.rank)) : []
        const ops = []
        let created = 0
        let updated = 0

        if (removed.length) ops.push({ deleteMany: { filter: { _id: { $in: removed.map((s) => s._id) } } } })
        for (const row of rows) {
          const next = { name: row.name, school: row.school }
          if (hasCity) next.city = row.city ?? null
          if (hasScore) next.score = row.score ?? null
          const existing = byRank.get(row.rank)
          if (!existing) {
            created++
            const $setOnInsert = { photoFileId: null }
            if (!hasCity) $setOnInsert.city = null
            if (!hasScore) $setOnInsert.score = null
            ops.push({
              updateOne: { filter: { rank: row.rank }, update: { $set: next, $setOnInsert }, upsert: true, setDefaultsOnInsert: false },
            })
          } else if (Object.entries(next).some(([k, v]) => (existing[k] ?? null) !== v)) {
            updated++
            ops.push({ updateOne: { filter: { _id: existing._id }, update: { $set: next } } })
          }
        }
        if (ops.length) await Student.bulkWrite(ops, { ordered: true, ...sessionOpt(session) })
        return { created, updated, removed }
      }

      const result = await guard(inTransaction(run))
      await deleteFiles(result.removed.map((s) => s.photoFileId))
      return { created: result.created, updated: result.updated, removed: result.removed.map(toStudent) }
    },
  }

  // ---------------------------------------------------------------- tiers

  const tierSort = { order: 1, rankFrom: -1 }

  const tiers = {
    /** Sorted by `order` (then rankFrom desc, like show.js sortTiers). @returns {Promise<Tier[]>} */
    async list() {
      return (await Tier.find().sort(tierSort).lean()).map(toTier)
    },

    /** @param {string} id @returns {Promise<Tier | null>} */
    async get(id) {
      const oid = parseObjectId(id)
      return oid ? toTier(await Tier.findById(oid).lean()) : null
    },

    /** @returns {Promise<number>} */
    async count() {
      return Tier.countDocuments({})
    },

    /**
     * Append a tier (`order` = max + 1). `validate(candidate, otherTiers)` runs right before the write
     * (pass routes/tiers.js `assertValidTier` for overlap / podium checks).
     * @param {object} input TierInput (no id/order) @param {{ validate?: TierValidator }} [options]
     * @returns {Promise<Tier>}
     */
    async create(input, { validate } = {}) {
      const fields = pickDefined(input, TIER_FIELDS)
      const others = await tiers.list()
      validate?.({ enabled: true, ...fields }, others)
      const order = others.reduce((max, t) => Math.max(max, t.order), -1) + 1
      return toTier(await guard(Tier.create({ ...fields, order })))
    },

    /**
     * Partial update; `validate(mergedTier, otherTiers)` runs before the write.
     * @param {string} id @param {object} patch @param {{ validate?: TierValidator }} [options]
     * @returns {Promise<Tier>} 404 if unknown
     */
    async update(id, patch, { validate } = {}) {
      const oid = parseObjectId(id)
      const currentDoc = oid ? await Tier.findById(oid).lean() : null
      if (!currentDoc) throw notFound('Tier')
      const $set = pickDefined(patch, TIER_FIELDS)
      if (validate) {
        const others = (await tiers.list()).filter((t) => t.id !== String(oid))
        validate({ ...toTier(currentDoc), ...$set }, others)
      }
      const doc = await guard(Tier.findOneAndUpdate({ _id: oid }, { $set }, { new: true, runValidators: true, lean: true }))
      if (!doc) throw notFound('Tier')
      return toTier(doc)
    },

    /** @param {string} id @returns {Promise<Tier>} the deleted tier; 404 if unknown */
    async delete(id) {
      const oid = parseObjectId(id)
      const doc = oid ? await Tier.findOneAndDelete({ _id: oid }).lean() : null
      if (!doc) throw notFound('Tier')
      return toTier(doc)
    },

    /**
     * Listed ids first in the given order; unlisted tiers keep their relative order after them.
     * @param {string[]} ids @returns {Promise<Tier[]>} 400 VALIDATION for unknown ids
     */
    async reorder(ids) {
      const all = await tiers.list()
      const known = new Set(all.map((t) => t.id))
      const unknown = ids.filter((id) => !known.has(id))
      if (unknown.length) throw new HttpError(400, 'VALIDATION', `Unknown tier id(s): ${unknown.join(', ')}`)
      const listed = [...new Set(ids)]
      const rest = all.filter((t) => !listed.includes(t.id)).map((t) => t.id)
      const ops = [...listed, ...rest].map((id, order) => ({
        updateOne: { filter: { _id: parseObjectId(id) }, update: { $set: { order } } },
      }))
      if (ops.length) await inTransaction((session) => Tier.bulkWrite(ops, { ordered: true, ...sessionOpt(session) }))
      return tiers.list()
    },

    /**
     * Replace ALL tiers (apply a preset). Extra keys such as a preset's `id` are ignored;
     * `order` defaults to the array index. New tiers are inserted before the old ones are removed.
     * @param {object[]} inputs TierInput[] in reveal order @returns {Promise<Tier[]>}
     */
    async replaceAll(inputs) {
      const docs = inputs.map((t, i) => ({ ...pickDefined(t, TIER_FIELDS), order: Number.isInteger(t.order) ? t.order : i }))
      await guard(
        inTransaction(async (session) => {
          const inserted = await Tier.insertMany(docs, { ordered: true, ...sessionOpt(session) })
          await Tier.deleteMany({ _id: { $nin: inserted.map((d) => d._id) } }, sessionOpt(session))
        }),
      )
      return tiers.list()
    },
  }

  // ---------------------------------------------------------------- settings

  /** Defaults for `$setOnInsert`, minus the keys being `$set` (MongoDB rejects the same path in both). */
  function settingsDefaultsFor(excludedKeys) {
    const defaults = defaultSettings()
    const out = {}
    if (!('logoFileId' in excludedKeys)) out.logoFileId = null
    for (const k of SETTINGS_FIELDS) if (!(k in excludedKeys)) out[k] = defaults[k]
    return out
  }

  const settings = {
    /** Full SPEC Settings; defaults for anything never saved. @returns {Promise<Settings>} */
    async get() {
      return toSettings(await AppSettings.findById(SETTINGS_ID).lean())
    },

    /** Insert the default settings doc if it does not exist. @returns {Promise<boolean>} true when created */
    async ensureDefaults() {
      // timestamps: false so an existing doc's updatedAt is not touched; the insert stamps it itself.
      const res = await AppSettings.updateOne(
        { _id: SETTINGS_ID },
        { $setOnInsert: { ...settingsDefaultsFor({}), updatedAt: new Date() } },
        { upsert: true, timestamps: false },
      )
      return res.upsertedCount > 0
    },

    /** @param {Partial<Settings>} patch validated partial (logoUrl/updatedAt ignored) @returns {Promise<Settings>} */
    async update(patch) {
      const $set = pickDefined(patch, SETTINGS_FIELDS)
      const doc = await guard(
        AppSettings.findOneAndUpdate(
          { _id: SETTINGS_ID },
          { $set, $setOnInsert: settingsDefaultsFor($set) },
          { upsert: true, new: true, runValidators: true, lean: true, setDefaultsOnInsert: false },
        ),
      )
      return toSettings(doc)
    },

    /** Use a stored GridFS file as the logo; the previous logo file is deleted. @returns {Promise<Settings>} */
    async setLogo(fileId) {
      const fid = parseObjectId(fileId)
      if (!fid) throw new TypeError('setLogo: invalid file id')
      const before = await AppSettings.findOneAndUpdate(
        { _id: SETTINGS_ID },
        { $set: { logoFileId: fid }, $setOnInsert: settingsDefaultsFor({ logoFileId: true }) },
        { upsert: true, new: false, lean: true, setDefaultsOnInsert: false },
      )
      if (before?.logoFileId && !before.logoFileId.equals(fid)) await deleteFile(before.logoFileId)
      return settings.get()
    },

    /** Remove the logo (no write when there is none) and delete its file. @returns {Promise<Settings>} */
    async removeLogo() {
      const before = await AppSettings.findOneAndUpdate(
        { _id: SETTINGS_ID, logoFileId: { $ne: null } },
        { $set: { logoFileId: null } },
        { new: false, lean: true },
      )
      if (before) await deleteFile(before.logoFileId)
      return settings.get()
    },
  }

  // ---------------------------------------------------------------- snapshot + show state

  /**
   * Everything the show model needs, shaped like the JSON store's `db`. The state (with `version`) is read
   * FIRST, so data is never older than the version it is cached under.
   * @returns {Promise<Snapshot>}
   */
  async function loadSnapshot() {
    const stateDoc = await ShowState.findById(SHOW_STATE_ID).lean()
    const [settingsDoc, tierDocs, studentDocs] = await Promise.all([
      AppSettings.findById(SETTINGS_ID).lean(),
      Tier.find().sort(tierSort).lean(),
      Student.find().sort({ rank: 1 }).lean(),
    ])
    const { version, ...state } = toShowState(stateDoc)
    return {
      settings: toSettings(settingsDoc),
      tiers: tierDocs.map(toTier),
      students: studentDocs.map(toStudent),
      state,
      meta: { version, stateExists: Boolean(stateDoc) },
    }
  }

  const initialState = () => ({ stageIndex: 0, step: 0, stageKey: 'intro', updatedAt: new Date() })

  const show = {
    /** @returns {Promise<ShowStateRecord>} */
    async get() {
      return toShowState(await ShowState.findById(SHOW_STATE_ID).lean())
    },

    /** Current payload version (cheap; for cache checks). @returns {Promise<number>} */
    async version() {
      const doc = await ShowState.findById(SHOW_STATE_ID, { version: 1 }).lean()
      return doc?.version ?? 1
    },

    /** Insert the initial state doc if missing. @returns {Promise<boolean>} true when created */
    async ensure() {
      const res = await ShowState.updateOne(
        { _id: SHOW_STATE_ID },
        { $setOnInsert: { ...initialState(), version: 1 } },
        { upsert: true },
      )
      return res.upsertedCount > 0
    },

    /**
     * Unconditional write of the position; `version` += 1 atomically.
     * @param {{ stageIndex: number, step: number, stageKey: string }} position
     * @param {{ updatedAt?: Date }} [options]
     * @returns {Promise<ShowStateRecord>}
     */
    async set({ stageIndex, step, stageKey }, { updatedAt = new Date() } = {}) {
      const doc = await guard(
        ShowState.findOneAndUpdate(
          { _id: SHOW_STATE_ID },
          { $set: { stageIndex, step, stageKey, updatedAt }, $inc: { version: 1 } },
          { upsert: true, new: true, runValidators: true, lean: true, setDefaultsOnInsert: false },
        ),
      )
      return toShowState(doc)
    },

    /** `version` += 1 without moving (e.g. settings change that cannot affect stages). @returns {Promise<number>} */
    async bumpVersion() {
      const doc = await ShowState.findOneAndUpdate(
        { _id: SHOW_STATE_ID },
        { $inc: { version: 1 }, $setOnInsert: initialState() },
        { upsert: true, new: true, lean: true, setDefaultsOnInsert: false },
      )
      return doc.version
    },

    /**
     * Optimistic read-compute-write of the position (compare-and-swap on `version`, retried on conflict).
     * `compute(snapshot)` returns the new `{ stageIndex, step, stageKey }`, or null for "no change"
     * (then nothing is written and `changed` is false). `updatedAt` changes only when the position moves.
     * @param {(snapshot: Snapshot) => ({ stageIndex: number, step: number, stageKey: string } | null)} compute
     * @param {{ alwaysBump?: boolean, maxAttempts?: number }} [options]
     * @returns {Promise<{ changed: boolean, state: ShowStateRecord, snapshot: Snapshot }>}
     */
    async transition(compute, { alwaysBump = false, maxAttempts = 10 } = {}) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const snapshot = await loadSnapshot()
        if (!snapshot.meta.stateExists) {
          await show.ensure()
          continue
        }
        const current = snapshot.state
        const next = compute(snapshot)
        if (!next && !alwaysBump) return { changed: false, state: { ...current, version: snapshot.meta.version }, snapshot }
        const pos = next ?? current
        const moved = !samePosition(pos, current)
        const $set = { stageIndex: pos.stageIndex, step: pos.step, stageKey: pos.stageKey ?? current.stageKey }
        if (moved) $set.updatedAt = new Date()
        const doc = await ShowState.findOneAndUpdate(
          { _id: SHOW_STATE_ID, version: snapshot.meta.version },
          { $set, $inc: { version: 1 } },
          { new: true, lean: true },
        )
        if (doc) return { changed: true, state: toShowState(doc), snapshot }
      }
      throw new HttpError(503, 'BUSY', 'The show is being changed by someone else right now. Please try again.')
    },

    /**
     * Call after ANY change to students / tiers / settings: re-anchors the presentation on the new stage list
     * (show.js reconcileState) and bumps `version` so caches refresh and `show:update` can be broadcast.
     * @returns {Promise<ShowStateRecord>}
     */
    async syncAfterChange() {
      const { state } = await show.transition((snap) => reconcileState(snap.state, buildStages(snap)), { alwaysBump: true })
      return state
    },
  }

  // ---------------------------------------------------------------- meta

  const meta = {
    /**
     * `envSecret` (JWT_SECRET) when set; otherwise (dev only) a random secret stored in app_meta so tokens
     * survive restarts and are shared by all instances. Throws in NODE_ENV=production without JWT_SECRET.
     * @param {{ envSecret?: string | null, nodeEnv?: string }} [options]
     * @returns {Promise<string>}
     */
    async getOrCreateJwtSecret({ envSecret = process.env.JWT_SECRET, nodeEnv = process.env.NODE_ENV } = {}) {
      if (envSecret) return envSecret
      if (nodeEnv === 'production') {
        throw new Error('JWT_SECRET must be set when NODE_ENV=production (refusing to use a database-stored fallback secret).')
      }
      const candidate = crypto.randomBytes(48).toString('base64url')
      let doc
      try {
        doc = await AppMeta.findOneAndUpdate(
          { _id: META_IDS.jwtSecret },
          { $setOnInsert: { value: candidate } },
          { upsert: true, new: true, lean: true },
        )
      } catch (err) {
        if (!isDuplicateKey(err)) throw err
        doc = await AppMeta.findById(META_IDS.jwtSecret).lean() // concurrent first boot
      }
      if (typeof doc?.value !== 'string' || doc.value.length < 32) throw new Error('app_meta jwt-secret is invalid')
      return doc.value
    },

    /** @param {string} key @returns {Promise<any>} stored value or null */
    async get(key) {
      return (await AppMeta.findById(key).lean())?.value ?? null
    },

    /** @param {string} key @param {any} value */
    async set(key, value) {
      await AppMeta.updateOne({ _id: key }, { $set: { value } }, { upsert: true })
    },
  }

  return { init, supportsTransactions, inTransaction, loadSnapshot, admins, students, tiers, settings, show, meta }
}

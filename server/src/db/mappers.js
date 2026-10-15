/**
 * The ONE place that turns Mongo documents into the exact JSON shapes of docs/SPEC.md:
 * `id` strings, ISO date strings, `/uploads/<fileId>` URLs, never `_id` / `__v` / internal ids.
 * Accepts lean objects or hydrated mongoose documents.
 */
import mongoose from 'mongoose'
import { defaultSettings } from '../seed.js'

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i

/**
 * 24-hex string / ObjectId → ObjectId; anything else → null (never throws).
 * Driver-created ids (e.g. GridFS upload ids) are bson ObjectIds, not the mongoose subclass,
 * so the check is on `_bsontype` rather than `instanceof`.
 */
export function parseObjectId(value) {
  if (value?._bsontype === 'ObjectId' && typeof value.toHexString === 'function') return value
  if (typeof value === 'string' && OBJECT_ID_RE.test(value)) return new mongoose.Types.ObjectId(value)
  return null
}

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc)

/** Date | string | number → ISO string (null when missing). */
export function iso(value) {
  if (value === null || value === undefined) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** GridFS file id → public URL (`/uploads/<id>`) or null. */
export function uploadUrl(fileId) {
  return fileId ? `/uploads/${String(fileId)}` : null
}

/** `/uploads/<24-hex>` → ObjectId, otherwise null. */
export function fileIdFromUrl(url) {
  const m = typeof url === 'string' ? /^\/uploads\/([0-9a-f]{24})$/i.exec(url) : null
  return m ? new mongoose.Types.ObjectId(m[1]) : null
}

/** @returns {import('./repository.js').Student | null} */
export function toStudent(doc) {
  const d = plain(doc)
  if (!d) return null
  return {
    id: String(d._id),
    rank: d.rank,
    name: d.name,
    school: d.school,
    city: d.city ?? null,
    score: d.score ?? null,
    photoUrl: uploadUrl(d.photoFileId),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  }
}

/** @returns {import('./repository.js').Tier | null} */
export function toTier(doc) {
  const d = plain(doc)
  if (!d) return null
  return {
    id: String(d._id),
    name: d.name,
    subtitle: d.subtitle ?? '',
    rankFrom: d.rankFrom,
    rankTo: d.rankTo,
    prize: d.prize ?? '',
    prizeAmount: d.prizeAmount ?? '',
    podiumPrizes: d.podiumPrizes?.map((entry) => ({ rank: entry.rank, prize: entry.prize ?? '', prizeAmount: entry.prizeAmount ?? '' })) ?? null,
    style: d.style,
    color: d.color,
    icon: d.icon,
    sortDirection: d.sortDirection,
    gridPageCounts: d.gridPageCounts ?? null,
    order: d.order,
    enabled: d.enabled,
  }
}

/** Settings keys in SPEC order (taken from the defaults so the two can never drift). */
export const SETTINGS_KEYS = Object.keys(defaultSettings())

/**
 * Stored settings doc (or null) → full SPEC Settings; missing fields fall back to the defaults.
 * @returns {import('./repository.js').Settings}
 */
export function toSettings(doc) {
  const d = plain(doc) ?? {}
  const defaults = defaultSettings(iso(d.updatedAt) ?? new Date().toISOString())
  const out = {}
  for (const key of SETTINGS_KEYS) {
    if (key === 'logoUrl') out.logoUrl = uploadUrl(d.logoFileId)
    else if (key === 'updatedAt') out.updatedAt = iso(d.updatedAt) ?? defaults.updatedAt
    else if (key === 'handwrittenLines') out[key] = Array.isArray(d[key]) ? [...d[key]] : defaults[key]
    else out[key] = d[key] ?? defaults[key]
  }
  return out
}

/**
 * Stored show state → internal state used by show.js (`stageKey` included; `publicState()` strips it).
 * @returns {import('./repository.js').ShowStateRecord}
 */
export function toShowState(doc) {
  const d = plain(doc) ?? {}
  return {
    stageIndex: d.stageIndex ?? 0,
    step: d.step ?? 0,
    stageKey: d.stageKey ?? 'intro',
    updatedAt: iso(d.updatedAt) ?? new Date(0).toISOString(),
    version: d.version ?? 1,
  }
}

/**
 * Internal admin record (NOT an API shape — contains the hash; routes only ever send `{ email }`).
 * @returns {import('./repository.js').AdminRecord | null}
 */
export function toAdmin(doc) {
  const d = plain(doc)
  if (!d) return null
  return {
    id: String(d._id),
    email: d.email,
    passwordHash: d.passwordHash,
    passwordChangedAt: iso(d.passwordChangedAt),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  }
}

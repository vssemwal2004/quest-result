import { z } from 'zod'
import { zodToHttpError } from './errors.js'

export const MAX_RANK = 100_000
export const MAX_SEARCH_LENGTH = 100
export const DISPLAY_STYLES = ['scroll', 'grid', 'spotlight', 'podium']
export const TIER_ICONS = ['trophy', 'medal', 'star', 'award', 'crown', 'rocket', 'sparkles']

const text = (min, max) => z.string().trim().min(min).max(max)

/** "", null → null; numeric strings → number; undefined stays undefined (= "not provided"). */
const toNullableNumber = (v) => {
  if (v === '' || v === null) return null
  if (typeof v === 'string') return v.trim() === '' ? null : Number(v.trim())
  return v
}
/** Numeric strings → number (for required numeric fields; "" becomes undefined → "Required"). */
const toNumber = (v) => {
  if (typeof v !== 'string') return v
  return v.trim() === '' ? undefined : Number(v.trim())
}
/** "" / whitespace → null; strings are trimmed. */
const toNullableText = (v) => {
  if (typeof v !== 'string') return v
  return v.trim() === '' ? null : v.trim()
}

/**
 * Strict object schema that tolerates (and drops) the given read-only keys, so a client that echoes a
 * record it received (`id`, `createdAt`, …) still works while any other unknown key is a 400.
 */
function strictIgnoring(schema, ignoredKeys) {
  return z.preprocess((v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v
    const copy = { ...v }
    for (const k of ignoredKeys) delete copy[k]
    return copy
  }, schema.strict())
}

export const rankSchema = z.preprocess(
  toNumber,
  z.number({ invalid_type_error: 'Rank must be a whole number' }).int('Rank must be a whole number').min(1).max(MAX_RANK),
)
const nullableText = (max) => z.preprocess(toNullableText, z.string().max(max).nullable().optional())
const nullableScore = z.preprocess(
  toNullableNumber,
  z.number({ invalid_type_error: 'Score must be a number' }).finite().min(-1e9).max(1e9).nullable().optional(),
)

export const studentFields = {
  rank: rankSchema,
  name: text(1, 120),
  school: text(1, 200),
  city: nullableText(120),
  score: nullableScore,
}
/** Import rows and other internal uses (no strictness: import tables carry their own columns). */
export const studentCreateSchema = z.object(studentFields)
const STUDENT_READ_ONLY = ['id', 'photoUrl', 'createdAt', 'updatedAt']
export const studentCreateBody = strictIgnoring(studentCreateSchema, STUDENT_READ_ONLY)
export const studentUpdateBody = strictIgnoring(studentCreateSchema.partial(), STUDENT_READ_ONLY)

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Color must be a hex value like #38bdf8')
  .transform((c) => c.toLowerCase())

const tierRank = z.preprocess(toNumber, z.number().int().min(1).max(MAX_RANK))

const tierObject = z.object({
  name: text(1, 80),
  subtitle: z.string().trim().max(120).default(''),
  rankFrom: tierRank,
  rankTo: tierRank,
  prize: z.string().trim().max(200).default(''),
  prizeAmount: z.string().trim().max(60).default(''),
  style: z.enum(DISPLAY_STYLES),
  color: hexColor.default('#38bdf8'),
  icon: z.enum(TIER_ICONS).default('award'),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
  gridPageCounts: z.array(z.number().int().min(1).max(12)).min(1).max(500).nullable().default(null),
  enabled: z.boolean().default(true),
})
const TIER_READ_ONLY = ['id', 'order']
export const tierCreateSchema = strictIgnoring(tierObject, TIER_READ_ONLY)
// .partial() would keep the defaults; an update must only touch the keys that were sent.
export const tierUpdateSchema = strictIgnoring(
  z.object(Object.fromEntries(Object.entries(tierObject.shape).map(([k, s]) => [k, unwrapDefault(s).optional()]))),
  TIER_READ_ONLY,
)

function unwrapDefault(schema) {
  return schema instanceof z.ZodDefault ? schema.removeDefault() : schema
}

export const reorderSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(500) }).strict()
export const presetSchema = z.object({ key: z.string().min(1).max(64) }).strict()

export const settingsUpdateSchema = strictIgnoring(
  z
    .object({
      eventTitle: text(1, 80),
      eventEdition: z.string().trim().max(80),
      tagline: z.string().trim().max(120),
      subTagline: z.string().trim().max(200),
      organization: z.string().trim().max(160),
      location: z.string().trim().max(120),
      eventDate: z.string().trim().max(40),
      contact: z.string().trim().max(120),
      handwrittenLines: z
        .array(z.string().trim().max(40))
        .max(8)
        .transform((lines) => lines.filter(Boolean)),
      finaleTitle: z.string().trim().max(120),
      finaleMessage: z.string().trim().max(300),
      spoilerProtection: z.boolean(),
      autoScrollSpeed: z.preprocess(toNumber, z.number().min(10).max(200)),
      showRobot: z.boolean(),
      quality: z.enum(['high', 'medium', 'low']),
    })
    .partial(),
  // Read-only: the logo is only changed through the upload endpoint.
  ['logoUrl', 'updatedAt'],
)

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').max(254),
  password: z.string().min(1, 'Password is required').max(200),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(6, 'New password must be at least 6 characters').max(200),
  })
  .strict()

export const gotoSchema = z
  .object({
    stageIndex: z.preprocess(toNumber, z.number().int().min(-1e6).max(1e6)),
    step: z.preprocess(toNumber, z.number().int().min(-1e6).max(1e6)).optional(),
  })
  .strict()

export const deleteAllSchema = z
  .object({
    confirm: z.literal('DELETE ALL', { errorMap: () => ({ message: 'Type "DELETE ALL" to confirm' }) }),
  })
  .strict()

export const importOptionsSchema = z.object({
  mode: z.enum(['merge', 'replace']).default('merge'),
  dryRun: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
})

export const studentQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH, `Search text is limited to ${MAX_SEARCH_LENGTH} characters`).optional(),
})

/** MongoDB ObjectId as used in every `:id` route parameter. */
export const OBJECT_ID_RE = /^[0-9a-f]{24}$/i

/** Parse or throw a 400 VALIDATION HttpError. */
export function parse(schema, input) {
  const result = schema.safeParse(input ?? {})
  if (!result.success) throw zodToHttpError(result.error)
  return result.data
}

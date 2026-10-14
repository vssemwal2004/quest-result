import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { isDbUp } from './db/connect.js'
import { dbUnavailable, HttpError } from './errors.js'
import { DEFAULT_ADMIN } from './seed.js'

const ISSUER = 'ai-quest'
const AUDIENCE = 'ai-quest'
const SIGN_OPTIONS = { algorithm: 'HS256', expiresIn: '12h', issuer: ISSUER, audience: AUDIENCE }
const VERIFY_OPTIONS = { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, clockTolerance: 5 }

/** @param {{ passwordHash: string } | null} admin */
export async function usesDefaultPassword(admin) {
  return Boolean(admin) && bcrypt.compare(DEFAULT_ADMIN.password, admin.passwordHash)
}

// Compared against when the email is unknown / locked so response time does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('not-the-password', 10)

/** Password "version" a token is bound to: ms of the last password change (0 = never changed). */
const passwordVersion = (admin) => (admin.passwordChangedAt ? Date.parse(admin.passwordChangedAt) : 0)

/**
 * Failed-login counter per email (per process). After `maxFailures` failures in a row the email is locked
 * for `lockMs`; while locked every attempt fails with the same INVALID_CREDENTIALS answer, whether or not
 * the email exists (no user enumeration). A success resets the counter.
 */
export function createLoginLockout({ maxFailures = 8, lockMs = 5 * 60_000, maxEntries = 10_000, now = Date.now } = {}) {
  const entries = new Map() // email -> { failures, lockedUntil, lastAt }
  const key = (email) => String(email ?? '').trim().toLowerCase()

  function prune() {
    const t = now()
    for (const [k, e] of entries) if (e.lockedUntil <= t && t - e.lastAt > lockMs) entries.delete(k)
    // Still too big (spray of random emails): drop the oldest entries.
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
  }

  return {
    isLocked(email) {
      const e = entries.get(key(email))
      return Boolean(e) && e.lockedUntil > now()
    },
    fail(email) {
      const k = key(email)
      const t = now()
      let e = entries.get(k)
      if (!e || (e.lockedUntil <= t && t - e.lastAt > lockMs)) e = { failures: 0, lockedUntil: 0, lastAt: t }
      e.failures += 1
      e.lastAt = t
      if (e.failures >= maxFailures) {
        e.lockedUntil = t + lockMs
        e.failures = 0
      }
      entries.delete(k) // re-insert = most recent last (for the size cap)
      entries.set(k, e)
      if (entries.size > maxEntries) prune()
    },
    succeed(email) {
      entries.delete(key(email))
    },
    get size() {
      return entries.size
    },
  }
}

/**
 * @param {{ secret: string, repo: ReturnType<import('./db/repository.js').createRepository>,
 *           lockout?: ReturnType<typeof createLoginLockout> }} options
 */
export function createAuth({ secret, repo, lockout = createLoginLockout() }) {
  function signToken(admin) {
    return jwt.sign({ sub: admin.id, email: admin.email, pwv: passwordVersion(admin) }, secret, SIGN_OPTIONS)
  }

  /** @returns {Promise<{ token: string, user: { email: string } } | null>} */
  async function login(email, password) {
    const locked = lockout.isLocked(email)
    const admin = locked ? null : await repo.admins.findByEmail(email)
    const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH)
    if (locked) return null
    if (!admin || !ok) {
      lockout.fail(email)
      return null
    }
    lockout.succeed(email)
    return { token: signToken(admin), user: { email: admin.email } }
  }

  /** @param {string} adminId @param {string} password */
  async function verifyPassword(adminId, password) {
    const admin = await repo.admins.findById(adminId)
    const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH)
    return Boolean(admin) && ok
  }

  /** Signature / expiry / issuer / audience only (no database). @returns {object | null} payload */
  function decodeToken(token) {
    try {
      const payload = jwt.verify(token, secret, VERIFY_OPTIONS)
      return typeof payload === 'object' && typeof payload.sub === 'string' ? payload : null
    } catch {
      return null
    }
  }

  /** Full check incl. the admin still existing and no password change since the token was issued. */
  async function verifyToken(token) {
    const payload = decodeToken(token)
    if (!payload) return null
    const admin = await repo.admins.findById(payload.sub)
    if (!admin || (payload.pwv ?? 0) !== passwordVersion(admin)) return null
    return { id: admin.id, email: admin.email }
  }

  /** Express middleware: 401 UNAUTHORIZED unless a valid Bearer token is present; 503 while the DB is down. */
  async function requireAuth(req, _res, next) {
    try {
      const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')
      if (!match || !decodeToken(match[1])) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again')
      if (!isDbUp()) throw dbUnavailable()
      const user = await verifyToken(match[1])
      if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again')
      req.user = user
      next()
    } catch (err) {
      next(err)
    }
  }

  return { signToken, login, verifyPassword, decodeToken, verifyToken, requireAuth, lockout }
}

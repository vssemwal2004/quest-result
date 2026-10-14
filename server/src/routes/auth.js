import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { isDbUp } from '../db/connect.js'
import { asyncHandler, dbUnavailable, HttpError } from '../errors.js'
import { BCRYPT_ROUNDS } from '../seed.js'
import { changePasswordSchema, loginSchema, parse } from '../validation.js'

export function authRoutes({ repo, auth, limiters }) {
  const router = Router()

  router.post(
    '/login',
    limiters.login,
    asyncHandler(async (req, res) => {
      const { email, password } = parse(loginSchema, req.body)
      if (!isDbUp()) throw dbUnavailable()
      const session = await auth.login(email, password)
      if (!session) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password')
      res.set('Cache-Control', 'no-store').json(session)
    }),
  )

  router.get('/me', limiters.admin, auth.requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store').json({ user: { email: req.user.email } })
  })

  router.post(
    '/change-password',
    limiters.admin,
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const { currentPassword, newPassword } = parse(changePasswordSchema, req.body)
      // 400 (not 401) so the admin UI does not treat a typo as an expired session.
      if (!(await auth.verifyPassword(req.user.id, currentPassword))) {
        throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
      }
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
      const admin = await repo.admins.updatePassword(req.user.id, passwordHash)
      // Every token issued before the change is now rejected; hand this session a fresh one.
      res.set('Cache-Control', 'no-store').json({ ok: true, token: auth.signToken(admin) })
    }),
  )

  return router
}

import rateLimit from 'express-rate-limit'
import { HttpError } from './errors.js'

/**
 * express-rate-limit (per IP, in-memory per process) with the API's JSON error shape
 * `{ error: { code: 'RATE_LIMITED', message } }` and draft-7 `RateLimit` headers.
 * Behind a reverse proxy set TRUST_PROXY so the real client IP is used.
 */
export function limiter({ windowMs, limit, message, skip }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip,
    handler: (_req, _res, next) => next(new HttpError(429, 'RATE_LIMITED', message)),
  })
}

/** @param {ReturnType<import('./config.js').loadConfig>} config */
export function createLimiters(config) {
  return {
    login: limiter({
      windowMs: 60_000,
      limit: config.loginRateLimit,
      message: 'Too many sign-in attempts. Please wait a minute and try again.',
    }),
    admin: limiter({
      windowMs: 60_000,
      limit: config.adminRateLimit,
      message: 'Too many requests. Please slow down and try again in a minute.',
    }),
    presentation: limiter({
      windowMs: 10_000,
      limit: config.presentationRateLimit,
      message: 'Too many presentation commands. Please wait a few seconds.',
      skip: (req) => req.method === 'GET',
    }),
    publicShow: limiter({
      windowMs: 60_000,
      limit: config.publicRateLimit,
      message: 'Too many requests. The live show also updates by itself over the socket.',
    }),
  }
}

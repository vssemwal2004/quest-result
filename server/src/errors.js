import multer from 'multer'
import { ZodError } from 'zod'

export class HttpError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code machine-readable code, e.g. RANK_TAKEN
   * @param {string} message human-readable message (shown in the admin UI)
   * @param {unknown} [details]
   */
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`)

export const dbUnavailable = () =>
  new HttpError(503, 'DB_UNAVAILABLE', 'The database is not reachable right now. Please try again in a moment.')

/** Express 4 does not catch rejected promises; wrap async handlers with this. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next)
}

function formatPath(path) {
  return path.length ? path.join('.') : 'body'
}

export function zodToHttpError(err) {
  const details = err.issues.map((i) => ({ path: formatPath(i.path), message: i.message }))
  const first = details[0]
  return new HttpError(400, 'VALIDATION', first ? `${first.path}: ${first.message}` : 'Invalid input', details)
}

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'File is too large',
  LIMIT_FILE_COUNT: 'Too many files',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
  LIMIT_PART_COUNT: 'Too many form parts',
  LIMIT_FIELD_COUNT: 'Too many form fields',
  LIMIT_FIELD_KEY: 'Form field name too long',
  LIMIT_FIELD_VALUE: 'Form field value too long',
}

export function multerToHttpError(err, context = {}) {
  let message = MULTER_MESSAGES[err.code] ?? err.message
  if (err.code === 'LIMIT_FILE_SIZE' && context.maxBytes) {
    message += ` (max ${Math.round(context.maxBytes / (1024 * 1024))} MB)`
  }
  if (err.code === 'LIMIT_FILE_COUNT' && context.maxFiles) message += ` (max ${context.maxFiles})`
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    message += ` "${err.field}"` + (context.field ? ` (expected "${context.field}")` : '')
  }
  if (err.filename && err.code === 'LIMIT_FILE_SIZE') message = `${err.filename}: ${message}`
  return new HttpError(400, 'UPLOAD_' + String(err.code).replace(/^LIMIT_/, ''), message)
}

/** Driver / mongoose errors that mean "the database is unreachable" (not a bad query). */
export function isDbUnavailableError(err) {
  const name = String(err?.name ?? '')
  if (/^(MongoServerSelectionError|MongooseServerSelectionError|MongoNetworkError|MongoNetworkTimeoutError|MongoNotConnectedError|MongoTopologyClosedError|PoolClearedError|MongoPoolClearedError)$/.test(name)) {
    return true
  }
  return /buffering timed out|Client must be connected|connection .* closed|Topology is closed/i.test(String(err?.message ?? ''))
}

function toHttpError(err) {
  if (err instanceof HttpError) return err
  if (err instanceof ZodError) return zodToHttpError(err)
  if (err instanceof multer.MulterError) return multerToHttpError(err)
  if (isDbUnavailableError(err)) return dbUnavailable()
  // body-parser errors
  if (err?.type === 'entity.parse.failed') return new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON')
  if (err?.type === 'entity.too.large') return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
  if (err?.type === 'encoding.unsupported' || err?.type === 'charset.unsupported') {
    return new HttpError(415, 'UNSUPPORTED_ENCODING', 'Unsupported request body encoding')
  }
  if (err?.status === 404 || err?.statusCode === 404) return notFound()
  return null
}

/**
 * Final Express error handler: always answers `{ error: { code, message, details?, requestId } }`.
 * Unexpected errors are logged with the request id; their message / stack never reach the client.
 */
export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
  return (err, req, res, next) => {
    const httpErr = toHttpError(err)
    const requestId = req.id
    if (!httpErr) {
      logger.error(`[error] ${requestId ? `[${requestId}] ` : ''}${req.method} ${req.originalUrl}:`, err)
    } else if (httpErr.status === 503) {
      logger.warn?.(`[error] ${requestId ? `[${requestId}] ` : ''}${req.method} ${req.originalUrl}: ${httpErr.code}`)
    }
    const e = httpErr ?? new HttpError(500, 'INTERNAL', 'Something went wrong on the server')
    if (res.headersSent) return res.end()
    const body = { error: { code: e.code, message: e.message } }
    if (e.details !== undefined) body.error.details = e.details
    if (requestId) body.error.requestId = requestId
    if (e.status === 503) res.set('Retry-After', '5')
    res.status(e.status).set('Cache-Control', 'no-store').json(body)
  }
}

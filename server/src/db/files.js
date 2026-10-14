/**
 * Student photos and the event logo in the GridFS bucket `uploads` (`uploads.files` / `uploads.chunks`).
 * The server keeps nothing on local disk.
 */
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import mongoose from 'mongoose'
import { notFound } from '../errors.js'
import { parseObjectId } from './mappers.js'

export const BUCKET_NAME = 'uploads'
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

let cached = { db: null, bucket: null }

/** GridFS bucket on the current default connection (re-created after a reconnect to another db). */
export function getBucket() {
  const db = mongoose.connection.db
  if (!db) throw new Error('MongoDB is not connected')
  if (cached.db !== db) cached = { db, bucket: new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME }) }
  return cached.bucket
}

/**
 * Store a file. Metadata: `{ kind, studentId?, contentType, originalName }` (+ `legacyUrl` for migrated files).
 * @param {{ buffer: Buffer, contentType: string, originalName?: string, kind: 'photo' | 'logo',
 *           studentId?: string | null, legacyUrl?: string }} file
 * @returns {Promise<mongoose.Types.ObjectId>} the new file id
 */
export async function saveBuffer({ buffer, contentType, originalName = '', kind, studentId = null, legacyUrl }) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('saveBuffer: buffer must be a Buffer')
  if (kind !== 'photo' && kind !== 'logo') throw new TypeError(`saveBuffer: unknown kind "${kind}"`)
  if (!contentType) throw new TypeError('saveBuffer: contentType is required')
  const metadata = { kind, contentType, originalName: String(originalName).slice(0, 255) }
  if (studentId) metadata.studentId = String(studentId)
  if (legacyUrl) metadata.legacyUrl = legacyUrl
  const upload = getBucket().openUploadStream(metadata.originalName || kind, { metadata })
  await pipeline(Readable.from([buffer]), upload)
  return upload.id
}

const isFileNotFound = (err) => /file not found|FileNotFound/i.test(String(err?.message ?? '')) || err?.code === 'ENOENT'

/**
 * Delete a stored file. Unknown / invalid / null ids are ignored (idempotent).
 * @param {mongoose.Types.ObjectId | string | null | undefined} id
 * @returns {Promise<boolean>} true when a file was deleted
 */
export async function deleteFile(id) {
  const oid = parseObjectId(id)
  if (!oid) return false
  try {
    await getBucket().delete(oid)
    return true
  } catch (err) {
    if (isFileNotFound(err)) return false
    throw err
  }
}

/**
 * Delete several files; never throws for missing ones.
 * @param {Iterable<mongoose.Types.ObjectId | string | null | undefined>} ids
 */
export async function deleteFiles(ids) {
  const unique = [...new Set([...ids].filter(Boolean).map(String))]
  await Promise.all(unique.map((id) => deleteFile(id)))
}

/** GridFS `files` document or null. */
export async function findFile(id) {
  const oid = parseObjectId(id)
  if (!oid) return null
  return getBucket().find({ _id: oid }).limit(1).next()
}

/** Read a whole stored file into memory (small images only; used by tests and tools). */
export async function readFileBuffer(id) {
  const oid = parseObjectId(id)
  if (!oid) return null
  const chunks = []
  try {
    for await (const chunk of getBucket().openDownloadStream(oid)) chunks.push(chunk)
  } catch (err) {
    if (isFileNotFound(err)) return null
    throw err
  }
  return Buffer.concat(chunks)
}

function etagMatches(header, etag) {
  if (typeof header !== 'string' || !header) return false
  if (header.trim() === '*') return true
  const bare = etag.replace(/"/g, '')
  return header.split(',').some((part) => part.trim().replace(/^W\//, '').replace(/"/g, '') === bare)
}

/**
 * Express handler for `GET /uploads/:id`: streams from GridFS with a long immutable cache,
 * `ETag` = file id, 304 on `If-None-Match`, 404 (`NOT_FOUND`) for unknown or malformed ids.
 * Mount it as `app.get('/uploads/:id', serveUpload())` (HEAD is handled too).
 * @param {{ logger?: Console }} [options]
 */
export function serveUpload({ logger = console } = {}) {
  return async function serveUploadHandler(req, res, next) {
    try {
      const oid = parseObjectId(req.params.id)
      if (!oid) return next(notFound('File'))
      const file = await findFile(oid)
      if (!file) return next(notFound('File'))

      const etag = `"${oid.toHexString()}"`
      const contentType = file.metadata?.contentType || file.contentType || 'application/octet-stream'
      res.setHeader('ETag', etag)
      res.setHeader('Cache-Control', CACHE_CONTROL)
      if (etagMatches(req.get('if-none-match'), etag)) return res.status(304).end()

      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Length', String(file.length))
      res.setHeader('X-Content-Type-Options', 'nosniff')
      // An SVG opened directly must not be able to run script on our origin.
      if (contentType === 'image/svg+xml') res.setHeader('Content-Security-Policy', SVG_CSP)
      if (req.method === 'HEAD') return res.status(200).end()

      const download = getBucket().openDownloadStream(oid)
      download.once('error', (err) => {
        if (!res.headersSent) {
          res.removeHeader('Content-Length')
          res.removeHeader('Content-Type')
          res.removeHeader('ETag')
          res.removeHeader('Cache-Control')
          next(isFileNotFound(err) ? notFound('File') : err)
        } else {
          logger.error?.(`[uploads] stream of ${oid} failed: ${err.message}`)
          res.destroy(err)
        }
      })
      res.once('close', () => download.destroy())
      res.status(200)
      download.pipe(res)
    } catch (err) {
      next(err)
    }
  }
}

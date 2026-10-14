import path from 'node:path'
import multer from 'multer'
import { deleteFile, getBucket } from './db/files.js'
import { HttpError, multerToHttpError } from './errors.js'

const MB = 1024 * 1024
const HEAD_BYTES = 1024
const RASTER = ['jpeg', 'png', 'webp']
const TYPE_FOR_EXT = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp', '.svg': 'svg' }
export const MIME_FOR_TYPE = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' }

export const UPLOAD_KINDS = {
  photo: { maxBytes: 5 * MB, types: RASTER, label: 'JPG, PNG or WebP' },
  logo: { maxBytes: 3 * MB, types: [...RASTER, 'svg'], label: 'PNG, JPG, WebP or SVG' },
}
export const MAX_BULK_PHOTOS = 250
export const MAX_IMPORT_BYTES = 5 * MB
export const IMPORT_EXTENSIONS = ['.csv', '.xlsx']

/** Sniff the real image type from the first bytes; null if it is not an accepted image. */
export function detectImageType(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png'
  }
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp'
  }
  const textStart = head.toString('utf8').replace(/^﻿/, '').trimStart()
  if (/^<(\?xml|svg|!--|!doctype svg)/i.test(textStart) && /<svg[\s>]/i.test(textStart)) return 'svg'
  return null
}

/**
 * Why an SVG is unsafe to serve, or null when it passes. The logo is shown in <img> (where scripts never run)
 * but could also be opened directly, so anything active or external is refused:
 * scripts, event handlers, javascript:/data: URLs, external references, foreignObject, DTD/entities.
 */
export function svgProblem(buffer) {
  const svg = buffer.toString('utf8')
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) return 'contains a DTD / entity declaration'
  if (/<\s*script\b/i.test(svg)) return 'contains a <script> element'
  if (/<\s*(foreignObject|iframe|embed|object|audio|video|use)\b/i.test(svg)) return 'contains embedded or referenced content'
  if (/[\s"'/]on[a-z]+\s*=/i.test(svg)) return 'contains an event handler attribute'
  if (/(?:java|vb)script\s*:/i.test(svg)) return 'contains a script URL'
  const refs = [...svg.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)].map((m) => m[2].trim())
  if (refs.some((r) => !r.startsWith('#'))) return 'references an external resource'
  if (/url\(\s*["']?\s*(?!#)[^)\s]/i.test(svg)) return 'references an external resource in CSS'
  if (/@import/i.test(svg)) return 'imports external CSS'
  return null
}

/** Rank from a bulk photo file name: "17.jpg" / "017.PNG" → 17; anything else → null. */
export function rankFromFileName(name) {
  const stem = path.parse(String(name ?? '')).name.trim()
  return /^\d+$/.test(stem) ? Number(stem) : null
}

/**
 * multer StorageEngine that streams each file straight into GridFS (no RAM buffering, no local disk):
 * the first bytes are sniffed for a real image type BEFORE anything is written; non-images are drained and
 * reported as `{ rejected: true }` (no GridFS file). Size limits are multer's `limits.fileSize`; a file that
 * hits the limit is deleted from GridFS. SVGs (logo only, ≤ 3 MB) are buffered whole and checked by svgProblem().
 * Stored names are generic (`photo.png`); the user's file name is only kept as metadata.
 *
 * `accept(req, file)` may return false to skip a file without storing it (bulk photos with an unknown rank),
 * or an object merged into the file info.
 */
class GridFsImageStorage {
  constructor(kind, { accept } = {}) {
    this.kind = kind
    this.spec = UPLOAD_KINDS[kind]
    this.accept = accept
  }

  _handleFile(req, file, cb) {
    const { kind, spec } = this
    const src = file.stream
    const accepted = this.accept ? this.accept(req, file) : {}
    if (!accepted) {
      src.resume()
      return cb(null, { skipped: true })
    }
    const extra = accepted

    let settled = false
    let truncated = false
    let ended = false
    let upload = null
    const parts = []
    let received = 0

    const settle = (err, info) => {
      if (settled) return
      settled = true
      src.removeListener('data', onData)
      cb(err, info)
    }
    const discard = (err) => {
      if (settled) return
      const id = upload?.id
      upload = null
      if (!id) return settle(err)
      deleteFile(id)
        .catch(() => {})
        .finally(() => settle(err))
    }
    const reject = (reason) => {
      src.resume() // drain the rest so the next part can be parsed
      settle(null, { rejected: true, rejectReason: reason, ...extra })
    }

    src.on('limit', () => {
      truncated = true
    })
    src.once('error', (err) => discard(err))
    src.once('end', () => {
      ended = true
      if (!upload && !settled) decide()
    })
    src.on('data', onData)

    let sniffed = null
    function onData(chunk) {
      parts.push(chunk)
      received += chunk.length
      if (sniffed === null && received >= HEAD_BYTES) {
        sniffed = detectImageType(Buffer.concat(parts).subarray(0, HEAD_BYTES)) ?? false
        if (!sniffed || !spec.types.includes(sniffed)) return reject('not an image')
        if (sniffed !== 'svg') {
          src.pause()
          decide()
        }
        // SVG: keep buffering (bounded by the logo limit) until 'end'.
      }
    }

    function decide() {
      src.removeListener('data', onData)
      if (truncated) {
        src.resume()
        return settle(new HttpError(400, 'UPLOAD_FILE_SIZE', `${file.originalname}: File is too large`))
      }
      const head = Buffer.concat(parts)
      const type = sniffed || detectImageType(head.subarray(0, HEAD_BYTES))
      if (!type || !spec.types.includes(type)) return reject('not an image')
      if (type === 'svg') {
        const problem = svgProblem(head)
        if (problem) return reject(`SVG ${problem}`)
      }
      const contentType = MIME_FOR_TYPE[type]
      const metadata = { kind, contentType, originalName: String(file.originalname ?? '').slice(0, 255) }
      upload = getBucket().openUploadStream(`${kind}.${type === 'jpeg' ? 'jpg' : type}`, { metadata })
      const current = upload
      current.once('error', (err) => {
        src.unpipe(current)
        src.resume()
        discard(err)
      })
      current.once('finish', () => {
        if (upload !== current) return
        if (truncated) return discard(new HttpError(400, 'UPLOAD_FILE_SIZE', `${file.originalname}: File is too large`))
        settle(null, { id: current.id, fileId: String(current.id), contentType, imageType: type, ...extra })
      })
      current.write(head)
      if (ended) current.end()
      else src.pipe(current) // resumes the paused source; backpressure is handled by pipe
    }
  }

  _removeFile(_req, file, cb) {
    if (!file?.id) return cb(null)
    deleteFile(file.id).then(
      () => cb(null),
      (err) => cb(err),
    )
  }
}

/** Wrap a multer middleware so its errors become clear 400s for this route. */
function withErrors(middleware, context) {
  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (err instanceof multer.MulterError) return next(multerToHttpError(err, context))
      next(err)
    })
}

/** Extension + declared MIME check (before any byte is stored); the content is sniffed by the engine. */
function imageFilter(spec) {
  return (_req, file, cb) => {
    const type = TYPE_FOR_EXT[path.extname(file.originalname).toLowerCase()]
    const mimeOk = file.mimetype === 'application/octet-stream' || Object.values(MIME_FOR_TYPE).includes(file.mimetype)
    if (!type || !spec.types.includes(type) || !mimeOk) {
      return cb(new HttpError(400, 'UNSUPPORTED_FILE', `${file.originalname}: only ${spec.label} images are allowed`))
    }
    cb(null, true)
  }
}

export function createUploads() {
  const imageUploader = (kind, engineOptions) =>
    multer({
      storage: new GridFsImageStorage(kind, engineOptions),
      limits: { fileSize: UPLOAD_KINDS[kind].maxBytes, files: MAX_BULK_PHOTOS, fields: 10, parts: MAX_BULK_PHOTOS + 10 },
      defParamCharset: 'utf8',
      fileFilter: imageFilter(UPLOAD_KINDS[kind]),
    })

  const photo = imageUploader('photo')
  // Bulk: only files named after a known rank are stored (req.photoRanks is set by the route). If two valid
  // files name the same rank, the route keeps the first and deletes the other.
  const bulkPhoto = imageUploader('photo', {
    accept(req, file) {
      const rank = rankFromFileName(file.originalname)
      return rank !== null && req.photoRanks?.has(rank) ? { rank } : false
    },
  })
  const logo = imageUploader('logo')
  const mb = (kind) => ({ maxBytes: UPLOAD_KINDS[kind].maxBytes })

  const importer = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 10 },
    defParamCharset: 'utf8',
    fileFilter: (_req, file, cb) => {
      if (!IMPORT_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())) {
        return cb(new HttpError(400, 'UNSUPPORTED_FILE', 'Upload a .csv or .xlsx file'))
      }
      cb(null, true)
    },
  })

  /**
   * GridFS file id of an accepted single upload; 400 NO_FILE / UNSUPPORTED_FILE otherwise.
   * @param {any} file req.file @param {'photo' | 'logo'} kind @param {string} field
   */
  function storedFileId(file, kind, field) {
    if (!file) throw new HttpError(400, 'NO_FILE', `Choose a ${kind === 'logo' ? 'logo image' : 'photo'} to upload (field "${field}")`)
    if (!file.fileId) {
      const reason = file.rejectReason?.startsWith('SVG') ? ` (${file.rejectReason})` : ''
      throw new HttpError(400, 'UNSUPPORTED_FILE', `${file.originalname} is not a valid ${UPLOAD_KINDS[kind].label} image${reason}`)
    }
    return file.fileId
  }

  return {
    photoSingle: withErrors(photo.single('photo'), { ...mb('photo'), field: 'photo' }),
    photosMany: withErrors(
      bulkPhoto.fields([
        { name: 'photos', maxCount: MAX_BULK_PHOTOS },
        { name: 'photos[]', maxCount: MAX_BULK_PHOTOS },
      ]),
      { ...mb('photo'), maxFiles: MAX_BULK_PHOTOS, field: 'photos' },
    ),
    logoSingle: withErrors(logo.single('logo'), { ...mb('logo'), field: 'logo' }),
    importSingle: withErrors(importer.single('file'), { maxBytes: MAX_IMPORT_BYTES, field: 'file' }),
    storedFileId,
  }
}

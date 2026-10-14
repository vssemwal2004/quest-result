import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

const SPA_EXCLUDED = /^\/(api|uploads|socket\.io)(\/|$)/
const HASHED_ASSET = /^\/assets\//
const IMMUTABLE = 'public, max-age=31536000, immutable'

/** Accept-Encoding → ordered list of precompressed variants we may serve. */
function acceptedVariants(header) {
  const h = String(header ?? '').toLowerCase()
  const allows = (enc) => new RegExp(`(^|[\\s,])${enc}(?![^,]*;\\s*q=0(\\.0*)?(\\s*,|$))`).test(h)
  const out = []
  if (allows('br')) out.push({ ext: '.br', encoding: 'br' })
  if (allows('gzip')) out.push({ ext: '.gz', encoding: 'gzip' })
  return out
}

/**
 * Serve `<file>.br` / `<file>.gz` from the client build when the browser accepts it (e.g. produced by a
 * vite compression plugin). Existence checks are cached; the build folder does not change while running.
 */
function precompressed(root) {
  const exists = new Map()
  const has = (file) => {
    let v = exists.get(file)
    if (v === undefined) {
      try {
        v = fs.statSync(file).isFile()
      } catch {
        v = false
      }
      exists.set(file, v)
    }
    return v
  }
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    let rel
    try {
      rel = decodeURIComponent(req.path)
    } catch {
      return next()
    }
    if (rel.endsWith('/') || rel.includes('\0')) return next()
    const file = path.join(root, path.normalize(rel))
    if (!file.startsWith(root + path.sep)) return next()
    const variant = acceptedVariants(req.get('accept-encoding')).find((v) => has(file + v.ext))
    if (!variant || !has(file)) return next()
    res.setHeader('Content-Encoding', variant.encoding)
    res.setHeader('Vary', 'Accept-Encoding')
    res.setHeader('Cache-Control', HASHED_ASSET.test(rel) ? IMMUTABLE : 'no-cache')
    res.type(path.extname(file))
    res.sendFile(file + variant.ext, { lastModified: true, cacheControl: false }, (err) => {
      if (err && !res.headersSent) {
        res.removeHeader('Content-Encoding')
        next()
      }
    })
  }
}

/**
 * Production client (client/dist): hashed /assets/* cached forever, everything else `no-cache`,
 * precompressed variants when present, SPA fallback to index.html for non-API paths.
 * @returns {boolean} false when the client is not built
 */
export function serveClient(app, clientDist) {
  const root = path.resolve(clientDist)
  const indexHtml = path.join(root, 'index.html')
  if (!fs.existsSync(indexHtml)) {
    app.get('/', (_req, res) => {
      res
        .type('text/plain')
        .send('AI Quest API is running. The client is not built yet: run "npm run build" (or use the Vite dev server on :5173).')
    })
    return false
  }
  app.use(precompressed(root))
  app.use(
    express.static(root, {
      index: false,
      setHeaders: (res, file) => {
        const hashedAsset = path.relative(root, file).split(path.sep)[0] === 'assets'
        res.setHeader('Cache-Control', hashedAsset ? IMMUTABLE : 'no-cache')
      },
    }),
  )
  app.get('*', (req, res, next) => {
    if (SPA_EXCLUDED.test(req.path)) return next()
    res.sendFile(indexHtml, { headers: { 'Cache-Control': 'no-cache' } })
  })
  return true
}

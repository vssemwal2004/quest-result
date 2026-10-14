// Post-build: write .br and .gz siblings for compressible assets so the server can send them as-is.
// Usage: node scripts/precompress.mjs <distDir>
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/precompress.mjs <distDir>')
  process.exit(2)
}

const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.wasm', '.ttf', '.otf'])
const MIN_BYTES = 1024

async function* walk(d) {
  for (const entry of await readdir(d, { withFileTypes: true })) {
    const p = join(d, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else yield p
  }
}

let files = 0
let before = 0
let afterBr = 0
for await (const file of walk(dir)) {
  if (!COMPRESSIBLE.has(extname(file))) continue
  const { size } = await stat(file)
  if (size < MIN_BYTES) continue
  const buf = await readFile(file)
  const br = brotliCompressSync(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: size },
  })
  await writeFile(file + '.br', br)
  await writeFile(file + '.gz', gzipSync(buf, { level: 9 }))
  files++
  before += size
  afterBr += br.length
}
const kb = (n) => (n / 1024).toFixed(0) + ' KB'
console.log(`precompressed ${files} files: ${kb(before)} -> ${kb(afterBr)} brotli`)

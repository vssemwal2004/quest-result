// Headless screenshot helper (dev tooling, not shipped).
// Usage:
//   node scripts/shot.mjs <url> <out.png> [--w 1920] [--h 1080] [--wait 3500] [--admin] [--keys ArrowRight,ArrowRight] [--full] [--fps 5]
// Uses the real GPU (Intel Iris Xe on the dev laptop) — --fps reports a meaningful frame rate.
// --admin logs in as the seeded admin through the API and injects the JWT into localStorage first.
// Base URL defaults to http://localhost:5173 when <url> starts with "/".
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf('--' + name)
  return i >= 0 ? args[i + 1] : def
}
const flag = (name) => args.includes('--' + name)
let [url, out] = args
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [--w] [--h] [--wait] [--admin] [--keys] [--full]')
  process.exit(2)
}
const base = process.env.SHOT_BASE ?? 'http://localhost:5173'
if (url.startsWith('/')) url = base + url

const candidates = [
  process.env.SHOT_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const executablePath = candidates.find((p) => existsSync(p))

const browser = await chromium.launch({
  executablePath,
  headless: true,
  // Real GPU by default (D3D11 via ANGLE) so frame rates are meaningful; SHOT_GPU=soft forces SwiftShader.
  args:
    process.env.SHOT_GPU === 'soft'
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({
  viewport: { width: Number(opt('w', 1920)), height: Number(opt('h', 1080)) },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
const logs = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

if (flag('admin')) {
  const origin = new URL(url).origin
  const res = await fetch(origin + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SHOT_EMAIL ?? 'a@gmail.com', password: process.env.SHOT_PASSWORD ?? '123456' }),
  })
  if (!res.ok) {
    console.error('login failed', res.status, await res.text())
    process.exit(1)
  }
  const { token } = await res.json()
  await context.addInitScript((t) => localStorage.setItem('aiquest.token', t), token)
}

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => logs.push('[goto] ' + e.message))
await page.waitForTimeout(Number(opt('wait', 3500)))
const keys = opt('keys', '')
for (const k of keys.split(',').filter(Boolean)) {
  await page.keyboard.press(k)
  await page.waitForTimeout(Number(opt('keywait', 1200)))
}
// --fps <seconds>: measure the real frame rate (rAF) and long frames over a window.
const fpsWindow = Number(opt('fps', 0))
if (fpsWindow > 0) {
  const stats = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const deltas = []
        let last = performance.now()
        const start = last
        const tick = (now) => {
          deltas.push(now - last)
          last = now
          if (now - start < ms) requestAnimationFrame(tick)
          else {
            const sorted = [...deltas].sort((a, b) => a - b)
            const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
            resolve({
              fps: +(deltas.length / ((now - start) / 1000)).toFixed(1),
              p50ms: +p(0.5).toFixed(1),
              p95ms: +p(0.95).toFixed(1),
              maxms: +sorted[sorted.length - 1].toFixed(1),
              longFrames: deltas.filter((d) => d > 34).length,
            })
          }
        }
        requestAnimationFrame(tick)
      }),
    fpsWindow * 1000,
  )
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none'
  })
  console.log('fps', JSON.stringify({ ...stats, gpu }))
}
mkdirSync(dirname(out), { recursive: true })
await page.screenshot({ path: out, fullPage: flag('full'), timeout: 60000 })
await browser.close()
console.log('saved', out)
if (logs.length) console.log('console:\n' + logs.slice(0, 40).join('\n'))

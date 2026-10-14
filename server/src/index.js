import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'
import { createApp } from './app.js'
import { usesDefaultPassword } from './auth.js'
import { SERVER_ROOT } from './config.js'

// Configuration is read when createApp() runs, so loading .env here is early enough.
dotenv.config({ path: path.join(SERVER_ROOT, '.env') })

const SHUTDOWN_GRACE_MS = 10_000

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)
}

let ctx = null
let shuttingDown = false

/** Close HTTP + Socket.IO + MongoDB, but never take longer than SHUTDOWN_GRACE_MS. */
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n[${reason}] shutting down…`)
  const force = setTimeout(() => {
    console.error(`[shutdown] still busy after ${SHUTDOWN_GRACE_MS / 1000} s — forcing exit`)
    process.exit(exitCode || 1)
  }, SHUTDOWN_GRACE_MS)
  force.unref()
  try {
    await ctx?.close({ drainMs: SHUTDOWN_GRACE_MS - 2000 })
  } catch (err) {
    console.error('[shutdown]', err.message)
    exitCode ||= 1
  }
  process.exit(exitCode)
}

// A crashed process must not limp on in an unknown state: log, close what we can, exit non-zero
// so the supervisor (pm2 / systemd / Docker / Render …) restarts it.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason)
  void shutdown('unhandledRejection', 1)
})
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err)
  void shutdown('uncaughtException', 1)
})
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => void shutdown(signal))

try {
  ctx = await createApp()
} catch (err) {
  console.error(`[boot] ${err.message}`)
  process.exit(1)
}

const { httpServer, config } = ctx

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`[boot] Port ${config.port} is already in use. Set PORT to another value.`)
  else console.error('[boot]', err)
  void shutdown('listen error', 1)
})

httpServer.listen(config.port, async () => {
  const base = `http://localhost:${config.port}`
  console.log(`\n  AI Quest server ready`)
  console.log(`  Show   ${base}/`)
  console.log(`  Admin  ${base}/admin`)
  for (const ip of lanAddresses()) console.log(`  LAN    http://${ip}:${config.port}/`)
  if (!ctx.clientServed) console.log(`  (client not built — during development open http://localhost:5173)`)
  console.log(`  DB     ${ctx.memoryDb ? `IN-MEMORY (${ctx.dbName}) — data is lost on exit` : ctx.dbTarget}`)
  if (config.socketAdapter === 'mongo') console.log('  Socket multi-instance mode (mongo adapter)')
  console.log('')
  try {
    if (await usesDefaultPassword(await ctx.repo.admins.getPrimary())) {
      console.warn('  Note: the admin still uses the default password. Change it in Admin → Settings → Account before going live.\n')
    }
  } catch {
    /* informational only */
  }
})

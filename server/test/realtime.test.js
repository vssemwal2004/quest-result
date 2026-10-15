import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { io as connect } from 'socket.io-client'
import { addStudents, range, startServer, student } from './helpers/server.js'

const BROADCAST_DELAY_MS = 250

/** Resolve with the first event payload matching `predicate`. */
function waitFor(socket, event, predicate = () => true, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`timed out waiting for ${event}`))
    }, timeoutMs)
    function handler(payload) {
      if (!predicate(payload)) return
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    }
    socket.on(event, handler)
  })
}

describe('socket.io', () => {
  let srv
  let token
  const sockets = []
  const open = () => {
    const s = connect(srv.base, { path: '/socket.io', transports: ['websocket'], forceNew: true, reconnection: false })
    sockets.push(s)
    return s
  }

  before(async () => {
    // A wide coalescing window: three concurrent MongoDB-backed PUTs on a busy machine can land >30 ms apart.
    srv = await startServer({ broadcastDelayMs: BROADCAST_DELAY_MS })
    token = await srv.login()
    await addStudents((m, r, o) => srv.request(m, r, { ...o, token }), null, range(1, 25).map((r) => student(r)))
  })
  after(async () => {
    for (const s of sockets) s.close()
    await srv.close()
  })

  it('sends a spoiler-filtered show:update on connect', async () => {
    const socket = open()
    const payload = await waitFor(socket, 'show:update')
    assert.deepEqual([payload.state.stageIndex, payload.state.step], [0, 0])
    assert.equal(payload.totalWinners, 25)
    assert.ok(payload.stages.every((s) => s.students.length === 0))
    assert.equal(typeof payload.version, 'number')
    assert.ok(payload.serverTime)
  })

  it('broadcasts after navigation with a higher version', async () => {
    const socket = open()
    const initial = await waitFor(socket, 'show:update')
    const next = waitFor(socket, 'show:update', (p) => p.state.stageIndex === 1)
    const res = await srv.request('POST', '/api/admin/presentation/next', { token })
    assert.equal(res.status, 200)
    const payload = await next
    assert.ok(payload.version > initial.version)
    assert.equal(payload.state.step, 0)

    // Jump to a populated grid tier, show anonymous cards, then reveal one.
    const gridIndex = initial.stages.findIndex((stage) => stage.tier?.style === 'grid' && stage.studentCount > 0)
    assert.ok(gridIndex > 0)
    const atGrid = waitFor(socket, 'show:update', (p) => p.state.stageIndex === gridIndex)
    await srv.request('POST', '/api/admin/presentation/goto', { token, json: { stageIndex: gridIndex } })
    await atGrid
    const anonymous = waitFor(socket, 'show:update', (p) => p.state.stageIndex === gridIndex && p.state.step === 1)
    await srv.request('POST', '/api/admin/presentation/next', { token })
    assert.equal((await anonymous).stages[gridIndex].students.length, 0)
    const suspense = waitFor(socket, 'show:update', (p) => p.state.stageIndex === gridIndex && p.state.step === 2)
    await srv.request('POST', '/api/admin/presentation/next', { token })
    assert.equal((await suspense).stages[gridIndex].students.length, 0)
    const reveal = waitFor(socket, 'show:update', (p) => p.state.stageIndex === gridIndex && p.state.step === 3)
    await srv.request('POST', '/api/admin/presentation/next', { token })
    const revealed = await reveal
    assert.equal(revealed.stages[gridIndex].students.length, 1)
    assert.ok(revealed.stages.slice(gridIndex + 1).every((s) => s.students.length === 0))
  })

  it('broadcasts settings changes and coalesces bursts', async () => {
    const socket = open()
    await waitFor(socket, 'show:update')
    const updates = []
    socket.on('show:update', (p) => updates.push(p))
    await Promise.all(
      ['A', 'B', 'C'].map((t) =>
        srv.request('PUT', '/api/admin/settings', { token, json: { eventEdition: `Results ${t}` } }),
      ),
    )
    await new Promise((r) => setTimeout(r, BROADCAST_DELAY_MS * 2))
    assert.ok(updates.length >= 1 && updates.length < 3, `got ${updates.length} updates`)
    assert.match(updates.at(-1).settings.eventEdition, /^Results [ABC]$/)
  })

  it('broadcasts the viewer count', async () => {
    const a = open()
    await waitFor(a, 'show:update')
    const viewers = waitFor(a, 'viewers', (p) => p.count >= 2)
    const b = open()
    const bInitial = waitFor(b, 'show:update')
    const { count } = await viewers
    assert.ok(count >= 2)
    await bInitial
  })
})

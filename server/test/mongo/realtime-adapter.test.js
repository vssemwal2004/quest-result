/**
 * SOCKET_ADAPTER=mongo: two Socket.IO "instances" (same process, same replica-set database) must share
 * broadcasts, invalidate each other's payload cache and sum their viewer counts.
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, describe, test } from 'node:test'
import mongoose from 'mongoose'
import { io as connect } from 'socket.io-client'
import { createRealtime, SOCKET_EVENTS_COLLECTION } from '../../src/realtime.js'
import { quietLogger, startMongo } from './helpers.js'

function fakeCache(label) {
  let version = 1
  return {
    invalidations: 0,
    invalidate() {
      this.invalidations++
      version++
    },
    async publicPayload() {
      return { from: label, version, serverTime: new Date().toISOString() }
    },
  }
}

const waitFor = (socket, event, predicate = () => true, timeoutMs = 10_000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs)
    socket.on(event, function handler(payload) {
      if (!predicate(payload)) return
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    })
  })

const until = async (fn, timeoutMs = 15_000) => {
  const end = Date.now() + timeoutMs
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('condition not reached in time')
    await new Promise((r) => setTimeout(r, 100))
  }
}

let mongo
const instances = []
const sockets = []

async function startInstance(label) {
  const httpServer = http.createServer()
  const cache = fakeCache(label)
  const realtime = await createRealtime({ httpServer, cache, adapter: 'mongo', broadcastDelayMs: 5, viewersThrottleMs: 20, logger: quietLogger })
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
  const inst = { label, cache, realtime, base: `http://127.0.0.1:${httpServer.address().port}` }
  instances.push(inst)
  return inst
}

const open = (base) => {
  const s = connect(base, { transports: ['websocket'], forceNew: true, reconnection: false })
  sockets.push(s)
  return s
}

before(async () => {
  mongo = await startMongo({ replSet: true })
})
after(async () => {
  for (const s of sockets) s.close()
  for (const i of instances) await i.realtime.close()
  await mongo?.stop()
})

describe('mongo socket adapter', () => {
  test('refuses a standalone mongod with a clear message', async () => {
    const fakeDb = { admin: () => ({ command: async () => ({ isWritablePrimary: true }) }) }
    await assert.rejects(
      createRealtime({ httpServer: http.createServer(), cache: fakeCache('x'), adapter: 'mongo', db: fakeDb, logger: quietLogger }),
      /replica set/,
    )
  })

  test('creates a capped events collection, shares broadcasts, invalidations and viewer counts', async () => {

    const a = await startInstance('A')
    const b = await startInstance('B')
    const [info] = await mongoose.connection.db.listCollections({ name: SOCKET_EVENTS_COLLECTION }).toArray()
    assert.equal(info.options.capped, true)

    const onA = open(a.base)
    const onB = open(b.base)
    assert.equal((await waitFor(onA, 'show:update')).from, 'A', 'connect payload comes from the local cache')
    assert.equal((await waitFor(onB, 'show:update')).from, 'B')

    // Wait until both nodes know each other (adapter heartbeats), then a change on A reaches B's client
    // and makes B drop its cache.
    await until(async () => (await a.realtime.viewerCount({ fresh: true })) === 2)
    const fromA = waitFor(onB, 'show:update', (p) => p.from === 'A')
    a.realtime.broadcastShow()
    await fromA
    await until(() => b.cache.invalidations > 0)
    assert.equal(a.cache.invalidations, 0, 'the sender does not receive its own invalidation')

    const third = open(b.base)
    await waitFor(third, 'show:update')
    await until(async () => (await b.realtime.viewerCount({ fresh: true })) === 3)
    assert.equal(await a.realtime.viewerCount({ fresh: true }), 3)
  })
})

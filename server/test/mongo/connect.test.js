import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import mongoose from 'mongoose'
import {
  connectionHints,
  connectMongo,
  DEFAULT_DB_NAME,
  disconnectMongo,
  isDbUp,
  pingDb,
  redactMongoUri,
  resolveDbName,
} from '../../src/db/connect.js'
import { createMemoryServer, quietLogger } from './helpers.js'

describe('URI helpers', () => {
  test('redactMongoUri never prints the password or query string', () => {
    const uri = 'mongodb+srv://alice:S3cr%40t!@cluster0.abcde.mongodb.net/student_cards?retryWrites=true&w=majority'
    const out = redactMongoUri(uri)
    assert.equal(out, 'mongodb+srv://alice:****@cluster0.abcde.mongodb.net/student_cards')
    assert.ok(!out.includes('S3cr'))
    assert.equal(redactMongoUri('mongodb://localhost:27017'), 'mongodb://localhost:27017/')
    assert.equal(redactMongoUri('mongodb://h1:1,h2:2/db'), 'mongodb://h1:1,h2:2/db')
    assert.equal(redactMongoUri('postgres://x'), '<malformed MongoDB URI>')
    assert.equal(redactMongoUri(undefined), '<malformed MongoDB URI>')
  })

  test('resolveDbName: MONGO_DB → URI path → ai_quest', () => {
    const uri = 'mongodb+srv://u:p@h.mongodb.net/student_cards?retryWrites=true'
    assert.equal(resolveDbName(uri), 'student_cards')
    assert.equal(resolveDbName(uri, 'override'), 'override')
    assert.equal(resolveDbName(uri, '  '), 'student_cards')
    assert.equal(resolveDbName('mongodb://localhost:27017/?x=1'), DEFAULT_DB_NAME)
    assert.equal(resolveDbName('mongodb://localhost:27017'), 'ai_quest')
  })

  test('connectionHints name the usual causes', () => {
    assert.match(connectionHints({ name: 'MongoServerSelectionError', message: 'Server selection timed out' }).join(' '), /Network Access/)
    assert.match(connectionHints({ name: 'MongoServerError', code: 18, message: 'bad auth : authentication failed' }).join(' '), /password/)
    assert.match(connectionHints({ name: 'MongoParseError', message: 'Invalid scheme' }).join(' '), /malformed/)
    assert.match(connectionHints({ message: 'querySrv ENOTFOUND _mongodb._tcp.x' }).join(' '), /host name/)
  })
})

describe('connectMongo', () => {
  let server
  before(async () => {
    server = await createMemoryServer()
  })
  after(async () => {
    await disconnectMongo()
    await server?.stop()
  })

  test('missing URI is a clear error', async () => {
    await assert.rejects(connectMongo({ uri: '', logger: quietLogger }), /MONGO_URI is not set/)
  })

  test('failure is fast, credential-free and carries hints', async () => {
    const uri = 'mongodb://bob:hunter2@127.0.0.1:1/x'
    await assert.rejects(connectMongo({ uri, logger: quietLogger, serverSelectionTimeoutMS: 500 }), (err) => {
      assert.equal(err.code, 'DB_CONNECT_FAILED')
      assert.ok(!err.message.includes('hunter2'), err.message)
      assert.match(err.message, /mongodb:\/\/bob:\*\*\*\*@127\.0\.0\.1:1\/x/)
      assert.ok(err.hints.length >= 1)
      return true
    })
    assert.equal(isDbUp(), false)
  })

  test('connects with dbName from the URI path, ping works, disconnect works', async () => {
    const uri = server.getUri().replace(/\/?$/, '/') + 'from_path'
    const { dbName, target } = await connectMongo({ uri, logger: quietLogger })
    assert.equal(dbName, 'from_path')
    assert.equal(mongoose.connection.db.databaseName, 'from_path')
    assert.match(target, /\/from_path$/)
    assert.equal(isDbUp(), true)
    assert.equal(await pingDb(), true)
    await disconnectMongo()
    assert.equal(isDbUp(), false)
    assert.equal(await pingDb(), false)
  })
})

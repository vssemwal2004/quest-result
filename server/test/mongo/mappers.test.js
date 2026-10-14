import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import mongoose from 'mongoose'
import { AppSettings, Student, Tier } from '../../src/db/models/index.js'
import { fileIdFromUrl, iso, parseObjectId, toSettings, toShowState, toStudent, toTier, uploadUrl } from '../../src/db/mappers.js'
import { defaultSettings } from '../../src/seed.js'
import { startMongo } from './helpers.js'

let mongo
before(async () => {
  mongo = await startMongo()
})
after(async () => {
  await mongo?.stop()
})

const STUDENT_KEYS = ['id', 'rank', 'name', 'school', 'city', 'score', 'photoUrl', 'createdAt', 'updatedAt']
const TIER_KEYS = ['id', 'name', 'subtitle', 'rankFrom', 'rankTo', 'prize', 'prizeAmount', 'style', 'color', 'icon', 'sortDirection', 'order', 'enabled']
const SETTINGS_KEYS = [
  'eventTitle', 'eventEdition', 'tagline', 'subTagline', 'organization', 'location', 'eventDate', 'contact', 'logoUrl',
  'handwrittenLines', 'finaleTitle', 'finaleMessage', 'spoilerProtection', 'autoScrollSpeed', 'showRobot', 'quality', 'updatedAt',
]
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** Only JSON primitives / arrays / plain objects — no ObjectId, Date or mongoose internals. */
function assertPlainJson(value) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value)
}

describe('mappers → exact SPEC JSON', () => {
  test('Student from a lean doc and a hydrated doc', async () => {
    const fileId = new mongoose.Types.ObjectId()
    const created = await Student.create({ rank: 1, name: 'A', school: 'S', city: 'C', score: 9.5, photoFileId: fileId })
    for (const doc of [created, await Student.findById(created._id).lean()]) {
      const s = toStudent(doc)
      assert.deepEqual(Object.keys(s), STUDENT_KEYS)
      assert.equal(s.id, String(created._id))
      assert.equal(s.photoUrl, `/uploads/${fileId}`)
      assert.match(s.createdAt, ISO_RE)
      assert.match(s.updatedAt, ISO_RE)
      assert.equal(typeof s.id, 'string')
      assertPlainJson(s)
    }
    const raw = await Student.findById(created._id).lean()
    assert.ok('_id' in raw && !('__v' in raw), 'schemas store no __v')
  })

  test('Tier', async () => {
    const t = toTier(await Tier.create({ name: 'T', rankFrom: 1, rankTo: 3, style: 'podium', color: '#FACC15', icon: 'crown', order: 0 }))
    assert.deepEqual(Object.keys(t), TIER_KEYS)
    assert.equal(t.color, '#facc15', 'color normalised to lowercase')
    assert.equal(t.subtitle, '')
    assert.equal(t.enabled, true)
    assertPlainJson(t)
  })

  test('Settings: SPEC keys in SPEC order, logoUrl from logoFileId, defaults for missing fields', async () => {
    assert.deepEqual(Object.keys(defaultSettings()), SETTINGS_KEYS)
    const fileId = new mongoose.Types.ObjectId()
    await AppSettings.create({ _id: 'settings', eventTitle: 'X', logoFileId: fileId })
    const s = toSettings(await AppSettings.findById('settings').lean())
    assert.deepEqual(Object.keys(s), SETTINGS_KEYS)
    assert.equal(s.eventTitle, 'X')
    assert.equal(s.tagline, defaultSettings().tagline)
    assert.equal(s.logoUrl, `/uploads/${fileId}`)
    assert.match(s.updatedAt, ISO_RE)
    assertPlainJson(s)
    assert.deepEqual(Object.keys(toSettings(null)), SETTINGS_KEYS)
  })

  test('show state + helpers', () => {
    const st = toShowState({ _id: 'state', stageIndex: 2, step: 1, stageKey: 'tier:x', version: 7, updatedAt: new Date(0) })
    assert.deepEqual(st, { stageIndex: 2, step: 1, stageKey: 'tier:x', updatedAt: '1970-01-01T00:00:00.000Z', version: 7 })
    assert.equal(uploadUrl(null), null)
    const id = new mongoose.Types.ObjectId()
    assert.equal(fileIdFromUrl(uploadUrl(id)).toHexString(), id.toHexString())
    assert.equal(fileIdFromUrl('/uploads/photos/x.jpg'), null)
    assert.equal(parseObjectId('abcdefabcdef'), null, '12-char strings are not accepted as ids')
    assert.equal(parseObjectId(String(id)).toHexString(), String(id))
    assert.equal(iso(undefined), null)
  })

  test('strict schemas reject unknown fields', async () => {
    await assert.rejects(Student.create({ rank: 99, name: 'A', school: 'S', hacker: true }), /not in schema|strict/i)
  })
})

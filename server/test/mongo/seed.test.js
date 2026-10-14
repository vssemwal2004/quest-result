import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { Admin, AppSettings, ShowState, Tier } from '../../src/db/models/index.js'
import { seedMongo } from '../../src/db/seedMongo.js'
import { quietLogger, startMongo } from './helpers.js'

let mongo
before(async () => {
  mongo = await startMongo()
})
after(async () => {
  await mongo?.stop()
})

const opts = { adminEmail: 'Boss@Example.com ', adminPassword: 'secret-1', logger: quietLogger }

describe('seedMongo', () => {
  test('first boot creates admin, settings, classic-5 tiers and show state', async () => {
    const created = await seedMongo(mongo.repo, opts)
    assert.deepEqual(created, { admin: true, settings: true, tiers: true, showState: true })
    const admin = await Admin.findOne().lean()
    assert.equal(admin.email, 'boss@example.com')
    assert.ok(await bcrypt.compare('secret-1', admin.passwordHash))
    assert.deepEqual((await mongo.repo.tiers.list()).map((t) => t.name), [
      'Merit Achievers', 'Rising Innovators', 'AI Explorers', 'Top 20 Stars', 'The Champions',
    ])
    const settings = await mongo.repo.settings.get()
    assert.equal(settings.eventTitle, 'AI Quest')
    assert.equal(settings.logoUrl, null)
    assert.equal(await ShowState.countDocuments(), 1)
  })

  test('second run changes nothing', async () => {
    const before = {
      admins: await Admin.find().lean(),
      tiers: await Tier.find().lean(),
      settings: await AppSettings.findById('settings').lean(),
    }
    const created = await seedMongo(mongo.repo, { ...opts, adminEmail: 'other@example.com' })
    assert.deepEqual(created, { admin: false, settings: false, tiers: false, showState: false })
    assert.deepEqual(await Admin.find().lean(), before.admins)
    assert.deepEqual(await Tier.find().lean(), before.tiers)
    assert.deepEqual(await AppSettings.findById('settings').lean(), before.settings)
  })

  test('deleting every tier is respected on the next boot; an empty admins collection is re-seeded', async () => {
    await Tier.deleteMany({})
    await Admin.deleteMany({})
    const created = await seedMongo(mongo.repo, opts)
    assert.equal(created.tiers, false)
    assert.equal(await Tier.countDocuments(), 0)
    assert.equal(created.admin, true)
  })

  test('only the app collections exist (plus nothing foreign was touched)', async () => {
    const foreign = mongoose.connection.db.collection('users_own_data')
    await foreign.insertOne({ keep: true })
    await seedMongo(mongo.repo, opts)
    await mongo.repo.students.deleteAll()
    assert.equal(await foreign.countDocuments(), 1)
    const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name).sort()
    assert.deepEqual(names, ['admins', 'app_meta', 'app_settings', 'show_state', 'students', 'tiers', 'users_own_data'])
  })

  test('default credentials a@gmail.com / 123456 when none are given', async () => {
    await Admin.deleteMany({})
    await seedMongo(mongo.repo, { logger: quietLogger })
    const admin = await mongo.repo.admins.findByEmail('A@GMAIL.COM')
    assert.ok(admin)
    assert.ok(await bcrypt.compare('123456', admin.passwordHash))
    const changed = await mongo.repo.admins.updatePassword(admin.id, await bcrypt.hash('new-pass', 4))
    assert.ok(await bcrypt.compare('new-pass', changed.passwordHash))
    assert.equal((await mongo.repo.admins.findById(admin.id)).email, 'a@gmail.com')
    assert.equal(await mongo.repo.admins.findById('bogus'), null)
  })
})

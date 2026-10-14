import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { addStudents, range, startServer, storedFileCount, student, TINY_PNG, UPLOAD_URL_RE } from './helpers/server.js'

let srv
let token
before(async () => {
  srv = await startServer()
  token = await srv.login()
})
after(() => srv.close())

const api = (method, route, opts = {}) => srv.request(method, route, { ...opts, token })
const tiers = async () => (await api('GET', '/api/admin/tiers')).body.tiers
const newTier = (extra) => ({ name: 'Extra', rankFrom: 300, rankTo: 320, style: 'grid', ...extra })

beforeEach(async () => {
  await api('DELETE', '/api/admin/students', { json: { confirm: 'DELETE ALL' } })
  await api('POST', '/api/admin/tiers/apply-preset', { json: { key: 'classic-5' } })
  await api('POST', '/api/admin/presentation/reset')
})

describe('tiers', () => {
  it('seeds classic-5 exactly per spec', async () => {
    const list = await tiers()
    assert.deepEqual(
      list.map((t) => [t.name, t.rankFrom, t.rankTo, t.style, t.color, t.icon, t.order]),
      [
        ['Merit Achievers', 151, 200, 'grid', '#38bdf8', 'award', 0],
        ['Rising Innovators', 101, 150, 'grid', '#60a5fa', 'star', 1],
        ['AI Explorers', 21, 100, 'grid', '#818cf8', 'rocket', 2],
        ['Top 20 Stars', 4, 20, 'spotlight', '#c084fc', 'medal', 3],
        ['The Champions', 1, 3, 'podium', '#facc15', 'crown', 4],
      ],
    )
    assert.equal(list[3].sortDirection, 'desc')
    assert.equal(list[4].prizeAmount, 'Up to ₹1 Lakh')
    assert.equal(list[4].prize, 'Cash Prizes + Exciting Scholarships')
  })

  it('creates a tier appended to the end with defaults', async () => {
    const res = await api('POST', '/api/admin/tiers', { json: newTier({ color: '#ABCDEF' }) })
    assert.equal(res.status, 201)
    assert.equal(res.body.tier.order, 5)
    assert.equal(res.body.tier.color, '#abcdef')
    assert.equal(res.body.tier.enabled, true)
    assert.equal(res.body.tier.subtitle, '')
  })

  it('rejects overlapping enabled tiers with 409 TIER_OVERLAP naming the other tier', async () => {
    const res = await api('POST', '/api/admin/tiers', { json: newTier({ rankFrom: 190, rankTo: 210 }) })
    assert.equal(res.status, 409)
    assert.equal(res.body.error.code, 'TIER_OVERLAP')
    assert.equal(res.body.error.details.tierName, 'Merit Achievers')
    assert.match(res.body.error.message, /Merit Achievers/)

    const disabled = await api('POST', '/api/admin/tiers', { json: newTier({ rankFrom: 190, rankTo: 210, enabled: false }) })
    assert.equal(disabled.status, 201)
    const enable = await api('PUT', `/api/admin/tiers/${disabled.body.tier.id}`, { json: { enabled: true } })
    assert.equal(enable.status, 409)

    const [first] = await tiers()
    const shrink = await api('PUT', `/api/admin/tiers/${first.id}`, { json: { rankTo: 189 } })
    assert.equal(shrink.status, 200)
    assert.equal((await api('PUT', `/api/admin/tiers/${disabled.body.tier.id}`, { json: { enabled: true } })).status, 200)
  })

  it('limits podium tiers to 3 ranks and requires rankFrom <= rankTo', async () => {
    const podium = await api('POST', '/api/admin/tiers', {
      json: newTier({ style: 'podium', rankFrom: 300, rankTo: 303 }),
    })
    assert.equal(podium.status, 400)
    assert.match(podium.body.error.message, /at most 3/)

    const inverted = await api('POST', '/api/admin/tiers', { json: newTier({ rankFrom: 320, rankTo: 300 }) })
    assert.equal(inverted.status, 400)

    const champions = (await tiers()).find((t) => t.style === 'podium')
    const widen = await api('PUT', `/api/admin/tiers/${champions.id}`, { json: { rankTo: 5 } })
    assert.equal(widen.status, 400)
    const unchanged = (await tiers()).find((t) => t.id === champions.id)
    assert.equal(unchanged.rankTo, 3, 'failed update leaves the tier untouched')
  })

  it('validates enums and colors', async () => {
    for (const extra of [{ style: 'carousel' }, { icon: 'cat' }, { color: 'blue' }, { name: '' }]) {
      const res = await api('POST', '/api/admin/tiers', { json: newTier(extra) })
      assert.equal(res.status, 400, JSON.stringify(extra))
    }
  })

  it('saves manual grid pages and rejects incomplete or oversized groups', async () => {
    const created = await api('POST', '/api/admin/tiers', {
      json: newTier({ rankFrom: 300, rankTo: 319, gridPageCounts: [10, 10] }),
    })
    assert.equal(created.status, 201)
    assert.deepEqual(created.body.tier.gridPageCounts, [10, 10])
    await addStudents(api, null, range(300, 319).map((rank) => student(rank)))
    const show = (await api('GET', '/api/admin/presentation')).body
    const stage = show.stages.find((s) => s.tier?.id === created.body.tier.id)
    assert.deepEqual(stage.pageEnds, [10, 20])
    assert.equal(stage.stepCount, 3)

    const updated = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { gridPageCounts: [5, 5, 5, 5] } })
    assert.equal(updated.status, 200)
    assert.deepEqual(updated.body.tier.gridPageCounts, [5, 5, 5, 5])
    for (const counts of [[12, 9], [13, 7], []]) {
      const rejected = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { gridPageCounts: counts } })
      assert.equal(rejected.status, 400)
    }
    const restored = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { gridPageCounts: null } })
    assert.equal(restored.status, 200)
    assert.equal(restored.body.tier.gridPageCounts, null)
  })

  it('lists and applies presets', async () => {
    const { presets } = (await api('GET', '/api/admin/tiers/presets')).body
    assert.deepEqual(
      presets.map((p) => p.key),
      ['classic-5', 'focus-top-10', 'quick-3'],
    )
    assert.ok(presets.every((p) => p.name && p.description && p.tiers.every((t) => !('id' in t))))

    const focus = await api('POST', '/api/admin/tiers/apply-preset', { json: { key: 'focus-top-10' } })
    assert.deepEqual(
      focus.body.tiers.map((t) => [t.rankFrom, t.rankTo, t.style]),
      [
        [11, 200, 'grid'],
        [4, 10, 'spotlight'],
        [1, 3, 'podium'],
      ],
    )
    const quick = await api('POST', '/api/admin/tiers/apply-preset', { json: { key: 'quick-3' } })
    assert.deepEqual(
      quick.body.tiers.map((t) => [t.rankFrom, t.rankTo, t.style]),
      [
        [4, 200, 'grid'],
        [1, 3, 'podium'],
      ],
    )
    assert.equal((await api('POST', '/api/admin/tiers/apply-preset', { json: { key: 'nope' } })).status, 404)
  })

  it('reorders tiers', async () => {
    const list = await tiers()
    const ids = list.map((t) => t.id).reverse()
    const res = await api('POST', '/api/admin/tiers/reorder', { json: { ids: ids.slice(0, 2) } })
    assert.deepEqual(
      res.body.tiers.map((t) => t.name),
      ['The Champions', 'Top 20 Stars', 'Merit Achievers', 'Rising Innovators', 'AI Explorers'],
    )
    assert.equal((await api('POST', '/api/admin/tiers/reorder', { json: { ids: ['ghost'] } })).status, 400)
  })

  it('keeps the live state on the same tier when other tiers change, and clamps when it disappears', async () => {
    await addStudents(api, null, range(1, 20).map((r) => student(r)))
    const list = await tiers()
    // Stage 4 = "Top 20 Stars" (spotlight, 17 students): reveal 5 of them.
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex: 4, step: 5 } })

    await api('DELETE', `/api/admin/tiers/${list[0].id}`) // remove an earlier tier
    let info = (await api('GET', '/api/admin/presentation')).body
    assert.deepEqual([info.state.stageIndex, info.state.step], [3, 5])
    assert.equal(info.stages[3].title, 'Top 20 Stars')

    // Fewer students in the current tier → step clamps to the new last step.
    const students = (await api('GET', '/api/admin/students')).body.students
    for (const s of students.filter((s) => s.rank >= 4 && s.rank <= 17)) {
      await api('DELETE', `/api/admin/students/${s.id}`)
    }
    info = (await api('GET', '/api/admin/presentation')).body
    assert.deepEqual([info.state.stageIndex, info.state.step], [3, 3])

    // Current tier deleted → index clamps into the new stage list.
    await api('DELETE', `/api/admin/tiers/${list[3].id}`)
    info = (await api('GET', '/api/admin/presentation')).body
    assert.equal(info.stages.length, 5)
    assert.equal(info.state.stageIndex, 3)
    assert.equal(info.state.step, 0)
  })
})

describe('presentation and overview', () => {
  it('navigates next/prev/goto/reset with spec semantics', async () => {
    await api('POST', '/api/admin/tiers/apply-preset', { json: { key: 'quick-3' } })
    await addStudents(api, null, [student(1), student(2), student(3), student(4)])
    const step = async (route, json) => (await api('POST', `/api/admin/presentation/${route}`, { json })).body.state
    const pos = (s) => [s.stageIndex, s.step]

    assert.deepEqual(pos(await step('next')), [1, 0])
    assert.deepEqual(pos(await step('next')), [1, 1])
    assert.deepEqual(pos(await step('next')), [2, 0])
    assert.deepEqual(pos(await step('prev')), [1, 1])
    assert.deepEqual(pos(await step('goto', { stageIndex: 3 })), [3, 0])
    assert.deepEqual(pos(await step('prev')), [2, 4])
    assert.deepEqual(pos(await step('goto', { stageIndex: 42, step: 9 })), [3, 0])
    assert.deepEqual(pos(await step('next')), [3, 0])
    assert.deepEqual(pos(await step('reset')), [0, 0])
    assert.equal((await api('POST', '/api/admin/presentation/goto', { json: {} })).status, 400)
  })

  it('public show is spoiler-filtered; admin show is not', async () => {
    await addStudents(api, null, range(1, 25).map((r) => student(r)))
    const pub = (await srv.request('GET', '/api/public/show')).body
    assert.equal(pub.totalWinners, 25)
    assert.ok(pub.stages.every((s) => s.students.length === 0))
    assert.equal(pub.stages.find((s) => s.title === 'AI Explorers').studentCount, 5)
    assert.equal(pub.settings.eventTitle, 'AI Quest')
    assert.equal(JSON.stringify(pub).includes('passwordHash'), false)

    const adminShow = (await api('GET', '/api/admin/show')).body
    assert.deepEqual(
      adminShow.stages.find((s) => s.title === 'The Champions').students.map((s) => s.rank),
      [3, 2, 1],
    )
    assert.equal((await srv.request('GET', '/api/admin/show')).status, 401)

    await api('PUT', '/api/admin/settings', { json: { spoilerProtection: false } })
    const open = (await srv.request('GET', '/api/public/show')).body
    assert.equal(open.stages.find((s) => s.title === 'Top 20 Stars').students.length, 17)
    await api('PUT', '/api/admin/settings', { json: { spoilerProtection: true } })
  })

  it('overview reports tier fill, missing ranks and unassigned students', async () => {
    await addStudents(api, null, [student(1), student(2), student(5), student(250)])
    const o = (await api('GET', '/api/admin/overview')).body
    assert.equal(o.studentCount, 4)
    assert.equal(o.tierCount, 5)
    const champions = o.tiers.find((t) => t.tier.name === 'The Champions')
    assert.deepEqual([champions.studentCount, champions.expected], [2, 3])
    assert.deepEqual(
      o.unassignedStudents.map((s) => s.rank),
      [250],
    )
    assert.equal(o.missingRanks.length, 200 - 3, 'ranks 1..200 (highest enabled tier) without a student')
    assert.deepEqual(o.missingRanks.slice(0, 3), [3, 4, 6])
    assert.equal(typeof o.viewers, 'number')
    assert.deepEqual(Object.keys(o.state).sort(), ['stageIndex', 'step', 'updatedAt'])
  })
})

describe('settings', () => {
  it('reads and partially updates settings with validation', async () => {
    const before = (await api('GET', '/api/admin/settings')).body.settings
    assert.equal(before.organization, 'Graphic Era (Deemed to be University)')
    assert.deepEqual(before.handwrittenLines, ['Explore', 'Learn', 'Create', 'Your Tomorrow'])

    const res = await api('PUT', '/api/admin/settings', {
      json: { eventEdition: ' Results 2027 ', handwrittenLines: ['Dream', '', 'Build'], autoScrollSpeed: '60', logoUrl: 'x' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.settings.eventEdition, 'Results 2027')
    assert.deepEqual(res.body.settings.handwrittenLines, ['Dream', 'Build'])
    assert.equal(res.body.settings.autoScrollSpeed, 60)
    assert.equal(res.body.settings.logoUrl, null, 'logoUrl is only set through the upload endpoint')
    assert.equal(res.body.settings.tagline, before.tagline)

    for (const json of [{ autoScrollSpeed: 5 }, { quality: 'ultra' }, { spoilerProtection: 'yes' }, { eventTitle: '' }]) {
      assert.equal((await api('PUT', '/api/admin/settings', { json })).status, 400, JSON.stringify(json))
    }
  })

  it('uploads and removes an SVG logo served with a sandboxing CSP', async () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>')
    const form = new FormData()
    form.append('logo', new Blob([svg], { type: 'image/svg+xml' }), 'logo.svg')
    const res = await api('POST', '/api/admin/settings/logo', { form })
    assert.equal(res.status, 200)
    assert.match(res.body.settings.logoUrl, UPLOAD_URL_RE)
    const served = await fetch(srv.base + res.body.settings.logoUrl)
    assert.match(served.headers.get('content-security-policy'), /sandbox/)

    const del = await api('DELETE', '/api/admin/settings/logo')
    assert.equal(del.body.settings.logoUrl, null)
    assert.equal((await fetch(srv.base + res.body.settings.logoUrl)).status, 404)
  })

  it('refuses active or external SVG content and stores nothing', async () => {
    const before = await storedFileCount()
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="https://evil.example/x.png"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>',
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    ]) {
      const form = new FormData()
      form.append('logo', new Blob([svg], { type: 'image/svg+xml' }), 'logo.svg')
      const res = await api('POST', '/api/admin/settings/logo', { form })
      assert.equal(res.status, 400, svg)
      assert.equal(res.body.error.code, 'UNSUPPORTED_FILE')
    }
    assert.equal(await storedFileCount(), before)
  })

  it('replaces a raster logo and deletes the previous file', async () => {
    const upload = async () => {
      const form = new FormData()
      form.append('logo', new Blob([TINY_PNG], { type: 'image/png' }), 'logo.png')
      return (await api('POST', '/api/admin/settings/logo', { form })).body.settings.logoUrl
    }
    const first = await upload()
    const second = await upload()
    assert.notEqual(first, second)
    assert.equal((await fetch(srv.base + first)).status, 404)
    assert.equal((await fetch(srv.base + second)).status, 200)
    const pub = (await srv.request('GET', '/api/public/show')).body
    assert.equal(pub.settings.logoUrl, second)
    await api('DELETE', '/api/admin/settings/logo')
  })
})

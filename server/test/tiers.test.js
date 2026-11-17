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
    assert.equal(list[4].podiumMode, 'hybrid')
  })

  it('creates a tier appended to the end with defaults', async () => {
    const res = await api('POST', '/api/admin/tiers', { json: newTier({ color: '#ABCDEF' }) })
    assert.equal(res.status, 201)
    assert.equal(res.body.tier.order, 5)
    assert.equal(res.body.tier.color, '#abcdef')
    assert.equal(res.body.tier.enabled, true)
    assert.equal(res.body.tier.subtitle, '')
    assert.equal(res.body.tier.medalHeading, '')
  })

  it('creates a Best School tier and reveals only the selected school after shuffling', async () => {
    const schoolNames = Array.from({ length: 10 }, (_, index) => `School ${index + 1}`)
    const input = newTier({ name: 'Best School', subtitle: 'Opening subtitle', medalHeading: 'AI Quest 2026 Haldwani', style: 'school', rankFrom: 1, rankTo: 1, schoolNames, winnerSchool: 'School 4' })
    const invalid = await api('POST', '/api/admin/tiers', { json: { ...input, winnerSchool: 'Unknown' } })
    assert.equal(invalid.status, 400)
    const created = await api('POST', '/api/admin/tiers', { json: input })
    assert.equal(created.status, 201)
    assert.equal(created.body.tier.medalHeading, 'AI Quest 2026 Haldwani')
    assert.equal(created.body.tier.subtitle, 'Opening subtitle')
    const stageIndex = (await api('GET', '/api/admin/show')).body.stages.findIndex((stage) => stage.title === 'Best School')
    assert.ok(stageIndex > 0)
    for (const step of [0, 1, 2, 3]) {
      await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step } })
      const stage = (await srv.request('GET', '/api/public/show')).body.stages[stageIndex]
      assert.deepEqual(stage.students, [])
      assert.deepEqual(stage.tier.schoolNames, schoolNames)
      assert.equal(stage.tier.medalHeading, 'AI Quest 2026 Haldwani')
      assert.equal('winnerSchool' in stage.tier, false)
    }
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 4 } })
    const revealed = (await srv.request('GET', '/api/public/show')).body.stages[stageIndex]
    assert.equal(revealed.students[0].name, 'School 4')
    assert.equal(revealed.stepCount, 5)
  })

  it('updates an existing tier to Best School without a rank overlap', async () => {
    const existing = (await tiers()).find((tier) => tier.style === 'grid')
    const schoolNames = Array.from({ length: 10 }, (_, index) => `School ${index + 1}`)
    const response = await api('PUT', `/api/admin/tiers/${existing.id}`, {
      json: { style: 'school', rankFrom: 1, rankTo: 1, schoolNames, winnerSchool: 'School 4', medalHeading: 'AI Quest 2026 Haldwani' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.tier.style, 'school')
    assert.equal(response.body.tier.winnerSchool, 'School 4')
    assert.equal(response.body.tier.medalHeading, 'AI Quest 2026 Haldwani')
    assert.deepEqual(response.body.tier.schoolNames, schoolNames)
    assert.equal((await tiers()).find((tier) => tier.id === existing.id).style, 'school')
    assert.equal((await tiers()).find((tier) => tier.id === existing.id).medalHeading, 'AI Quest 2026 Haldwani')
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

  it('limits podium tiers to 4 ranks and requires rankFrom <= rankTo', async () => {
    const podium = await api('POST', '/api/admin/tiers', {
      json: newTier({ style: 'podium', rankFrom: 300, rankTo: 304 }),
    })
    assert.equal(podium.status, 400)
    assert.match(podium.body.error.message, /at most 4/)

    const inverted = await api('POST', '/api/admin/tiers', { json: newTier({ rankFrom: 320, rankTo: 300 }) })
    assert.equal(inverted.status, 400)

    const champions = (await tiers()).find((t) => t.style === 'podium')
    const widen = await api('PUT', `/api/admin/tiers/${champions.id}`, { json: { rankTo: 5 } })
    assert.equal(widen.status, 400)
    const unchanged = (await tiers()).find((t) => t.id === champions.id)
    assert.equal(unchanged.rankTo, 3, 'failed update leaves the tier untouched')
  })

  it('switches podium modes while keeping ranks and protecting unrevealed Hybrid names', async () => {
    await addStudents(api, null, [student(1), student(2), student(3)])
    const champion = (await tiers()).find((tier) => tier.style === 'podium')
    const initialShow = (await api('GET', '/api/admin/show')).body
    const stageIndex = initialShow.stages.findIndex((stage) => stage.title === 'The Champions')
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 5 } })
    for (const podiumMode of ['podium', 'bot', 'hybrid']) {
      const response = await api('PUT', `/api/admin/tiers/${champion.id}`, { json: { podiumMode } })
      assert.equal(response.status, 200)
      assert.equal(response.body.tier.podiumMode, podiumMode)
      const show = (await api('GET', '/api/admin/show')).body.stages.find((stage) => stage.title === 'The Champions')
      assert.equal(show.tier.podiumMode, podiumMode)
      assert.deepEqual([show.tier.rankFrom, show.tier.rankTo, show.stepCount], [1, 3, podiumMode === 'hybrid' ? 9 : 8])
      assert.deepEqual(show.revealRanks, [3, 2, 1])
      const publicShow = (await srv.request('GET', '/api/public/show')).body
      assert.equal(publicShow.state.step, 5)
      assert.deepEqual(publicShow.stages[stageIndex].students.map((student) => student.rank), podiumMode === 'hybrid' ? [3] : [3, 2], 'only completed reveals are public')
    }
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 6 } })
    assert.deepEqual((await srv.request('GET', '/api/public/show')).body.stages[stageIndex].students.map((student) => student.rank), [3, 2], 'silver reveal completes')
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 7 } })
    assert.deepEqual((await srv.request('GET', '/api/public/show')).body.stages[stageIndex].students.map((student) => student.rank), [3, 2], 'champion is hidden during gold shuffle')
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 8 } })
    assert.deepEqual((await srv.request('GET', '/api/public/show')).body.stages[stageIndex].students.map((student) => student.rank), [3, 2, 1])
    assert.equal((await api('PUT', `/api/admin/tiers/${champion.id}`, { json: { podiumMode: 'unknown' } })).status, 400)
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
    assert.equal(stage.stepCount, 5)

    const updated = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { gridPageCounts: [5, 5, 5, 5] } })
    assert.equal(updated.status, 200)
    assert.deepEqual(updated.body.tier.gridPageCounts, [5, 5, 5, 5])
    const fullPage = await api('POST', '/api/admin/tiers', {
      json: newTier({ rankFrom: 330, rankTo: 354, gridPageCounts: [25] }),
    })
    assert.equal(fullPage.status, 201)
    assert.deepEqual(fullPage.body.tier.gridPageCounts, [25])
    for (const counts of [[25, 1], [26], []]) {
      const rejected = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { gridPageCounts: counts } })
      assert.equal(rejected.status, 400)
    }
    const restored = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { gridPageCounts: null } })
    assert.equal(restored.status, 200)
    assert.equal(restored.body.tier.gridPageCounts, null)
  })

  it('stores a different podium prize for each rank and withholds it until that rank is revealed', async () => {
    const podiumPrizes = range(300, 303).map((rank) => ({ rank, prize: `Prize for ${rank}`, prizeAmount: `₹${rank}` }))
    const created = await api('POST', '/api/admin/tiers', {
      json: newTier({ rankFrom: 300, rankTo: 303, style: 'podium', prize: 'Shared prize', podiumPrizes }),
    })
    assert.equal(created.status, 201)
    assert.deepEqual(created.body.tier.podiumPrizes, podiumPrizes)
    await addStudents(api, null, range(300, 303).map((rank) => student(rank)))

    const admin = (await api('GET', '/api/admin/presentation')).body
    const stageIndex = admin.stages.findIndex((stage) => stage.tier?.id === created.body.tier.id)
    assert.ok(stageIndex > 0)
    const publicPrizes = async () => {
      const show = (await srv.request('GET', '/api/public/show')).body
      return show.stages[stageIndex].tier.podiumPrizes
    }
    assert.deepEqual(await publicPrizes(), [], 'future rank prizes stay hidden')

    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 1 } })
    assert.deepEqual(await publicPrizes(), [], 'suspense does not reveal a prize')
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 2 } })
    assert.deepEqual(await publicPrizes(), [podiumPrizes[3]], 'fourth place gets its own prize')
    await api('POST', '/api/admin/presentation/goto', { json: { stageIndex, step: 4 } })
    assert.deepEqual(await publicPrizes(), podiumPrizes.slice(2), 'the next reveal adds third place')

    for (const entries of [podiumPrizes.slice(1), [podiumPrizes[0], podiumPrizes[0], ...podiumPrizes.slice(2)]]) {
      const rejected = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { podiumPrizes: entries } })
      assert.equal(rejected.status, 400)
    }
    const shared = await api('PUT', `/api/admin/tiers/${created.body.tier.id}`, { json: { podiumPrizes: null } })
    assert.equal(shared.status, 200)
    assert.equal(shared.body.tier.podiumPrizes, null)
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
    await addStudents(api, null, [student(1), student(2), student(3)])
    const step = async (route, json) => (await api('POST', `/api/admin/presentation/${route}`, { json })).body.state
    const pos = (s) => [s.stageIndex, s.step]

    assert.deepEqual(pos(await step('next')), [1, 0])
    assert.deepEqual(pos(await step('next')), [2, 0])
    assert.deepEqual(pos(await step('next')), [2, 1])
    assert.deepEqual(pos(await step('prev')), [2, 0])
    assert.deepEqual(pos(await step('goto', { stageIndex: 3 })), [3, 0])
    assert.deepEqual(pos(await step('prev')), [2, 8])
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

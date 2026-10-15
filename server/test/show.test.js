import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPayload,
  buildStages,
  clampPosition,
  filterForPublic,
  GRID_PAGE_SIZE,
  gridPageEnds,
  manualGridPageEnds,
  gotoPosition,
  nextPosition,
  prevPosition,
  reconcileState,
  resetPosition,
} from '../src/show.js'

const tier = (id, rankFrom, rankTo, style, order, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  subtitle: '',
  rankFrom,
  rankTo,
  prize: '',
  prizeAmount: '',
  style,
  color: '#38bdf8',
  icon: 'award',
  sortDirection: 'asc',
  order,
  enabled: true,
  ...extra,
})

const students = Array.from({ length: 12 }, (_, i) => ({
  id: `s${i + 1}`,
  rank: i + 1,
  name: `N${i + 1}`,
  school: 'S',
  city: null,
  score: null,
  photoUrl: null,
  createdAt: '',
  updatedAt: '',
}))

function makeDb(overrides = {}) {
  return {
    meta: { version: 7 },
    settings: { spoilerProtection: true },
    tiers: [
      tier('podium', 1, 3, 'podium', 3),
      tier('wall', 9, 12, 'scroll', 0),
      tier('spot', 4, 6, 'spotlight', 1, { sortDirection: 'desc' }),
      tier('grid', 7, 8, 'grid', 2, { sortDirection: 'desc' }),
      tier('off', 100, 200, 'scroll', 4, { enabled: false }),
    ],
    students,
    state: { stageIndex: 0, step: 0, stageKey: 'intro', updatedAt: 'x' },
    ...overrides,
  }
}

const ranksOf = (stage) => stage.students.map((s) => s.rank)

describe('buildStages', () => {
  const stages = buildStages(makeDb())

  it('is intro + enabled tiers by order + finale', () => {
    assert.deepEqual(
      stages.map((s) => s.key),
      ['intro', 'tier:wall', 'tier:spot', 'tier:grid', 'tier:podium', 'finale'],
    )
    assert.deepEqual(
      stages.map((s) => s.index),
      [0, 1, 2, 3, 4, 5],
    )
  })

  it('computes step counts per style', () => {
    assert.deepEqual(
      stages.map((s) => s.stepCount),
      [1, 3, 4, 3, 8, 1],
    )
    assert.deepEqual(
      stages.map((s) => s.studentCount),
      [0, 4, 3, 2, 3, 0],
    )
  })

  it('orders students per sortDirection, podium always rank DESC', () => {
    assert.deepEqual(ranksOf(stages[1]), [9, 10, 11, 12])
    assert.deepEqual(ranksOf(stages[2]), [6, 5, 4])
    assert.deepEqual(ranksOf(stages[3]), [8, 7])
    const ascPodium = buildStages(makeDb({ tiers: [tier('p', 1, 3, 'podium', 0, { sortDirection: 'asc' })] }))
    assert.deepEqual(ranksOf(ascPodium[1]), [3, 2, 1])
  })

  it('exposes public tier and student shapes only', () => {
    assert.equal('order' in stages[1].tier, false)
    assert.equal('enabled' in stages[1].tier, false)
    assert.deepEqual(Object.keys(stages[1].students[0]).sort(), [
      'city',
      'id',
      'name',
      'photoUrl',
      'rank',
      'school',
      'score',
    ])
  })

  it('reveals balanced grid pages together, with at most 25 students per page', () => {
    const many = Array.from({ length: 55 }, (_, i) => ({ ...students[0], id: `g${i + 1}`, rank: i + 1 }))
    const grid = buildStages(makeDb({ tiers: [tier('many', 1, 55, 'grid', 0)], students: many }))[1]
    assert.equal(GRID_PAGE_SIZE, 25)
    assert.equal(grid.pageSize, 25)
    assert.equal(grid.stepCount, 7) // title + suspense/reveal for each of three pages
    assert.deepEqual(grid.pageEnds, [19, 37, 55])
    assert.deepEqual(grid.studentRanks, Array.from({ length: 55 }, (_, i) => i + 1))
    const stages = buildStages(makeDb({ tiers: [tier('many', 1, 55, 'grid', 0)], students: many }))
    for (const [step, count] of [[0, 0], [1, 0], [2, 19], [3, 19], [4, 37], [5, 37], [6, 55]]) {
      const publicStage = filterForPublic(stages, { stageIndex: 1, step }, { spoilerProtection: true })[1]
      assert.equal(publicStage.students.length, count)
    }
    assert.deepEqual(nextPosition(stages, { stageIndex: 1, step: 2 }), { stageIndex: 1, step: 3 })
    assert.deepEqual(nextPosition(stages, { stageIndex: 1, step: 6 }), { stageIndex: 2, step: 0 })
  })

  it('balances the final page instead of leaving two or eight students alone', () => {
    assert.deepEqual(gridPageEnds(50), [25, 50])
    assert.deepEqual(gridPageEnds(80), [20, 40, 60, 80])
    assert.deepEqual(gridPageEnds(2), [2])
    assert.deepEqual(gridPageEnds(0), [0])
  })

  it('uses saved manual rank groups in both reveal directions', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...students[0], id: `m${i + 1}`, rank: i + 1 }))
    const asc = tier('manual', 1, 20, 'grid', 0, { gridPageCounts: [6, 6, 8] })
    const desc = { ...asc, sortDirection: 'desc' }
    assert.deepEqual(manualGridPageEnds(asc, many), [6, 12, 20])
    assert.deepEqual(manualGridPageEnds(desc, [...many].reverse()), [6, 12, 20])
    const stages = buildStages(makeDb({ tiers: [asc], students: many }))
    assert.deepEqual(stages[1].pageEnds, [6, 12, 20])
    assert.equal(stages[1].stepCount, 7)
    assert.deepEqual(ranksOf(filterForPublic(stages, { stageIndex: 1, step: 4 }, { spoilerProtection: true })[1]), Array.from({ length: 12 }, (_, i) => i + 1))
  })

  it('omits manual pages with no uploaded students', () => {
    const sparse = [students[0], { ...students[0], rank: 10, id: 'last' }]
    const manual = tier('sparse', 1, 10, 'grid', 0, { gridPageCounts: [4, 3, 3] })
    const stage = buildStages(makeDb({ tiers: [manual], students: sparse }))[1]
    assert.deepEqual(stage.pageEnds, [1, 2])
    assert.equal(stage.stepCount, 5)
  })

  it('renders previously saved scroll tiers as grids with two steps per page', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...students[0], id: `g${i + 1}`, rank: i + 1 }))
    const grid = buildStages(makeDb({ tiers: [tier('old', 1, 25, 'scroll', 0)], students: many }))[1]
    assert.equal(grid.tier.style, 'grid')
    assert.equal(grid.stepCount, 3)
  })
})

describe('navigation', () => {
  const stages = buildStages(makeDb())
  const at = (stageIndex, step) => ({ stageIndex, step })

  it('next walks steps, then stages, and stops at the end', () => {
    assert.deepEqual(nextPosition(stages, at(0, 0)), at(1, 0))
    assert.deepEqual(nextPosition(stages, at(1, 0)), at(1, 1))
    assert.deepEqual(nextPosition(stages, at(1, 1)), at(1, 2))
    assert.deepEqual(nextPosition(stages, at(1, 2)), at(2, 0))
    assert.deepEqual(nextPosition(stages, at(2, 3)), at(3, 0))
    assert.deepEqual(nextPosition(stages, at(5, 0)), at(5, 0))
  })

  it("prev walks back and lands on the previous stage's LAST step", () => {
    assert.deepEqual(prevPosition(stages, at(2, 2)), at(2, 1))
    assert.deepEqual(prevPosition(stages, at(3, 0)), at(2, 3))
    assert.deepEqual(prevPosition(stages, at(5, 0)), at(4, 7))
    assert.deepEqual(prevPosition(stages, at(2, 0)), at(1, 2))
    assert.deepEqual(prevPosition(stages, at(0, 0)), at(0, 0))
  })

  it('a full forward walk visits every step exactly once', () => {
    let pos = at(0, 0)
    let visited = 1
    for (;;) {
      const next = nextPosition(stages, pos)
      if (next.stageIndex === pos.stageIndex && next.step === pos.step) break
      pos = next
      visited++
    }
    assert.equal(
      visited,
      stages.reduce((n, s) => n + s.stepCount, 0),
    )
  })

  it('goto and clamp keep positions in range', () => {
    assert.deepEqual(gotoPosition(stages, 2), at(2, 0))
    assert.deepEqual(gotoPosition(stages, 2, 99), at(2, 3))
    assert.deepEqual(gotoPosition(stages, 99, 5), at(5, 0))
    assert.deepEqual(gotoPosition(stages, -3, -1), at(0, 0))
    assert.deepEqual(clampPosition(stages, 1, 99), at(1, 2))
    assert.deepEqual(resetPosition(), at(0, 0))
  })

  it('reconcileState follows the stage key, else clamps', () => {
    const before = { stageIndex: 3, step: 1, stageKey: 'tier:grid' }
    const withoutWall = buildStages(makeDb({ tiers: makeDb().tiers.filter((t) => t.id !== 'wall') }))
    assert.deepEqual(reconcileState(before, withoutWall), { stageIndex: 2, step: 1, stageKey: 'tier:grid' })

    const spotState = { stageIndex: 2, step: 3, stageKey: 'tier:spot' }
    const shrunk = buildStages(makeDb({ students: students.filter((s) => s.rank !== 4) }))
    assert.deepEqual(reconcileState(spotState, shrunk), { stageIndex: 2, step: 2, stageKey: 'tier:spot' })

    // Current stage removed: the stage now at that index starts from its title card.
    const withoutSpot = buildStages(makeDb({ tiers: makeDb().tiers.filter((t) => t.id !== 'spot') }))
    assert.deepEqual(reconcileState(spotState, withoutSpot), { stageIndex: 2, step: 0, stageKey: 'tier:grid' })

    const onlyIntroFinale = buildStages(makeDb({ tiers: [] }))
    assert.deepEqual(reconcileState({ stageIndex: 4, step: 2, stageKey: 'tier:podium' }, onlyIntroFinale), {
      stageIndex: 1,
      step: 0,
      stageKey: 'finale',
    })
  })
})

describe('spoiler protection', () => {
  const settings = { spoilerProtection: true }
  const stages = buildStages(makeDb())
  const view = (stageIndex, step, s = settings) => filterForPublic(stages, { stageIndex, step }, s)

  it('hides every student of future stages but keeps studentCount', () => {
    const v = view(0, 0)
    for (const stage of v.slice(1, -1)) {
      assert.deepEqual(stage.students, [])
      assert.ok(stage.studentCount > 0)
    }
  })

  it('grid: every card cycles through suspense; the next step reveals the whole page', () => {
    assert.deepEqual(ranksOf(view(1, 0)[1]), [])
    assert.deepEqual(ranksOf(view(1, 1)[1]), [])
    assert.deepEqual(ranksOf(view(1, 2)[1]), [9, 10, 11, 12])
    assert.deepEqual(ranksOf(view(3, 0)[3]), [])
    assert.deepEqual(ranksOf(view(3, 1)[3]), [])
    assert.deepEqual(ranksOf(view(3, 2)[3]), [8, 7])
  })

  it('spotlight reveals the first k students in reveal order', () => {
    assert.deepEqual(ranksOf(view(2, 0)[2]), [])
    assert.deepEqual(ranksOf(view(2, 1)[2]), [6])
    assert.deepEqual(ranksOf(view(2, 2)[2]), [6, 5])
    assert.deepEqual(ranksOf(view(2, 3)[2]), [6, 5, 4])
  })

  it('podium hides each name during suspense, then reveals 3 → 2 → 1 before the group shot', () => {
    assert.deepEqual(ranksOf(view(4, 0)[4]), [])
    assert.deepEqual(ranksOf(view(4, 1)[4]), [])
    assert.deepEqual(ranksOf(view(4, 2)[4]), [3])
    assert.deepEqual(ranksOf(view(4, 3)[4]), [3])
    assert.deepEqual(ranksOf(view(4, 4)[4]), [3, 2])
    assert.deepEqual(ranksOf(view(4, 5)[4]), [3, 2])
    assert.deepEqual(ranksOf(view(4, 6)[4]), [3, 2, 1])
    assert.deepEqual(ranksOf(view(4, 7)[4]), [3, 2, 1])
  })

  it('supports four podium winners in order and handles missing rank numbers', () => {
    const four = buildStages(makeDb({ tiers: [tier('top4', 1, 4, 'podium', 0)] }))[1]
    assert.equal(four.stepCount, 10)
    assert.deepEqual(four.revealRanks, [4, 3, 2, 1])
    for (let step = 0; step <= 9; step++) {
      const visible = filterForPublic([buildStages(makeDb())[0], { ...four, index: 1 }], { stageIndex: 1, step }, settings)[1]
      assert.equal(visible.students.length, Math.min(4, Math.floor(step / 2)))
    }
    const sparse = buildStages(makeDb({ tiers: [tier('sparse', 1, 4, 'podium', 0)], students: students.filter((s) => s.rank !== 3) }))[1]
    assert.deepEqual(sparse.revealRanks, [4, 2, 1])
    assert.equal(sparse.stepCount, 8)
  })

  it('past stages are fully revealed', () => {
    const v = view(4, 0)
    assert.deepEqual(ranksOf(v[1]), [9, 10, 11, 12])
    assert.deepEqual(ranksOf(v[2]), [6, 5, 4])
    assert.deepEqual(ranksOf(v[3]), [8, 7])
  })

  it('protection off returns every student everywhere', () => {
    const v = view(0, 0, { spoilerProtection: false })
    assert.deepEqual(
      v.map((s) => s.students.length),
      [0, 4, 3, 2, 3, 0],
    )
  })

  it('buildPayload carries state without the internal stageKey', () => {
    const p = buildPayload(makeDb(), { filtered: true, now: new Date(0) })
    assert.deepEqual(p.state, { stageIndex: 0, step: 0, updatedAt: 'x' })
    assert.equal(p.version, 7)
    assert.equal(p.totalWinners, 12)
    assert.equal(p.serverTime, '1970-01-01T00:00:00.000Z')
    assert.deepEqual(p.stages[1].students, [])
  })
})

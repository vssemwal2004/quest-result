/**
 * Pure show-model functions (no I/O). See docs/SPEC.md → "Show model".
 * A "position" is `{ stageIndex, step }`; the stored state additionally carries
 * `stageKey` so the live screen stays on the same tier when earlier tiers change.
 */

export const LIST_STYLES = new Set(['scroll', 'grid'])

export function toPublicStudent(s) {
  return { id: s.id, rank: s.rank, name: s.name, school: s.school, city: s.city, score: s.score, photoUrl: s.photoUrl }
}

export function toPublicTier(t) {
  const { order: _order, enabled: _enabled, ...rest } = t
  return rest
}

export const inTier = (tier, rank) => rank >= tier.rankFrom && rank <= tier.rankTo

export function sortTiers(tiers) {
  return [...tiers].sort((a, b) => a.order - b.order || b.rankFrom - a.rankFrom)
}

export function enabledTiers(tiers) {
  return sortTiers(tiers.filter((t) => t.enabled))
}

/** Reveal order of a tier's students: podium always rank DESC, others per sortDirection. */
export function tierStudents(tier, students) {
  const dir = tier.style === 'podium' || tier.sortDirection === 'desc' ? -1 : 1
  return students.filter((s) => inTier(tier, s.rank)).sort((a, b) => dir * (a.rank - b.rank))
}

export function stepCountFor(style, studentCount) {
  return LIST_STYLES.has(style) ? 2 : 1 + studentCount
}

/** `[intro] + enabled tiers by order + [finale]`, each with ALL its students (unfiltered). */
export function buildStages(db) {
  const stages = [
    { index: 0, type: 'intro', key: 'intro', title: 'Welcome', stepCount: 1, tier: null, studentCount: 0, students: [] },
  ]
  for (const tier of enabledTiers(db.tiers)) {
    const students = tierStudents(tier, db.students).map(toPublicStudent)
    stages.push({
      index: stages.length,
      type: 'tier',
      key: `tier:${tier.id}`,
      title: tier.name,
      stepCount: stepCountFor(tier.style, students.length),
      tier: toPublicTier(tier),
      studentCount: students.length,
      students,
    })
  }
  stages.push({
    index: stages.length,
    type: 'finale',
    key: 'finale',
    title: 'Finale',
    stepCount: 1,
    tier: null,
    studentCount: 0,
    students: [],
  })
  return stages
}

const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.trunc(Number.isFinite(v) ? v : 0)))

export function clampPosition(stages, stageIndex, step) {
  const i = clampInt(stageIndex, 0, stages.length - 1)
  return { stageIndex: i, step: clampInt(step, 0, stages[i].stepCount - 1) }
}

export function nextPosition(stages, { stageIndex, step }) {
  const stage = stages[stageIndex]
  if (step < stage.stepCount - 1) return { stageIndex, step: step + 1 }
  if (stageIndex < stages.length - 1) return { stageIndex: stageIndex + 1, step: 0 }
  return { stageIndex, step }
}

export function prevPosition(stages, { stageIndex, step }) {
  if (step > 0) return { stageIndex, step: step - 1 }
  if (stageIndex > 0) return { stageIndex: stageIndex - 1, step: stages[stageIndex - 1].stepCount - 1 }
  return { stageIndex, step }
}

export const gotoPosition = (stages, stageIndex, step = 0) => clampPosition(stages, stageIndex, step)

export const resetPosition = () => ({ stageIndex: 0, step: 0 })

export const samePosition = (a, b) => a.stageIndex === b.stageIndex && a.step === b.step

/**
 * Re-anchor a stored state onto a (possibly changed) stage list: follow the
 * stage by key when it still exists (clamping the step). If the stage is gone,
 * clamp the index and start that stage at step 0 — keeping the old step could
 * instantly reveal names on a different tier (e.g. the whole podium).
 */
export function reconcileState(state, stages) {
  const byKey = state.stageKey ? stages.findIndex((s) => s.key === state.stageKey) : -1
  const pos = byKey >= 0 ? clampPosition(stages, byKey, state.step) : clampPosition(stages, state.stageIndex, 0)
  return { ...pos, stageKey: stages[pos.stageIndex].key }
}

/** Spoiler protection: strip students the audience must not see yet. */
export function filterForPublic(stages, state, settings) {
  if (!settings.spoilerProtection) return stages
  return stages.map((stage) => {
    if (stage.index < state.stageIndex || stage.type !== 'tier') return stage
    if (stage.index > state.stageIndex) return { ...stage, students: [] }
    const visible = LIST_STYLES.has(stage.tier.style)
      ? state.step >= 1
        ? stage.students
        : []
      : stage.students.slice(0, state.step)
    return { ...stage, students: visible }
  })
}

export const publicState = (state) => ({ stageIndex: state.stageIndex, step: state.step, updatedAt: state.updatedAt })

/** Full ShowPayload; `filtered` applies spoiler protection (public audience). */
export function buildPayload(db, { filtered, now = new Date() }) {
  const stages = buildStages(db)
  return {
    settings: db.settings,
    stages: filtered ? filterForPublic(stages, db.state, db.settings) : stages,
    state: publicState(db.state),
    totalWinners: db.students.length,
    version: db.meta.version,
    serverTime: now.toISOString(),
  }
}

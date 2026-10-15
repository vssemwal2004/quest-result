// Client mirror of the server's navigation rules (docs/SPEC.md "Navigation"), used by preview mode
// and to decide whether a freshly returned live state can be applied before its socket payload lands.
import type { ShowStage } from '@/types'

export interface Position {
  stageIndex: number
  step: number
}

function toInt(n: number): number {
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function clampPosition(stages: ShowStage[], pos: Position): Position {
  if (stages.length === 0) return { stageIndex: 0, step: 0 }
  const stageIndex = Math.min(Math.max(0, toInt(pos.stageIndex)), stages.length - 1)
  const maxStep = Math.max(0, stages[stageIndex].stepCount - 1)
  return { stageIndex, step: Math.min(Math.max(0, toInt(pos.step)), maxStep) }
}

export function nextPosition(stages: ShowStage[], from: Position): Position {
  const pos = clampPosition(stages, from)
  const stage = stages[pos.stageIndex]
  if (!stage) return pos
  if (pos.step < stage.stepCount - 1) return { stageIndex: pos.stageIndex, step: pos.step + 1 }
  if (pos.stageIndex < stages.length - 1) return { stageIndex: pos.stageIndex + 1, step: 0 }
  return pos
}

export function prevPosition(stages: ShowStage[], from: Position): Position {
  const pos = clampPosition(stages, from)
  if (pos.step > 0) return { stageIndex: pos.stageIndex, step: pos.step - 1 }
  if (pos.stageIndex > 0) {
    const prev = stages[pos.stageIndex - 1]
    return { stageIndex: pos.stageIndex - 1, step: Math.max(0, prev.stepCount - 1) }
  }
  return pos
}

/**
 * With spoiler protection the public payload only carries revealed students, so a state returned
 * by POST /next can be ahead of the data we hold. Only apply it early when the students it needs
 * are already present; otherwise wait for the matching `show:update`.
 */
export function hasDataFor(stages: ShowStage[], pos: Position): boolean {
  const stage = stages[pos.stageIndex]
  if (!stage?.tier) return true
  const needed = Math.min(stage.tier.style === 'grid' || stage.tier.style === 'scroll'
    ? Math.max(0, Math.floor((pos.step - 1) / 2))
    : stage.tier.style === 'podium' ? Math.floor(pos.step / 2) : pos.step, stage.studentCount)
  return stage.students.length >= needed
}

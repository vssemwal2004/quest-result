// Pure helpers that mirror the server's navigation rules (docs/SPEC.md "Navigation") so the
// Live control page can describe what the audience sees now and what the next press will do.
import type { PublicStudent, ShowStage, ShowState } from '@/types'
import { formatRange } from '@/show/contracts'

export interface Position {
  stageIndex: number
  step: number
}

export function nextPosition(stages: ShowStage[], { stageIndex, step }: Position): Position | null {
  const stage = stages[stageIndex]
  if (!stage) return null
  if (step < stage.stepCount - 1) return { stageIndex, step: step + 1 }
  if (stageIndex < stages.length - 1) return { stageIndex: stageIndex + 1, step: 0 }
  return null
}

export function totalSteps(stages: ShowStage[]): number {
  return stages.reduce((sum, s) => sum + s.stepCount, 0)
}

/** Zero-based index of the position across the whole show. */
export function absoluteStep(stages: ShowStage[], { stageIndex, step }: Position): number {
  return stages.slice(0, stageIndex).reduce((sum, s) => sum + s.stepCount, 0) + step
}

export function stageRange(stage: ShowStage): string | null {
  return stage.tier ? formatRange(stage.tier.rankFrom, stage.tier.rankTo) : null
}

export function studentLabel(s: PublicStudent): string {
  return `Rank ${s.rank} · ${s.name}`
}

export interface StepDescription {
  /** Short phrase, e.g. "Title card" or "Revealed 7 of 17". */
  headline: string
  /** One sentence for the operator. */
  detail: string
  /** The student this step puts on screen (spotlight/podium), if any. */
  student: PublicStudent | null
}

/** What the audience sees at a given stage/step. Requires UNFILTERED stages (admin presentation). */
export function describeStep(stage: ShowStage, step: number): StepDescription {
  if (stage.type === 'intro') {
    return {
      headline: 'Welcome screen',
      detail: 'AI Quest intro with the robot and the “Reveal Results” button.',
      student: null,
    }
  }
  if (stage.type === 'finale') {
    return { headline: 'Finale', detail: 'Congratulations and thank-you screen.', student: null }
  }
  const tier = stage.tier
  const range = tier ? `ranks ${formatRange(tier.rankFrom, tier.rankTo)}` : 'this tier'
  if (step === 0) {
    const prize = tier?.prizeAmount || tier?.prize
    return {
      headline: 'Title card',
      detail: `${stage.title} · ${range}${prize ? ` · ${prize}` : ''}. No names visible yet.`,
      student: null,
    }
  }
  if (tier?.style === 'scroll' || tier?.style === 'grid') {
    return {
      headline: tier.style === 'scroll' ? 'Scroll wall' : 'Grid of winners',
      detail: `All ${stage.studentCount} students of ${range} are on screen.`,
      student: null,
    }
  }
  const student = stage.students[step - 1] ?? null
  return {
    headline: `Revealed ${step} of ${stage.studentCount}`,
    detail: student ? `Latest reveal: ${studentLabel(student)}.` : `Step ${step} of ${stage.stepCount - 1}.`,
    student,
  }
}

/** Sentence describing what pressing Next will put on screen. */
export function describeNext(stages: ShowStage[], state: ShowState): string {
  const next = nextPosition(stages, state)
  if (!next) return 'End of show — Next does nothing.'
  const stage = stages[next.stageIndex]
  const sameStage = next.stageIndex === state.stageIndex
  if (stage.type === 'finale') return 'Finale: congratulations & thank-you screen.'
  if (stage.type === 'intro') return 'Welcome screen.'
  if (next.step === 0) {
    return `${sameStage ? '' : 'New stage — '}${stage.title} title card (${stageRange(stage) ?? ''}).`
  }
  const desc = describeStep(stage, next.step)
  if (desc.student) return `${stage.title}: reveals ${studentLabel(desc.student)}.`
  return `${stage.title}: ${desc.detail}`
}

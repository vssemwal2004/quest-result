// Pure helpers that mirror the server's navigation rules (docs/SPEC.md "Navigation") so the
// Live control page can describe what the audience sees now and what the next press will do.
import type { PublicStudent, ShowStage, ShowState } from '@/types'
import { formatRange } from '@/show/contracts'
import { gridPageBounds } from '@/show/gridPages'

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
    const { start, end } = gridPageBounds(stage, step)
    const page = stage.students.slice(start, end)
    return {
      headline: `Grid page ${step} of ${stage.stepCount - 1}`,
      detail: page.length
        ? `Showing ranks ${page[0].rank}–${page[page.length - 1].rank} (${page.length} students). Press Next or Previous to change pages.`
        : `This page has no students. Press Next or Previous to change pages.`,
      student: null,
    }
  }
  if (tier?.style === 'podium' && stage.studentCount > 1 && step > stage.studentCount) {
    return {
      headline: 'Top winners together',
      detail: `All ${stage.studentCount} winners of ${range} are on the podium.`,
      student: null,
    }
  }
  const student = stage.students[step - 1] ?? null
  if (tier?.style === 'podium') {
    return {
      headline: student ? `Rank ${student.rank} reveal` : 'Winner reveal',
      detail: student ? `${studentLabel(student)} is spotlighted with their details and tier prizes.` : `Step ${step} of ${stage.stepCount - 1}.`,
      student,
    }
  }
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

// Pure helpers that mirror the server's navigation rules (docs/SPEC.md "Navigation") so the
// Live control page can describe what the audience sees now and what the next press will do.
import type { PublicStudent, ShowStage, ShowState } from '@/types'
import { formatRange } from '@/show/contracts'
import { gridPageBounds, gridPageForStep } from '@/show/gridPages'

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
  return stage.tier ? stage.tier.style === 'school' ? `${stage.tier.schoolNames?.length ?? 0} schools` : formatRange(stage.tier.rankFrom, stage.tier.rankTo) : null
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
  if (tier?.style === 'school') {
    if (step === 0) return { headline: 'Best School title', detail: `${stage.title}: ${tier.schoolNames?.length ?? 0} schools are in the draw.`, student: null }
    if (step === 1) return { headline: 'Bot greeting', detail: 'The bot flies in and waves, as in the Top Three reveal.', student: null }
    if (step === 2) return { headline: 'Gold medal', detail: 'The gold medal appears. Next begins shuffling the school names.', student: null }
    if (step === 3) return { headline: 'Schools shuffling', detail: 'Candidate schools cycle on the gold medal. Next reveals the selected winner.', student: null }
    return { headline: 'Best School revealed', detail: `${stage.students[0]?.name ?? 'The selected school'} is revealed with the Top Three champion effects.`, student: stage.students[0] ?? null }
  }
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
    const pageNumber = gridPageForStep(stage, step)
    const { start, end } = gridPageBounds(stage, pageNumber)
    const revealed = step % 2 === 0
    const totalRevealed = revealed ? end : start
    return {
      headline: `Grid page ${pageNumber} of ${stage.pageEnds?.length ?? 1} · revealed ${totalRevealed} of ${stage.studentCount}`,
      detail: revealed
        ? `All ${end - start} students on page ${pageNumber} are revealed. Next ${pageNumber === stage.pageEnds?.length ? 'moves to the next stage' : 'shows the next page with cycling names'}.`
        : `All ${end - start} cards on page ${pageNumber} cycle decoy names. Next reveals the whole page.`,
      student: null,
    }
  }
  if (tier?.style === 'podium' && tier.podiumMode === 'hybrid') {
    if (step === 1) return { headline: 'Bot greeting', detail: 'The bot flies in and waves silently. Next brings in the medal rings.', student: null }
    if (step === 2) return { headline: 'Medal rings', detail: 'Bronze, silver and gold positions appear. Next spotlights the first rank to reveal.', student: null }
    const revealIndex = Math.floor((step - 3) / 2)
    const student = stage.students[revealIndex] ?? null
    const suspense = step % 2 === 1
    return {
      headline: student ? `Rank ${student.rank} ${suspense ? 'suspense' : 'reveal'}` : 'Winner reveal',
      detail: suspense
        ? `Rank ${student?.rank ?? '?'} gets a spotlight and cycling names. Next reveals the winner.`
        : `${student ? studentLabel(student) : 'The winner'} is revealed with ${student?.rank === tier.rankFrom ? 'gold fireworks and skyshots' : 'confetti'}. Earlier winners stay visible.`,
      student: suspense ? null : student,
    }
  }
  const revealStep = step
  if (tier?.style === 'podium' && stage.studentCount > 1 && revealStep > stage.studentCount * 2) {
    return {
      headline: 'Top winners together',
      detail: `All ${stage.studentCount} winners of ${range} are shown together ${tier.podiumMode === 'podium' ? 'on the podium' : 'by the bot'}.`,
      student: null,
    }
  }
  if (tier?.style === 'podium') {
    const student = stage.students[Math.floor((revealStep - 1) / 2)] ?? null
    const presenter = tier.podiumMode === 'bot' ? 'bot' : 'podium'
    if (revealStep % 2 === 1) return {
      headline: student ? `Rank ${student.rank} suspense` : 'Winner suspense',
      detail: student ? `${presenter === 'bot' ? 'The bot presents' : 'The camera focuses on'} rank ${student.rank}. Names shuffle until the next press.` : 'The next rank enters suspense.',
      student: null,
    }
    return {
      headline: student ? `Rank ${student.rank} reveal` : 'Winner reveal',
      detail: student ? `${studentLabel(student)} is revealed by the ${presenter} with their details and tier prizes.` : `Step ${step} of ${stage.stepCount - 1}.`,
      student,
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

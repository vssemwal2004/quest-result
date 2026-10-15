import type { ShowStage } from '@/types'

/** Odd steps cycle every name on a page; even steps reveal that whole page. */
export function gridPageForStep(stage: ShowStage, step: number): number {
  if (step <= 0) return 0
  const page = Math.ceil(step / 2)
  return Math.min(page, Math.max(1, stage.pageEnds?.length ?? Math.ceil(stage.studentCount / (stage.pageSize ?? 25))))
}

/** Offsets for a one-based grid page. The server owns the page boundaries. */
export function gridPageBounds(stage: ShowStage, page: number): { start: number; end: number } {
  if (page <= 0) return { start: 0, end: 0 }
  const ends = stage.pageEnds
  if (ends) return { start: ends[page - 2] ?? 0, end: ends[page - 1] ?? stage.studentCount }
  const size = stage.pageSize ?? 25
  return { start: (page - 1) * size, end: Math.min(page * size, stage.studentCount) }
}

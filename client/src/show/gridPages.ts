import type { ShowStage } from '@/types'

/** Offsets for a one-based grid page. The server owns the page boundaries. */
export function gridPageBounds(stage: ShowStage, page: number): { start: number; end: number } {
  if (page <= 0) return { start: 0, end: 0 }
  const ends = stage.pageEnds
  if (ends) return { start: ends[page - 2] ?? 0, end: ends[page - 1] ?? stage.studentCount }
  const size = stage.pageSize ?? 12
  return { start: (page - 1) * size, end: Math.min(page * size, stage.studentCount) }
}

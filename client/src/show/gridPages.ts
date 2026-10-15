import type { ShowStage } from '@/types'

/** Step 1 is the anonymous first page; each card then gets suspense and reveal steps. */
export function gridPageForStep(stage: ShowStage, step: number): number {
  if (step <= 0) return 0
  const activeCard = Math.floor(step / 2)
  const ends = stage.pageEnds ?? []
  const index = ends.findIndex((end) => activeCard <= end)
  return index < 0 ? Math.max(1, ends.length) : index + 1
}

/** Offsets for a one-based grid page. The server owns the page boundaries. */
export function gridPageBounds(stage: ShowStage, page: number): { start: number; end: number } {
  if (page <= 0) return { start: 0, end: 0 }
  const ends = stage.pageEnds
  if (ends) return { start: ends[page - 2] ?? 0, end: ends[page - 1] ?? stage.studentCount }
  const size = stage.pageSize ?? 12
  return { start: (page - 1) * size, end: Math.min(page * size, stage.studentCount) }
}

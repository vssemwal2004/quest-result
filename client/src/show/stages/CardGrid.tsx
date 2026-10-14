import { AnimatePresence, motion } from 'framer-motion'
import type { PublicStudent } from '@/types'
import { CARD_GAP, StudentCard } from './StudentCard'
import { accent, cssVars, u, useMeasure, useStageUnit } from './units'
import { columnCount, rowsThatFit, stackHeight } from './wallLayout'

/** Prefer complete rows and avoid leaving a single card stranded on the last row. */
function balancedColumns(count: number, maximum: number, rowsAvailable: number): number {
  if (count <= 1) return 1
  let best = 1
  let bestScore = Infinity
  for (let cols = 1; cols <= Math.min(count, maximum); cols++) {
    const rows = Math.ceil(count / cols)
    const empty = rows * cols - count
    const overflow = Math.max(0, rows - rowsAvailable)
    const score = overflow * 1000 + empty * 10 + rows
    if (score < bestScore) {
      best = cols
      bestScore = score
    }
  }
  return best
}

/** One grid page. Next and Previous in the presentation choose the page. */
export function CardGrid({ students, page, pageCount }: { students: PublicStudent[]; page: number; pageCount: number }) {
  const unitPx = useStageUnit()
  const [ref, size] = useMeasure<HTMLDivElement>()
  const cols = balancedColumns(students.length, columnCount(size.width, unitPx, 'sm'), rowsThatFit(size.height, unitPx, 'sm'))
  const rows = Math.ceil(students.length / cols)
  const fits = stackHeight(rows, unitPx, 'sm') <= size.height
  const gapPx = CARD_GAP * unitPx
  // Leave one pixel of slack so fractional widths never push a card onto an extra row.
  const cardWidth = (size.width - (cols - 1) * gapPx) / cols - 1

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={ref} className="relative min-h-0 flex-1 overflow-y-auto" style={{ perspective: u(120) }}>
        {size.width > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="flex min-h-full flex-wrap justify-center"
              style={{ alignContent: fits ? 'center' : 'flex-start', gap: u(CARD_GAP) }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            >
              {students.map((student, i) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  size="sm"
                  className="qs-card-in"
                  style={{ width: cardWidth, ...cssVars({ '--d': `${0.08 + Math.floor(i / cols) * 0.06 + (i % cols) * 0.04}s` }) }}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-center font-tech font-semibold text-white/75" style={{ height: u(2.5), fontSize: u(0.95), gap: u(0.6) }}>
        <span className="rounded-full" style={{ width: u(0.5), height: u(0.5), background: accent(1) }} />
        Page {page} / {pageCount}
      </div>
    </div>
  )
}

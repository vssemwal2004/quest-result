import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PublicStudent } from '@/types'
import { CARD_GAP, StudentCard } from './StudentCard'
import { accent, cssVars, u, type Size } from './units'
import { columnCount, rowsThatFit } from './wallLayout'

const PAGE_MS = 7000
/** Space reserved for the page indicator, in stage units. */
const INDICATOR_U = 3

/**
 * Centered grid of StudentCards with a staggered 3D entrance. When the cards do not fit,
 * it auto-paginates (cross-fade every 7 s) with a page indicator.
 */
export function CardGrid({ students, size, unitPx }: { students: PublicStudent[]; size: Size; unitPx: number }) {
  const cols = columnCount(size.width, unitPx, 'md')
  const fullRows = rowsThatFit(size.height, unitPx, 'md')
  const paginated = cols * fullRows < students.length
  const rows = paginated ? rowsThatFit(size.height - INDICATOR_U * unitPx, unitPx, 'md') : fullRows
  const pageSize = cols * rows
  const pageCount = Math.max(1, Math.ceil(students.length / pageSize))

  const [page, setPage] = useState(0)
  useEffect(() => {
    if (pageCount <= 1) return
    const id = window.setInterval(() => setPage((p) => (p + 1) % pageCount), PAGE_MS)
    return () => window.clearInterval(id)
  }, [pageCount])
  const current = page % pageCount

  const pageStudents = useMemo(() => students.slice(current * pageSize, (current + 1) * pageSize), [students, current, pageSize])
  const gapPx = CARD_GAP * unitPx
  const cardWidth = (size.width - (cols - 1) * gapPx) / cols

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1" style={{ perspective: u(120) }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="absolute inset-0 flex flex-wrap content-center justify-center"
            style={{ gap: u(CARD_GAP) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.45 } }}
          >
            {pageStudents.map((s, i) => (
              <StudentCard
                key={s.id}
                student={s}
                className="qs-card-in"
                style={{ width: cardWidth, ...cssVars({ '--d': `${0.12 + Math.floor(i / cols) * 0.09 + (i % cols) * 0.05}s` }) }}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {pageCount > 1 && (
        <div className="flex shrink-0 items-center justify-center" style={{ height: u(INDICATOR_U), gap: u(0.7) }}>
          {Array.from({ length: pageCount }, (_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                height: u(0.55),
                width: i === current ? u(3) : u(0.55),
                background: i === current ? accent(1) : 'rgba(255,255,255,.3)',
                boxShadow: i === current ? `0 0 ${u(0.8)} ${accent(0.8)}` : undefined,
              }}
            />
          ))}
          <span className="font-tech font-semibold text-white/70" style={{ fontSize: u(0.95), marginLeft: u(0.8), letterSpacing: '0.15em' }}>
            {current + 1} / {pageCount}
          </span>
        </div>
      )}
    </div>
  )
}

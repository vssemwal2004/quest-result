import { AnimatePresence, motion } from 'framer-motion'
import type { PublicStudent } from '@/types'
import { DecoyName } from './DecoyName'
import { RankBadge } from './RankBadge'
import { CARD, CARD_GAP, StudentCard } from './StudentCard'
import { accent, cssVars, u, useMeasure, useStageUnit } from './units'

function PendingCard({ rank, reducedMotion }: { rank: number; reducedMotion: boolean }) {
  return (
    <div className="qs-grid-card-back relative flex h-full items-center overflow-hidden rounded-2xl border border-cyan-200/65 bg-gradient-to-br from-[#3655ae] via-[#18377e] to-[#091c58]" style={{ padding: u(CARD.sm.pad), gap: u(CARD.sm.gap) }}>
      <div className="relative grid shrink-0 place-items-center rounded-full border border-cyan-200/70 bg-cyan-300/15 font-tech font-black text-cyan-100" style={{ width: u(CARD.sm.avatar), height: u(CARD.sm.avatar), fontSize: u(1.6) }}>
        ?
        <div className="absolute" style={{ right: u(-CARD.sm.badge * .42), bottom: u(-CARD.sm.badge * .3) }}><RankBadge rank={rank} size={CARD.sm.badge} /></div>
      </div>
      <div className="min-w-0 flex-1" style={{ paddingLeft: u(CARD.sm.badge * .25) }}>
        <div className="truncate font-sans font-bold text-white" style={{ fontSize: u(1.12), lineHeight: 1.15 }}><DecoyName reducedMotion={reducedMotion} /></div>
        <div className="font-tech uppercase tracking-widest text-cyan-100/70" style={{ fontSize: u(.62), marginTop: u(.22) }}>Rank #{rank} · reveal pending</div>
      </div>
    </div>
  )
}

/** Every fixed card cycles a decoy name until Next reveals the entire page together. */
export function CardGrid({ students, ranks, page, pageCount, revealed, reducedMotion }: { students: PublicStudent[]; ranks: number[]; page: number; pageCount: number; revealed: boolean; reducedMotion: boolean }) {
  const unitPx = useStageUnit()
  const [ref, size] = useMeasure<HTMLDivElement>()
  const gapPx = CARD_GAP * unitPx
  // A 25-card page can fit five columns even on a 1280px projector.
  const minWidth = Math.max(190, CARD.sm.minWidth * unitPx)
  const maximum = Math.min(5, Math.max(1, Math.floor((size.width + gapPx) / (minWidth + gapPx))))
  // Square-ish grids leave room to enlarge every card on pages with fewer students.
  const cols = Math.min(maximum, Math.max(1, Math.ceil(Math.sqrt(ranks.length))))
  const rows = Math.ceil(ranks.length / cols)
  const sidePadding = 1.2 * unitPx
  // Leave one pixel of slack so fractional widths never push a card onto an extra row.
  const cellWidth = (size.width - 2 * sidePadding - (cols - 1) * gapPx) / cols - 1
  const scale = ranks.length >= 25 || !size.height ? 1 : Math.max(.75, Math.min(
    2.3,
    cellWidth / (16 * unitPx),
    (size.height - (rows - 1) * gapPx) / (rows * CARD.sm.height * unitPx),
  ))
  const cardUnitPx = unitPx * scale
  const cardHeight = CARD.sm.height * cardUnitPx
  // Keep sparse cards in the same wide format instead of stretching them edge to edge.
  const cardWidth = ranks.length >= 25 ? cellWidth : Math.min(cellWidth, cardHeight * 3.5)
  const fits = rows * cardHeight + (rows - 1) * gapPx <= size.height

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={ref} className="relative min-h-0 flex-1 overflow-y-auto">
        {size.width > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="flex min-h-full flex-wrap justify-center"
              style={{ alignContent: fits ? 'center' : 'flex-start', gap: u(CARD_GAP), paddingInline: u(1.2) }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            >
              {ranks.map((rank, i) => (
                <div key={rank} className="relative" style={{ width: cardWidth, height: cardHeight, ...(ranks.length < 25 ? cssVars({ '--u': `${cardUnitPx}px` }) : {}) }}>
                  {revealed && students[i] ? (
                    <motion.div
                      className="h-full"
                      initial={reducedMotion ? false : { opacity: 0, scale: .88, rotateY: -55 }}
                      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                      transition={{ duration: reducedMotion ? 0 : .65, ease: 'easeOut' }}
                    >
                      <StudentCard student={students[i]} size="sm" reducedMotion={reducedMotion} instant />
                    </motion.div>
                  ) : (
                    <PendingCard rank={rank} reducedMotion={reducedMotion} />
                  )}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-center font-tech font-semibold text-white/75" style={{ height: u(2.5), fontSize: u(0.95), gap: u(0.6) }}>
        <span className="rounded-full" style={{ width: u(0.5), height: u(0.5), background: accent(1) }} />
        Page {page} / {pageCount} · {revealed ? 'Revealed' : 'Reveal pending'}
      </div>
    </div>
  )
}

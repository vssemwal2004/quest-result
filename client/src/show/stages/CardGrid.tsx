import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { PublicStudent } from '@/types'
import { RankBadge } from './RankBadge'
import { DecoyName } from './DecoyName'
import { CARD, CARD_GAP, StudentCard } from './StudentCard'
import { U_CSS, accent, cssVars, u, useMeasure, useStageUnit } from './units'
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

type RevealPhase = 'idle' | 'suspense' | 'reveal'

/** The card stays in its slot while its popup carries the suspense and reveal. */
function GridRevealCard({ rank, student, phase, width, reducedMotion }: { rank: number; student?: PublicStudent; phase: RevealPhase; width: number; reducedMotion: boolean }) {
  const [finished, setFinished] = useState(phase === 'idle' && Boolean(student))
  const [pop, setPop] = useState<{ rect: DOMRect; accentRgb: string } | null>(null)
  const [returning, setReturning] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase === 'idle') {
      setFinished(Boolean(student))
      setPop(null)
      setReturning(false)
      return
    }
    setFinished(false)
    const capture = () => {
      const slot = slotRef.current
      const rect = slot?.getBoundingClientRect()
      return slot && rect ? { rect, accentRgb: getComputedStyle(slot).getPropertyValue('--accent-rgb').trim() || '56 225 255' } : null
    }
    if (phase === 'suspense') {
      setReturning(false)
      setPop(capture())
      return
    }
    // When a presenter jumps directly to a reveal step, still give it a popup.
    setPop((previous) => previous ?? capture())
    const timer = window.setTimeout(() => setReturning(true), reducedMotion ? 1100 : 1800)
    return () => window.clearTimeout(timer)
  }, [phase, rank, reducedMotion, student?.id])

  return (
    <div
      ref={slotRef}
      className="relative"
      style={{ width, height: u(CARD.sm.height) }}
    >
      {student && (phase === 'idle' || finished) ? (
        <StudentCard student={student} size="sm" reducedMotion={reducedMotion} instant />
      ) : (
        <div className="relative h-full">
          <div className="qs-grid-card-back relative flex h-full items-center overflow-hidden rounded-2xl border border-cyan-200/45 bg-[#0a2167]/95" style={{ padding: u(CARD.sm.pad), gap: u(CARD.sm.gap) }}>
            <div className="relative grid shrink-0 place-items-center rounded-full border border-cyan-200/55 bg-cyan-200/10 font-tech font-black text-cyan-100" style={{ width: u(CARD.sm.avatar), height: u(CARD.sm.avatar), fontSize: u(1.6) }}>
              ?
              <div className="absolute" style={{ right: u(-CARD.sm.badge * 0.42), bottom: u(-CARD.sm.badge * 0.3) }}><RankBadge rank={rank} size={CARD.sm.badge} /></div>
            </div>
            <div className="min-w-0 flex-1" style={{ paddingLeft: u(CARD.sm.badge * 0.25) }}>
              <div className="font-tech font-bold tracking-[.18em] text-cyan-100/80" style={{ fontSize: u(1) }}>RANK #{rank}</div>
              <div className="mt-1 rounded-full bg-white/15" style={{ width: '66%', height: u(.55) }} />
            </div>
          </div>
        </div>
      )}
      {pop && createPortal(
        <GridCardPop
          rank={rank}
          student={student}
          phase={phase}
          returning={returning}
          reducedMotion={reducedMotion}
          rect={pop.rect}
          accentRgb={pop.accentRgb}
          onComplete={() => {
            setFinished(true)
            setPop(null)
          }}
        />,
        document.body,
      )}
    </div>
  )
}

function GridSuspenseFace({ rank, reducedMotion }: { rank: number; reducedMotion: boolean }) {
  return (
    <div className="relative flex h-full items-center overflow-hidden rounded-2xl border border-cyan-200/65 bg-gradient-to-br from-[#3655ae] via-[#18377e] to-[#091c58]" style={{ padding: u(CARD.sm.pad), gap: u(CARD.sm.gap) }}>
      <div className="relative grid shrink-0 place-items-center rounded-full border border-cyan-200/70 bg-cyan-300/15 font-tech font-black text-cyan-100" style={{ width: u(CARD.sm.avatar), height: u(CARD.sm.avatar), fontSize: u(1.6) }}>
        ?
        <div className="absolute" style={{ right: u(-CARD.sm.badge * .42), bottom: u(-CARD.sm.badge * .3) }}><RankBadge rank={rank} size={CARD.sm.badge} /></div>
      </div>
      <div className="min-w-0 flex-1" style={{ paddingLeft: u(CARD.sm.badge * .25) }}>
        <div className="font-sans font-bold text-white" style={{ fontSize: u(1.12), lineHeight: 1.15 }}><DecoyName reducedMotion={reducedMotion} /></div>
        <div className="font-tech uppercase tracking-widest text-cyan-100/70" style={{ fontSize: u(.62), marginTop: u(.22) }}>Rank #{rank} · reveal pending</div>
      </div>
    </div>
  )
}

/** The popup waits with decoy names until Next, then shows the real student and returns. */
function GridCardPop({ rank, student, phase, returning, reducedMotion, rect, accentRgb, onComplete }: { rank: number; student?: PublicStudent; phase: RevealPhase; returning: boolean; reducedMotion: boolean; rect: DOMRect; accentRgb: string; onComplete: () => void }) {
  const dx = window.innerWidth / 2 - (rect.left + rect.width / 2)
  const dy = window.innerHeight / 2 - (rect.top + rect.height / 2)
  const zoom = Math.min(2.15, (window.innerWidth - 64) / rect.width, (window.innerHeight - 96) / rect.height)
  return (
    <>
      <motion.div
        className="pointer-events-none fixed inset-0 z-[80] bg-[#020b2b]"
        initial={{ opacity: 0 }}
        animate={{ opacity: returning ? 0 : .38 }}
        transition={{ duration: reducedMotion ? 0 : .55 }}
      />
      <motion.div
        className="pointer-events-none fixed z-[81]"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, transformOrigin: 'center center', ...cssVars({ '--u': U_CSS, '--accent-rgb': accentRgb }) }}
        initial={reducedMotion ? { x: dx, y: dy, scale: zoom, opacity: 1 } : { x: 0, y: 0, scale: 1, opacity: 0 }}
        animate={{ x: returning ? 0 : dx, y: returning ? 0 : dy, scale: returning ? 1 : zoom, opacity: 1 }}
        transition={{ duration: reducedMotion ? 0 : returning ? .7 : .85, ease: 'easeInOut' }}
        onAnimationComplete={() => { if (returning && phase === 'reveal') onComplete() }}
      >
        {phase === 'reveal' && student
          ? <StudentCard student={student} size="sm" instant />
          : <GridSuspenseFace rank={rank} reducedMotion={reducedMotion} />}
      </motion.div>
    </>
  )
}

/** One grid page: fixed backs, with one two-step suspense/reveal popup at a time. */
export function CardGrid({ students, ranks, page, pageCount, revealedCount, activeIndex, suspense, reducedMotion }: { students: PublicStudent[]; ranks: number[]; page: number; pageCount: number; revealedCount: number; activeIndex: number; suspense: boolean; reducedMotion: boolean }) {
  const unitPx = useStageUnit()
  const [ref, size] = useMeasure<HTMLDivElement>()
  const cols = balancedColumns(ranks.length, columnCount(size.width, unitPx, 'sm'), rowsThatFit(size.height, unitPx, 'sm'))
  const rows = Math.ceil(ranks.length / cols)
  const fits = stackHeight(rows, unitPx, 'sm') <= size.height
  const gapPx = CARD_GAP * unitPx
  const sidePadding = 1.2 * unitPx
  // Leave one pixel of slack so fractional widths never push a card onto an extra row.
  const cardWidth = (size.width - 2 * sidePadding - (cols - 1) * gapPx) / cols - 1

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={ref} className="relative min-h-0 flex-1 overflow-y-auto" style={{ perspective: u(120) }}>
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
                <GridRevealCard
                  key={rank}
                  rank={rank}
                  student={students[i]}
                  phase={i === activeIndex ? suspense ? 'suspense' : 'reveal' : 'idle'}
                  width={cardWidth}
                  reducedMotion={reducedMotion}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-center font-tech font-semibold text-white/75" style={{ height: u(2.5), fontSize: u(0.95), gap: u(0.6) }}>
        <span className="rounded-full" style={{ width: u(0.5), height: u(0.5), background: accent(1) }} />
        Page {page} / {pageCount} · {revealedCount} / {ranks.length} revealed
      </div>
    </div>
  )
}

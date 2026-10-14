import { useEffect, useMemo, useRef } from 'react'
import type { PublicStudent } from '@/types'
import { CardGrid } from './CardGrid'
import { CARD, CARD_GAP, StudentCard } from './StudentCard'
import { clamp, cssVars, u, useMeasure, useStageUnit, type Size } from './units'
import { chunk, columnCount, stackHeight } from './wallLayout'

/** Per-column speed multipliers; even columns scroll up, odd columns down, for depth. */
const SPEED_FACTORS = [1, 0.84, 1.12, 0.92, 1.06, 0.88]
/** Let the entrance cascade finish, then ease the scroll in. */
const HOLD_MS = 1600
const RAMP_MS = 1800
/** autoScrollSpeed is specified in px/s at 1080p; scale it so 4K scrolls at the same visual pace. */
const REFERENCE_UNIT_PX = 19.2

/**
 * Student list for `scroll` and `grid` tiers.
 * - scroll: tilted multi-column infinite marquee; falls back to a static centered grid when everything
 *   fits, and to the paginated grid under reduced motion (so nobody's name is hidden off-screen).
 * - grid: staggered, auto-paginating grid.
 */
export function StudentWall({
  students,
  mode,
  speed,
  reducedMotion,
}: {
  students: PublicStudent[]
  mode: 'scroll' | 'grid'
  speed: number
  reducedMotion: boolean
}) {
  const unitPx = useStageUnit()
  const [ref, size] = useMeasure<HTMLDivElement>()
  const cols = columnCount(size.width, unitPx, 'md')
  const fits = stackHeight(Math.ceil(students.length / cols), unitPx, 'md') <= size.height
  const marquee = mode === 'scroll' && !fits && !reducedMotion

  return (
    <div ref={ref} className="relative min-h-0 w-full flex-1">
      {size.width > 0 &&
        (marquee ? (
          <Marquee students={students} cols={cols} size={size} unitPx={unitPx} speed={speed} />
        ) : (
          <CardGrid students={students} size={size} unitPx={unitPx} />
        ))}
    </div>
  )
}

function Marquee({
  students,
  cols,
  size,
  unitPx,
  speed,
}: {
  students: PublicStudent[]
  cols: number
  size: Size
  unitPx: number
  speed: number
}) {
  const columns = useMemo(() => chunk(students, cols), [students, cols])
  const tracks = useRef<(HTMLDivElement | null)[]>([])
  // Loop progress (0..1) per column, kept across effect restarts (data refresh / resize / speed edits)
  // so the wall never jumps back.
  const progress = useRef<number[]>([])
  const mountedAt = useRef(performance.now())

  const rowStep = (CARD.md.height + CARD_GAP) * unitPx
  const gapPx = CARD_GAP * unitPx
  const colWidth = (size.width - (cols - 1) * gapPx) / cols
  const visibleRows = Math.ceil(size.height / rowStep) + 1

  // One infinite Web Animations transform per column. It runs on the compositor thread, so the
  // main thread does no per-frame work at all (writing style.transform from rAF forced Chrome to
  // re-layerize the whole wall every frame).
  useEffect(() => {
    const pxPerSec = speed * (unitPx / REFERENCE_UNIT_PX)
    const running: { anim: Animation; index: number; duration: number }[] = []
    columns.forEach((col, i) => {
      const el = tracks.current[i]
      const loop = col.length * rowStep // one copy, including the gap before the next copy
      if (!el || loop <= 0 || pxPerSec <= 0) return
      const up = i % 2 === 0
      const duration = (loop / (pxPerSec * SPEED_FACTORS[i % SPEED_FACTORS.length])) * 1000
      const anim = el.animate(
        [{ transform: `translate3d(0, ${up ? 0 : -loop}px, 0)` }, { transform: `translate3d(0, ${up ? -loop : 0}px, 0)` }],
        { duration, iterations: Infinity, easing: 'linear' },
      )
      anim.currentTime = (progress.current[i] ?? 0) * duration
      running.push({ anim, index: i, duration })
    })

    // Hold while the entrance cascade plays, then ease the speed in with a few playbackRate updates.
    const setRate = () => {
      const t = clamp((performance.now() - mountedAt.current - HOLD_MS) / RAMP_MS, 0, 1)
      const rate = t * t * (3 - 2 * t)
      running.forEach(({ anim }) => (anim.playbackRate = rate))
      return t >= 1
    }
    const ramp = setRate() ? 0 : window.setInterval(() => setRate() && window.clearInterval(ramp), 120)

    const onVisibility = () => running.forEach(({ anim }) => (document.hidden ? anim.pause() : anim.play()))
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(ramp)
      document.removeEventListener('visibilitychange', onVisibility)
      running.forEach(({ anim, index, duration }) => {
        progress.current[index] = (Number(anim.currentTime ?? 0) % duration) / duration
        anim.cancel()
      })
    }
  }, [columns, rowStep, unitPx, speed])

  return (
    <div className="qs-fade-y absolute inset-0 overflow-hidden" style={{ perspective: u(110), contain: 'layout paint' }}>
      <div className="flex h-full justify-center" style={{ gap: u(CARD_GAP), transform: 'rotateX(9deg) scale(0.97)', transformOrigin: '50% 40%' }}>
        {columns.map((col, c) => {
          const loop = col.length * rowStep
          const copies = Math.max(2, Math.ceil(size.height / Math.max(loop, 1)) + 1)
          const visibleCopy = c % 2 === 0 ? 0 : 1 // down-scrolling columns start one copy up
          return (
            <div key={c} className="relative h-full shrink-0" style={{ width: colWidth }}>
              <div
                ref={(el) => {
                  tracks.current[c] = el
                }}
                className="absolute inset-x-0 top-0 flex flex-col will-change-transform"
                style={{ gap: u(CARD_GAP), transform: `translate3d(0, ${c % 2 === 0 ? 0 : -loop}px, 0)` }}
              >
                {Array.from({ length: copies }, (_, copy) =>
                  col.map((s, r) => {
                    const cascade = copy === visibleCopy && r < visibleRows
                    return (
                      <StudentCard
                        key={`${copy}-${s.id}`}
                        student={s}
                        className={cascade ? 'qs-card-in' : undefined}
                        style={cascade ? cssVars({ '--d': `${0.1 + r * 0.1 + c * 0.07}s` }) : undefined}
                      />
                    )
                  }),
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
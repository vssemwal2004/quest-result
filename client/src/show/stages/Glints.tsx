import { useMemo } from 'react'
import { cssVars, u } from './units'

/** Small deterministic PRNG so glint layouts are stable across renders. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GLINT_COLORS = ['#ffffff', '#ffe066', '#38e1ff'] as const

function Star({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full overflow-visible" aria-hidden>
      {/* static halo instead of a CSS drop-shadow filter (cheap to composite while twinkling) */}
      <circle cx="12" cy="12" r="9" fill={color} opacity="0.18" />
      <path d="M12 0 C12.8 8 16 11.2 24 12 C16 12.8 12.8 16 12 24 C11.2 16 8 12.8 0 12 C8 11.2 11.2 8 12 0 Z" fill={color} />
    </svg>
  )
}

/**
 * Twinkling four-point star glints scattered in a ring around the parent box
 * (positions avoid the central area so they never sit on top of text).
 */
export function Glints({ count, seed = 7, colors = GLINT_COLORS }: { count: number; seed?: number; colors?: readonly string[] }) {
  const glints = useMemo(() => {
    const rnd = mulberry32(seed)
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + rnd() * 0.6
      const radius = 0.52 + rnd() * 0.12
      return {
        left: 50 + Math.cos(angle) * radius * 100,
        top: 50 + Math.sin(angle) * radius * 100,
        size: 0.9 + rnd() * 1.6,
        delay: rnd() * 4,
        duration: 2.6 + rnd() * 2.4,
        color: colors[i % colors.length],
      }
    })
  }, [count, seed, colors])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {glints.map((g, i) => (
        <div
          key={i}
          className="qs-twinkle absolute"
          style={{
            left: `${g.left}%`,
            top: `${g.top}%`,
            width: u(g.size),
            height: u(g.size),
            ...cssVars({ '--d': `${g.delay}s`, '--t': `${g.duration}s` }),
          }}
        >
          <Star color={g.color} />
        </div>
      ))}
    </div>
  )
}

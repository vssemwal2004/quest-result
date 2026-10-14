import { useId } from 'react'
import { u } from './units'

const MAIN_STROKE =
  'M44 64 C150 40 330 30 520 34 C700 38 840 28 962 46 L948 62 L984 76 L956 92 L990 108 L958 124 L982 142 L950 158 ' +
  'C820 182 620 190 430 186 C270 183 140 192 30 176 L54 160 L16 146 L48 128 L20 110 L52 94 L24 78 Z'

/** Yellow brush-stroke shape from the AI Quest poster ("PRIZES UPTO ₹1 LAKH"). Stretches to its box. */
function BrushStroke() {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 220"
      preserveAspectRatio="none"
      className="absolute h-full w-full"
      style={{ inset: 0 }}
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.35" stopColor="#ffd23f" />
          <stop offset="0.8" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* baked soft shadow: offset copies instead of a CSS drop-shadow filter */}
      <path d={MAIN_STROKE} fill="#020a24" opacity="0.22" transform="translate(0 16)" />
      <path d={MAIN_STROKE} fill="#020a24" opacity="0.28" transform="translate(0 8)" />
      {/* trailing bristle streaks */}
      <g fill={`url(#${id}-fill)`} opacity="0.85">
        <path d="M940 58 L998 52 L992 62 L944 70 Z" />
        <path d="M948 150 L996 158 L986 166 L940 162 Z" />
        <path d="M6 70 L60 64 L56 76 L10 80 Z" opacity="0.7" />
        <path d="M2 168 L52 160 L58 172 L12 178 Z" opacity="0.7" />
      </g>
      {/* main stroke with ragged ends */}
      <path fill={`url(#${id}-fill)`} d={MAIN_STROKE} />
      {/* dry-brush highlights */}
      <g fill="none" stroke="#fff6c8" strokeLinecap="round" opacity="0.55">
        <path d="M90 62 C300 46 600 44 900 54" strokeWidth="6" />
        <path d="M140 80 C380 70 640 70 860 76" strokeWidth="3" opacity="0.6" />
      </g>
      <g fill="none" stroke="#c77d0a" strokeLinecap="round" opacity="0.35">
        <path d="M110 170 C360 176 640 174 900 160" strokeWidth="5" />
      </g>
    </svg>
  )
}

/**
 * Prize callout. `amount` (e.g. "Up to ₹1 Lakh") is the hero line; `prize` sits below.
 * With only a prize, the prize becomes the hero line. Render nothing when both are empty.
 * `scale` multiplies all sizes (1 = title-card size).
 */
export function PrizeBanner({ amount, prize, scale = 1 }: { amount: string; prize: string; scale?: number }) {
  const hero = amount.trim() || prize.trim()
  const sub = amount.trim() ? prize.trim() : ''
  if (!hero) return null
  const s = (n: number) => u(n * scale)
  return (
    <div className="relative inline-block -rotate-2" style={{ padding: `${s(1.3)} ${s(4.6)} ${s(1.5)}` }}>
      <BrushStroke />
      <div className="relative flex flex-col items-center text-center text-navy-900">
        {amount.trim() && (
          <span className="font-display font-extrabold uppercase" style={{ fontSize: s(1.15), letterSpacing: '0.18em', lineHeight: 1.1 }}>
            Prizes
          </span>
        )}
        <span
          className="font-display font-black italic"
          style={{
            fontSize: amount.trim() ? s(3.6) : s(2.3),
            lineHeight: 1.02,
            textShadow: '0 2px 0 rgba(255,255,255,.35)',
            maxWidth: s(40),
          }}
        >
          {hero}
        </span>
        {sub && (
          <span className="font-sans font-bold" style={{ fontSize: s(1.35), lineHeight: 1.2, marginTop: s(0.25), maxWidth: s(38) }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}

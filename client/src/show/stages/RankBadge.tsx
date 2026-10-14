import { accent, u } from './units'

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'

const GOLD = 'linear-gradient(160deg, #fff6c8 0%, #ffd23f 38%, #f59e0b 72%, #c77d0a 100%)'
const SILVER = 'linear-gradient(160deg, #ffffff 0%, #d7dee8 42%, #8f9db3 78%, #c9d3e0 100%)'

/** Hexagonal rank badge: gold for ranks ≤ 3, silver for ≤ 10, tier accent otherwise. `size` = width in stage units. */
export function RankBadge({ rank, size }: { rank: number; size: number }) {
  const tone = rank <= 3 ? 'gold' : rank <= 10 ? 'silver' : 'accent'
  const rim = tone === 'gold' ? GOLD : tone === 'silver' ? SILVER : `linear-gradient(160deg, #ffffff 0%, ${accent(1)} 35%, ${accent(0.55)} 100%)`
  const face = tone === 'accent' ? 'linear-gradient(180deg, #0b3bb3 0%, #041445 100%)' : rim
  const digits = String(rank).length
  const fontScale = digits <= 2 ? 0.44 : digits === 3 ? 0.36 : 0.28
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{
        width: u(size),
        height: u(size * 1.12),
      }}
    >
      {tone === 'gold' && (
        <div aria-hidden className="absolute rounded-full" style={{ inset: u(-size * 0.3), background: 'radial-gradient(closest-side, rgba(255,210,63,.6), rgba(255,210,63,0))' }} />
      )}
      <div className="absolute inset-0" style={{ clipPath: HEXAGON, background: rim }} />
      <div className="absolute" style={{ inset: u(size * 0.08), clipPath: HEXAGON, background: face }} />
      <span
        // Montserrat, not Orbitron: Orbitron's 1/7 read as one glyph at badge sizes ("171" looked like "111").
        className="relative font-display font-black leading-none tracking-tight"
        style={{
          fontSize: u(size * fontScale),
          color: tone === 'accent' ? '#ffffff' : '#041445',
          textShadow: tone === 'accent' ? `0 0 ${u(0.5)} ${accent(0.9)}` : '0 1px 0 rgba(255,255,255,.5)',
        }}
      >
        {rank}
      </span>
    </div>
  )
}

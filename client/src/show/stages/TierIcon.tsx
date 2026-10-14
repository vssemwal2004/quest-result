import { Award, Crown, Medal, Rocket, Sparkles, Star, Trophy, type LucideIcon } from 'lucide-react'
import type { TierIcon } from '@/types'
import { accent, u } from './units'

export const TIER_ICONS: Record<TierIcon, LucideIcon> = {
  trophy: Trophy,
  medal: Medal,
  star: Star,
  award: Award,
  crown: Crown,
  rocket: Rocket,
  sparkles: Sparkles,
}

/** Tier icon inside a glowing accent ring with a slowly rotating light arc. `size` is in stage units. */
export function TierIconRing({ icon, size, spin = true }: { icon: TierIcon; size: number; spin?: boolean }) {
  const Icon = TIER_ICONS[icon] ?? Award
  return (
    <div className="relative shrink-0" style={{ width: u(size), height: u(size) }}>
      <div
        className="absolute rounded-full"
        style={{
          inset: u(-size * 0.35),
          background: `radial-gradient(circle, ${accent(0.45)} 0%, ${accent(0.12)} 45%, transparent 70%)`,
        }}
      />
      <div
        className={spin ? 'qs-spin absolute inset-0 rounded-full' : 'absolute inset-0 rounded-full'}
        style={{
          background: `conic-gradient(from 0deg, ${accent(0)} 0deg, ${accent(1)} 90deg, #ffffff 120deg, ${accent(0.9)} 150deg, ${accent(0)} 260deg, ${accent(0.5)} 360deg)`,
        }}
      />
      <div
        className="absolute grid place-items-center rounded-full"
        style={{
          inset: u(size * 0.06),
          // inner rim glow baked into the gradient stack (no inset box-shadow)
          background: `radial-gradient(circle, transparent 58%, ${accent(0.55)} 100%), radial-gradient(circle at 35% 30%, #1f5eff 0%, #0a2a85 45%, #041445 100%)`,
        }}
      >
        <Icon
          strokeWidth={1.8}
          style={{ width: u(size * 0.48), height: u(size * 0.48), color: '#fff' }}
        />
      </div>
    </div>
  )
}

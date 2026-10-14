import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Gift, Users } from 'lucide-react'
import { formatRange } from '@/show/contracts'
import type { PublicTier } from '@/types'
import { TierIconRing } from './TierIcon'
import { accent, u } from './units'

/** Compact one-line tier header shown above the student lists. `right` replaces the winners chip. */
export function TierHeader({ tier, studentCount, right }: { tier: PublicTier; studentCount: number; right?: ReactNode }) {
  const prize = [tier.prizeAmount, tier.prize].map((s) => s.trim()).filter(Boolean).join(' · ')
  return (
    <motion.header
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex shrink-0 items-center justify-between"
      style={{ gap: u(2), height: u(5.6) }}
    >
      <div className="flex min-w-0 items-center" style={{ gap: u(1.4) }}>
        <TierIconRing icon={tier.icon} size={4.4} />
        <div className="min-w-0">
          <div className="flex items-baseline" style={{ gap: u(1.2) }}>
            <h2
              className="truncate font-display font-black uppercase text-white"
              style={{ fontSize: u(2.5), lineHeight: 1.05, letterSpacing: '0.01em', textShadow: `0 0 ${u(1.5)} ${accent(0.45)}` }}
            >
              {tier.name}
            </h2>
            <span
              className="shrink-0 font-tech font-extrabold"
              style={{ fontSize: u(1.45), color: accent(1), textShadow: `0 0 ${u(0.8)} ${accent(0.7)}` }}
            >
              {tier.rankFrom === tier.rankTo ? `RANK ${formatRange(tier.rankFrom, tier.rankTo)}` : `RANKS ${formatRange(tier.rankFrom, tier.rankTo)}`}
            </span>
          </div>
          <div className="mt-1 h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${accent(0.9)}, ${accent(0)})` }} />
        </div>
      </div>

      <div className="flex shrink-0 items-center" style={{ gap: u(1) }}>
        {prize && (
          <span
            className="inline-flex max-w-[50vw] items-center rounded-full bg-gold-gradient font-display font-extrabold text-navy-900 shadow-glow-gold"
            style={{ fontSize: u(1.1), padding: `${u(0.55)} ${u(1.4)}`, gap: u(0.6) }}
          >
            <Gift style={{ width: u(1.3), height: u(1.3) }} className="shrink-0" />
            <span className="truncate">{prize}</span>
          </span>
        )}
        {right ??
          (studentCount > 0 && (
            <span
              className="inline-flex items-center rounded-full border border-white/20 bg-white/10 font-sans font-semibold text-white"
              style={{ fontSize: u(1.1), padding: `${u(0.55)} ${u(1.3)}`, gap: u(0.6) }}
            >
              <Users style={{ width: u(1.3), height: u(1.3), color: accent(1) }} />
              {studentCount} {studentCount === 1 ? 'winner' : 'winners'}
            </span>
          ))}
      </div>
    </motion.header>
  )
}

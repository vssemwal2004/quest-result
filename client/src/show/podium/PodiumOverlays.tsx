import { motion } from 'framer-motion'
import { Gift } from 'lucide-react'
import { formatRange } from '@/show/contracts'
import { GoldText3D } from '@/show/stages/GoldText3D'
import { PrizeBanner } from '@/show/stages/PrizeBanner'
import { TierIconRing } from '@/show/stages/TierIcon'
import { accent, u } from '@/show/stages/units'
import type { PublicTier } from '@/types'

function rangeLabel(tier: PublicTier): string {
  return `${tier.rankFrom === tier.rankTo ? 'Rank' : 'Ranks'} ${formatRange(tier.rankFrom, tier.rankTo)}`
}

/** Step 0 headline above the empty podium: range, tier name in 3D gold, prize banner. */
export function PodiumTitle({ tier, reducedMotion }: { tier: PublicTier; reducedMotion: boolean }) {
  return (
    <motion.div
      className="absolute inset-x-0 top-0 z-30 flex flex-col items-center text-center"
      style={{ paddingTop: u(1.4) }}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, transition: { duration: 0.4 } }}
      transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <span
        className="font-tech font-extrabold uppercase"
        style={{ fontSize: u(1.4), letterSpacing: '0.45em', color: accent(1), textShadow: `0 0 ${u(1)} ${accent(0.8)}` }}
      >
        {rangeLabel(tier)}
      </span>
      <h1 className="font-display font-black uppercase" style={{ fontSize: u(4.6), lineHeight: 1.05, marginTop: u(0.3) }}>
        <GoldText3D>{tier.name}</GoldText3D>
      </h1>
      <div style={{ marginTop: u(0.9) }}>
        <PrizeBanner amount={tier.prizeAmount} prize={tier.prize} scale={0.75} />
      </div>
    </motion.div>
  )
}

/**
 * Compact tier plate in the top-left corner once reveals have started: the centre top belongs to the
 * champion card and the bottom to the block numbers.
 */
export function PodiumNameplate({ tier }: { tier: PublicTier }) {
  const prize = [tier.prizeAmount, tier.prize].map((s) => s.trim()).filter(Boolean).join(' · ')
  return (
    <motion.div
      className="absolute z-30 flex"
      style={{ top: u(1.4), left: u(2.5), maxWidth: u(30) }}
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.3 } }}
      transition={{ duration: 0.7, delay: 0.3 }}
    >
      <div
        className="flex items-center rounded-2xl border"
        style={{
          gap: u(1),
          padding: `${u(0.7)} ${u(1.4)} ${u(0.7)} ${u(0.8)}`,
          borderColor: accent(0.45),
          background: 'linear-gradient(180deg, rgba(10,42,133,.9), rgba(4,20,69,.95))',
        }}
      >
        <TierIconRing icon={tier.icon} size={3.4} />
        <div className="flex min-w-0 flex-col items-start" style={{ gap: u(0.35) }}>
          <span className="font-display font-black uppercase leading-tight text-white" style={{ fontSize: u(1.5), letterSpacing: '0.04em' }}>
            {tier.name}
          </span>
          <span className="font-tech font-bold" style={{ fontSize: u(0.95), color: accent(1) }}>
            {rangeLabel(tier)}
          </span>
          {prize && (
            <span
              className="inline-flex items-center rounded-full bg-gold-gradient text-left font-display font-extrabold text-navy-900"
              style={{ fontSize: u(0.9), padding: `${u(0.25)} ${u(0.9)}`, gap: u(0.4) }}
            >
              <Gift className="shrink-0" style={{ width: u(1), height: u(1) }} />
              {prize}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

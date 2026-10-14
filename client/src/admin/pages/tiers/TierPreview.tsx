import type { DisplayStyle, TierIcon } from '@/types'
import { formatRange } from '@/show/contracts'
import { STYLE_META, TIER_ICONS, withAlpha } from '../../lib/tierMeta'

interface TierPreviewProps {
  name: string
  subtitle: string
  rankFrom: number | null
  rankTo: number | null
  prize: string
  prizeAmount: string
  color: string
  icon: TierIcon
  style: DisplayStyle
}

/** Scaled-down approximation of the big-screen tier title card (step 0), for instant feedback while editing. */
export function TierPreview({ name, subtitle, rankFrom, rankTo, prize, prizeAmount, color, icon, style }: TierPreviewProps) {
  const Icon = TIER_ICONS[icon]
  const range = rankFrom && rankTo && rankTo >= rankFrom ? formatRange(rankFrom, rankTo) : '— – —'
  return (
    <div
      className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-quest-gradient"
      aria-label="Title card preview"
      role="img"
    >
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(60% 70% at 50% 40%, ${withAlpha(color, 0.35)}, transparent 70%)` }}
        aria-hidden
      />
      <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 320 180" preserveAspectRatio="none" aria-hidden>
        <path d="M0 30 H70 L85 45 H130 M320 150 H250 L235 135 H190 M0 150 H40 L55 135 H90 M320 30 H270 L255 45 H215" stroke="#38e1ff" strokeWidth="0.8" fill="none" />
      </svg>
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <span
          className="grid h-[18%] min-h-[2rem] aspect-square place-items-center rounded-full border-2"
          style={{ color, borderColor: withAlpha(color, 0.7), background: withAlpha(color, 0.15), boxShadow: `0 0 24px ${withAlpha(color, 0.6)}` }}
        >
          <Icon className="h-1/2 w-1/2" aria-hidden />
        </span>
        <p className="mt-2 font-tech text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color }}>
          Ranks {range}
        </p>
        <p className="mt-1 max-w-full truncate font-display text-2xl font-black italic leading-tight text-white drop-shadow-[0_2px_0_rgba(2,10,36,.8)]">
          {name || 'Tier name'}
        </p>
        {subtitle && <p className="max-w-full truncate text-xs text-white/70">{subtitle}</p>}
        {(prize || prizeAmount) && (
          <div className="mt-2.5 flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-navy-900">
            {prizeAmount && <span className="text-gold-700">{prizeAmount}</span>}
            {prize && <span className="truncate">{prize}</span>}
          </div>
        )}
      </div>
      <span className="absolute bottom-2 right-2 rounded-md bg-navy-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-white/60">
        {STYLE_META[style].label}
      </span>
    </div>
  )
}

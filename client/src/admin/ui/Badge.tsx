import type { ReactNode } from 'react'
import clsx from 'clsx'
import { withAlpha } from '../lib/tierMeta'

export type BadgeTone = 'neutral' | 'blue' | 'cyan' | 'gold' | 'green' | 'red' | 'amber'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-white/15 bg-white/[0.06] text-white/75',
  blue: 'border-royal-400/40 bg-royal-500/15 text-sky-200',
  cyan: 'border-cyan-glow/40 bg-cyan-glow/10 text-cyan-glow',
  gold: 'border-gold-400/40 bg-gold-400/10 text-gold-300',
  green: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  red: 'border-red-400/40 bg-red-500/10 text-red-300',
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
}

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  /** Hex accent; overrides `tone` (used for tier colors). */
  color?: string
  dot?: boolean
  className?: string
  title?: string
}

export function Badge({ children, tone = 'neutral', color, dot, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        !color && TONES[tone],
        className,
      )}
      style={color ? { borderColor: withAlpha(color, 0.45), background: withAlpha(color, 0.14), color } : undefined}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  )
}

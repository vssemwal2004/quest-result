import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

type Accent = 'blue' | 'gold' | 'cyan' | 'green' | 'red'

const ACCENTS: Record<Accent, { icon: string; bar: string }> = {
  blue: { icon: 'border-royal-400/40 bg-royal-500/20 text-sky-200', bar: 'from-royal-500 to-electric' },
  gold: { icon: 'border-gold-400/40 bg-gold-400/15 text-gold-300', bar: 'from-gold-600 to-gold-300' },
  cyan: { icon: 'border-cyan-glow/40 bg-cyan-glow/10 text-cyan-glow', bar: 'from-electric to-cyan-glow' },
  green: { icon: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', bar: 'from-emerald-500 to-emerald-300' },
  red: { icon: 'border-red-400/40 bg-red-500/10 text-red-300', bar: 'from-red-500 to-red-300' },
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: Accent
  /** 0..1 progress bar under the value. */
  progress?: number
  className?: string
}

export function StatCard({ icon: Icon, label, value, hint, accent = 'blue', progress, className }: StatCardProps) {
  const a = ACCENTS[accent]
  return (
    <div className={clsx('glass relative overflow-hidden rounded-2xl p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/55">{label}</p>
        <span className={clsx('grid h-9 w-9 place-items-center rounded-xl border', a.icon)}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      <div className="mt-2 truncate font-display text-3xl font-extrabold tracking-tight text-white">{value}</div>
      {progress !== undefined && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, Math.max(0, progress)) * 100)}
        >
          <div
            className={clsx('h-full origin-left rounded-full bg-gradient-to-r transition-transform duration-700', a.bar)}
            style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
          />
        </div>
      )}
      {hint && <p className="mt-2 truncate text-xs text-white/50">{hint}</p>}
    </div>
  )
}

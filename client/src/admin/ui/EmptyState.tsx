import type { ReactNode } from 'react'
import { CircleAlert, RotateCcw, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { errorMessage } from '../lib/errors'

interface EmptyStateProps {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="relative mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-cyan-glow/25 bg-cyan-glow/10 text-cyan-glow shadow-glow">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-extrabold text-white">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-white/60">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  title = 'Could not load this page',
  className,
}: {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={clsx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
    >
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-300">
        <CircleAlert className="h-7 w-7" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-extrabold text-white">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-white/60">{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" className="btn-ghost mt-5" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Try again
        </button>
      )}
    </div>
  )
}

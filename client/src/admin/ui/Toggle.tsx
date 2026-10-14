import { useId, type ReactNode } from 'react'
import clsx from 'clsx'
import { Spinner } from './Spinner'

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  busy?: boolean
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean
  className?: string
}

export function Toggle({ checked, onChange, label, description, disabled, busy, hideLabel, className }: ToggleProps) {
  const labelId = useId()
  const descId = useId()
  return (
    <div className={clsx('flex items-start gap-3', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'border-cyan-glow/60 bg-gradient-to-r from-royal-500 to-electric shadow-glow' : 'border-white/15 bg-white/10',
        )}
      >
        <span
          className={clsx(
            'grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[21px]' : 'translate-x-0.5',
          )}
        >
          {busy && <Spinner className="h-3 w-3 text-royal-600" />}
        </span>
      </button>
      <div className={clsx('min-w-0', hideLabel && 'sr-only')}>
        <span
          id={labelId}
          className={clsx('block text-sm font-medium text-white', !disabled && 'cursor-pointer')}
          onClick={() => !disabled && !busy && onChange(!checked)}
        >
          {label}
        </span>
        {description && (
          <span id={descId} className="mt-0.5 block text-xs leading-relaxed text-white/55">
            {description}
          </span>
        )}
      </div>
    </div>
  )
}

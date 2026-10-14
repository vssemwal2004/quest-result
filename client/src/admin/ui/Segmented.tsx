import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  ariaLabel: string
  disabled?: boolean
  className?: string
}

/** Radio group rendered as a segmented control. Arrow keys move the selection. */
export function Segmented<T extends string>({ value, onChange, options, ariaLabel, disabled, className }: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const nextIndex = (index + delta + options.length) % options.length
    onChange(options[nextIndex].value)
    refs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx('inline-flex rounded-xl border border-white/15 bg-navy-950/60 p-1', className)}
    >
      {options.map((opt, i) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              'flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60 disabled:opacity-50',
              active ? 'bg-gradient-to-b from-royal-500 to-royal-700 text-white shadow-glow' : 'text-white/60 hover:text-white',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

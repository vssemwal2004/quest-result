import { useRef, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import type { DisplayStyle } from '@/types'
import { STYLE_META, STYLE_OPTIONS, withAlpha } from '../../lib/tierMeta'

/** Miniature diagram of how each display style lays out on the big screen. */
function Schematic({ style, color }: { style: DisplayStyle; color: string }) {
  const tile = { background: withAlpha(color, 0.55) }
  switch (style) {
    case 'scroll':
      return (
        <div className="relative grid h-full grid-cols-3 gap-1 overflow-hidden px-2 [mask-image:linear-gradient(transparent,#000_25%,#000_75%,transparent)]">
          {[0, 1, 2].map((c) => (
            <div key={c} className="flex flex-col gap-1" style={{ transform: `translateY(${-c * 4}px)` }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-2 rounded-sm" style={tile} />
              ))}
            </div>
          ))}
        </div>
      )
    case 'grid':
      return (
        <div className="grid h-full grid-cols-4 grid-rows-3 gap-1 p-2">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="rounded-sm" style={tile} />
          ))}
        </div>
      )
    case 'spotlight':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-2">
          <div className="h-[55%] w-1/2 rounded" style={{ background: color, boxShadow: `0 0 12px ${withAlpha(color, 0.8)}` }} />
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-1.5 w-3 rounded-sm" style={tile} />
            ))}
          </div>
        </div>
      )
    case 'podium':
      return (
        <div className="flex h-full items-end justify-center gap-1 px-3 pb-1.5">
          <div className="h-[45%] w-1/4 rounded-t bg-gradient-to-b from-white to-silver" />
          <div className="h-[70%] w-1/4 rounded-t bg-gold-gradient shadow-glow-gold" />
          <div className="h-[30%] w-1/4 rounded-t bg-gradient-to-b from-amber-300 to-bronze" />
        </div>
      )
  }
}

export function StylePicker({
  value,
  onChange,
  color,
}: {
  value: DisplayStyle
  onChange: (s: DisplayStyle) => void
  color: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (index + delta + STYLE_OPTIONS.length) % STYLE_OPTIONS.length
    onChange(STYLE_OPTIONS[next])
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Display style" className="grid grid-cols-2 gap-3">
      {STYLE_OPTIONS.map((style, i) => {
        const meta = STYLE_META[style]
        const active = style === value
        return (
          <button
            key={style}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(style)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              'relative rounded-xl border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60',
              active ? 'border-cyan-glow/70 bg-cyan-glow/[0.08] shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25',
            )}
          >
            <div className="aspect-[16/9] overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-navy-800 to-navy-950">
              <Schematic style={style} color={color} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-white">
              <meta.icon className="h-3.5 w-3.5 text-cyan-glow" aria-hidden />
              {meta.label}
              {active && <Check className="ml-auto h-4 w-4 text-cyan-glow" aria-hidden />}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/55">{meta.description}</p>
          </button>
        )
      })}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { Check, ExternalLink, Locate } from 'lucide-react'
import clsx from 'clsx'
import type { ShowStage, ShowState } from '@/types'
import { STYLE_META, withAlpha } from '../../lib/tierMeta'
import { stageRange } from '../../lib/show'
import { previewHref, stageColor, stageIcon } from './stageIcon'

const MAX_DOTS = 24

function StepDots({ stage, status, step }: { stage: ShowStage; status: 'past' | 'current' | 'future'; step: number }) {
  if (stage.stepCount <= 1) return null
  const reached = status === 'past' ? stage.stepCount - 1 : status === 'current' ? step : -1
  if (stage.stepCount > MAX_DOTS) {
    const ratio = Math.max(0, reached) / (stage.stepCount - 1)
    return (
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full origin-left rounded-full bg-cyan-glow transition-transform" style={{ transform: `scaleX(${ratio})` }} />
        </div>
        <span className="text-[11px] tabular-nums text-white/50">
          {Math.max(0, reached)}/{stage.stepCount - 1}
        </span>
      </div>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: stage.stepCount }, (_, k) => (
        <span
          key={k}
          className={clsx(
            'h-1.5 rounded-full transition-all',
            k === 0 ? 'w-3' : 'w-1.5',
            status === 'current' && k === step
              ? 'bg-gold-400 shadow-[0_0_8px_rgba(255,210,63,.9)] ring-2 ring-gold-400/30'
              : k <= reached
                ? 'bg-cyan-glow/80'
                : 'bg-white/15',
          )}
        />
      ))}
    </div>
  )
}

interface StageTimelineProps {
  stages: ShowStage[]
  state: ShowState
  onJump: (stageIndex: number) => void
}

/** Vertical run-of-show with the live position highlighted. */
export function StageTimeline({ stages, state, onJump }: StageTimelineProps) {
  const containerRef = useRef<HTMLOListElement>(null)

  // Keep the live stage visible inside the scrollable list (without scrolling the page).
  useEffect(() => {
    const list = containerRef.current
    const item = list?.querySelector<HTMLElement>('[data-current="true"]')
    if (!list || !item) return
    const top = item.offsetTop // the list is position:relative, so this is relative to it
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - list.clientHeight / 3, behavior: 'smooth' })
    }
  }, [state.stageIndex])

  return (
    <ol ref={containerRef} className="relative max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto p-3" aria-label="Show timeline">
      {stages.map((stage) => {
        const status = stage.index < state.stageIndex ? 'past' : stage.index === state.stageIndex ? 'current' : 'future'
        const Icon = stageIcon(stage)
        const color = stageColor(stage)
        const range = stageRange(stage)
        return (
          <li
            key={stage.key}
            data-current={status === 'current'}
            aria-current={status === 'current' ? 'step' : undefined}
            className={clsx(
              'relative rounded-xl border p-3 transition',
              status === 'current'
                ? 'border-gold-400/70 bg-gold-400/[0.08] ring-1 ring-gold-400/30'
                : status === 'past'
                  ? 'border-white/5 bg-white/[0.02] opacity-60 hover:opacity-100'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20',
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border"
                style={{ color, borderColor: withAlpha(color, 0.45), background: withAlpha(color, 0.12) }}
              >
                {status === 'past' ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold tabular-nums text-white/35">{String(stage.index + 1).padStart(2, '0')}</span>
                  <p className="truncate text-sm font-semibold text-white">{stage.title}</p>
                  {status === 'current' && (
                    <span className="ml-auto shrink-0 rounded-full bg-red-500 px-1.5 py-px text-[9px] font-extrabold tracking-wider text-white">LIVE</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-white/50">
                  {stage.type === 'tier' ? (
                    <>
                      <span className="font-tech" style={{ color }}>
                        {range}
                      </span>
                      {stage.tier && ` · ${STYLE_META[stage.tier.style].label}`} · {stage.studentCount} student{stage.studentCount === 1 ? '' : 's'}
                    </>
                  ) : stage.type === 'intro' ? (
                    'Welcome & Reveal button'
                  ) : (
                    'Congratulations'
                  )}
                </p>
                <StepDots stage={stage} status={status} step={state.step} />
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-1.5">
              <a
                href={previewHref(stage.index, status === 'current' ? state.step : 0)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white"
                title="Rehearse this stage in a new tab without touching the live screen"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Preview
              </a>
              {status !== 'current' && (
                <button
                  type="button"
                  onClick={() => onJump(stage.index)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-glow hover:bg-cyan-glow/10"
                >
                  <Locate className="h-3.5 w-3.5" aria-hidden /> Jump here
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

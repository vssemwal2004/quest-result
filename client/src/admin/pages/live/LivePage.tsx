import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, MonitorPlay, RotateCcw, ShieldCheck, ShieldOff, Tv, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { StudentAvatar } from '@/components/StudentAvatar'
import type { ShowStage, ShowState } from '@/types'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useLive } from '../../state/LiveContext'
import { errorMessage } from '../../lib/errors'
import { absoluteStep, describeNext, describeStep, nextPosition, stageRange, totalSteps } from '../../lib/show'
import { STYLE_META, withAlpha } from '../../lib/tierMeta'
import { PageHeader, Panel } from '../../ui/Panel'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { ErrorState } from '../../ui/EmptyState'
import { PageLoader, Spinner } from '../../ui/Spinner'
import { Toggle } from '../../ui/Toggle'
import { Kbd } from '../../ui/Kbd'
import { isOverlayOpen } from '../../ui/Modal'
import { StageTimeline } from './StageTimeline'
import { PreviewFrame } from './PreviewFrame'
import { previewHref, stageColor, stageIcon } from './stageIcon'

const PRESS_LOCK_MS = 300

type Direction = 'next' | 'prev'

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable="true"]')
}

function NowCard({ stage, state, stages }: { stage: ShowStage; state: ShowState; stages: ShowStage[] }) {
  const desc = describeStep(stage, state.step)
  const Icon = stageIcon(stage)
  const color = stageColor(stage)
  const total = totalSteps(stages)
  const position = absoluteStep(stages, state)
  const range = stageRange(stage)

  return (
    <section
      className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-7"
      aria-live="polite"
      aria-label="On screen now"
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,.12), 0 0 0 1px ${withAlpha(color, 0.25)}, 0 20px 60px ${withAlpha(color, 0.15)}` }}
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: withAlpha(color, 0.25) }}
        aria-hidden
      />
      <div className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/60">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-red-500/70" aria-hidden />
          <span className="relative h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        On screen now
        <span className="ml-auto text-xs font-semibold normal-case tracking-normal tabular-nums text-white/45">
          Stage {state.stageIndex + 1}/{stages.length} · Step {state.step + 1}/{stage.stepCount}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${state.stageIndex}:${state.step}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="relative mt-5"
        >
          <div className="flex items-start gap-4">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border"
              style={{ color, borderColor: withAlpha(color, 0.5), background: withAlpha(color, 0.14), boxShadow: `0 0 24px ${withAlpha(color, 0.35)}` }}
            >
              <Icon className="h-7 w-7" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{stage.title}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-white/60">
                {range && (
                  <span className="font-tech font-bold" style={{ color }}>
                    {range}
                  </span>
                )}
                {stage.tier && <span>{STYLE_META[stage.tier.style].label}</span>}
                {stage.type === 'tier' && <span>· {stage.studentCount} students</span>}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-navy-950/50 p-4">
            <p className="font-display text-lg font-extrabold text-gold-300">{desc.headline}</p>
            <p className="mt-0.5 text-sm text-white/70">{desc.detail}</p>
            {desc.student && (
              <div className="mt-4 flex items-center gap-4">
                <StudentAvatar
                  name={desc.student.name}
                  photoUrl={desc.student.photoUrl}
                  rank={desc.student.rank}
                  className="h-14 w-14 text-[3.5rem]"
                  ring="ring-gold-400/60"
                />
                <div className="min-w-0">
                  <p className="font-tech text-xs font-bold text-gold-300">RANK {desc.student.rank}</p>
                  <p className="truncate text-lg font-semibold text-white">{desc.student.name}</p>
                  <p className="truncate text-sm text-white/55">{desc.student.school}</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="relative mt-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Show progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={position + 1}>
          <div
            className="h-full origin-left rounded-full bg-gradient-to-r from-electric via-cyan-glow to-gold-400 transition-transform duration-500"
            style={{ transform: `scaleX(${total > 1 ? position / (total - 1) : 1})` }}
          />
        </div>
        <p className="mt-1.5 text-right text-[11px] tabular-nums text-white/40">
          {position + 1} / {total} steps
        </p>
      </div>
    </section>
  )
}

export function LivePage() {
  useDocumentTitle('Live control')
  const { presentation, settings, loading, error, connected, viewers, reload, applyState, applySettings } = useLive()
  const [pending, setPending] = useState<Direction | null>(null)
  const [jumpTo, setJumpTo] = useState<number | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [previewOn, setPreviewOn] = useState(false)
  const [spoilerBusy, setSpoilerBusy] = useState(false)
  const inFlight = useRef(false)
  const lockUntil = useRef(0)

  const press = useCallback(
    async (dir: Direction) => {
      const now = performance.now()
      if (inFlight.current || now < lockUntil.current) return
      inFlight.current = true
      lockUntil.current = now + PRESS_LOCK_MS
      setPending(dir)
      try {
        const { state } = dir === 'next' ? await api.next() : await api.prev()
        applyState(state)
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        inFlight.current = false
        setPending(null)
      }
    },
    [applyState],
  )

  // Presentation-clicker compatible shortcuts while this page is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || isOverlayOpen() || isTypingTarget(e.target)) return
      const onControl = e.target instanceof HTMLElement && !!e.target.closest('button, a, [role="switch"]')
      let dir: Direction | null = null
      if (e.key === 'ArrowRight' || e.key === 'PageDown') dir = 'next'
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') dir = 'prev'
      // Space on a focused button should click that button, not advance the show.
      else if (e.key === ' ' && !onControl) dir = 'next'
      if (!dir) return
      e.preventDefault()
      void press(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  if (loading && !presentation) return <PageLoader label="Connecting to the show…" />
  if (!presentation) return <ErrorState error={error} onRetry={() => void reload()} title="Could not load the show" />

  const { stages, state } = presentation
  const stage = stages[state.stageIndex]
  const next = nextPosition(stages, state)
  const canPrev = state.stageIndex > 0 || state.step > 0
  const previewTarget = next ?? state
  const jumpStage = jumpTo !== null ? stages[jumpTo] : null

  const setSpoiler = async (value: boolean) => {
    setSpoilerBusy(true)
    try {
      const res = await api.updateSettings({ spoilerProtection: value })
      applySettings(res.settings)
      toast.success(value ? 'Spoiler protection on' : 'Spoiler protection off')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSpoilerBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Live control"
        description={
          <>
            Drives every connected big screen. <Kbd>→</Kbd> / <Kbd>Space</Kbd> next · <Kbd>←</Kbd> back · clickers work too.
          </>
        }
        actions={
          <>
            <a href="/" target="_blank" rel="noreferrer" className="btn-blue">
              <MonitorPlay className="h-4 w-4" aria-hidden /> Open big screen
            </a>
            <button type="button" className="btn-danger" onClick={() => setResetOpen(true)} disabled={!canPrev}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset show
            </button>
          </>
        }
      />

      {!connected && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Realtime connection lost — reconnecting. Next / Back still work; screens catch up as soon as they reconnect.
        </div>
      )}

      <div className="glass mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-3">
        <span className="flex items-center gap-2 text-sm">
          <span className={clsx('h-2.5 w-2.5 rounded-full', connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]' : 'bg-amber-400')} aria-hidden />
          <span className="font-semibold text-white">{connected ? 'Connected' : 'Reconnecting…'}</span>
        </span>
        <span className="flex items-center gap-2 text-sm text-white/70">
          <Tv className="h-4 w-4 text-cyan-glow" aria-hidden />
          <span className="font-tech font-bold text-white">{viewers ?? '—'}</span> connected screen{viewers === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2 sm:ml-auto">
          {settings?.spoilerProtection ? (
            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden />
          ) : (
            <ShieldOff className="h-4 w-4 text-amber-300" aria-hidden />
          )}
          <Toggle
            checked={settings?.spoilerProtection ?? true}
            onChange={(v) => void setSpoiler(v)}
            busy={spoilerBusy}
            disabled={!settings}
            label="Spoiler protection"
            description={settings?.spoilerProtection ? 'Screens only receive names already revealed.' : 'Screens receive every name in advance.'}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          {stage && <NowCard stage={stage} state={state} stages={stages} />}

          <div className="glass-strong sticky bottom-4 z-20 grid grid-cols-[1fr_2fr] gap-3 rounded-3xl p-2">
            <button
              type="button"
              onClick={() => void press('prev')}
              disabled={!canPrev || pending !== null}
              className="btn-ghost h-20 rounded-2xl text-lg font-bold sm:h-24"
              aria-keyshortcuts="ArrowLeft PageUp"
            >
              {pending === 'prev' ? <Spinner className="h-6 w-6" /> : <ChevronLeft className="h-7 w-7" aria-hidden />}
              Back
            </button>
            <button
              type="button"
              onClick={() => void press('next')}
              disabled={!next || pending !== null}
              className="btn-gold h-20 rounded-2xl text-xl sm:h-24 sm:text-2xl"
              aria-keyshortcuts="ArrowRight Space PageDown"
            >
              {next ? 'Next' : 'End of show'}
              {pending === 'next' ? <Spinner className="h-7 w-7" /> : next && <ChevronRight className="h-8 w-8" aria-hidden />}
              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden />
            </button>
          </div>

          <Panel
            title="Next up"
            actions={
              <Toggle
                checked={previewOn}
                onChange={setPreviewOn}
                label="Visual preview"
                description="Renders the next step in 3D (uses GPU)"
              />
            }
          >
            <p className="text-base text-white/85">{describeNext(stages, state)}</p>
            {previewOn && (
              <div className="mt-4">
                <PreviewFrame
                  src={previewHref(previewTarget.stageIndex, previewTarget.step, false)}
                  title="Preview of the next step"
                />
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Run of show" description={`${stages.length} stages`} bodyClassName="p-0" className="xl:sticky xl:top-20 xl:self-start">
          <StageTimeline stages={stages} state={state} onJump={setJumpTo} />
        </Panel>
      </div>

      <ConfirmDialog
        open={jumpStage !== null}
        onClose={() => setJumpTo(null)}
        tone="primary"
        title={`Jump to “${jumpStage?.title ?? ''}”?`}
        message={
          <>
            Every big screen switches to the {jumpStage?.type === 'tier' ? 'title card of this tier' : 'start of this stage'} immediately.
            {jumpTo !== null && jumpTo > state.stageIndex + 1 && (
              <span className="mt-2 block text-amber-200">Skipped stages will count as already revealed.</span>
            )}
          </>
        }
        confirmLabel="Jump now"
        onConfirm={async () => {
          if (jumpTo === null) return
          const res = await api.goto(jumpTo, 0)
          applyState(res.state)
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the show?"
        message="All big screens go back to the welcome intro. Nothing is deleted — you can step forward again at any time."
        confirmLabel="Reset to intro"
        onConfirm={async () => {
          const res = await api.reset()
          applyState(res.state)
          toast.success('Show reset to intro')
        }}
      />
    </>
  )
}

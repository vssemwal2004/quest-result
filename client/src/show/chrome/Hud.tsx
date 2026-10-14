import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import type { ShowStage } from '@/types'
import { formatRange, LAYOUT } from '../contracts'
import type { Position } from '../navigation'
import { stageAccent } from '../stageMeta'
import { toggleFullscreen } from '../useShowHotkeys'
import type { ShowMode } from '../useShow'

function segmentLabel(stage: ShowStage): { primary: string; secondary: string } {
  if (stage.tier) return { primary: formatRange(stage.tier.rankFrom, stage.tier.rankTo), secondary: stage.tier.name }
  return { primary: stage.type === 'finale' ? 'Finale' : 'Welcome', secondary: '' }
}

function useIsFullscreen(): boolean {
  const [fs, setFs] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  return fs
}

interface HudProps {
  stages: ShowStage[]
  position: Position
  mode: ShowMode
  connected: boolean
  canControl: boolean
  onPrev: () => void
  onNext: () => void
}

/** Bottom rail: live status, one progress segment per stage, and hover-only admin controls. */
export function Hud({ stages, position, mode, connected, canControl, onPrev, onNext }: HudProps) {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="group fixed inset-x-0 bottom-0 z-30 flex items-center gap-[1.8vw] px-[2.5vw]"
      style={{
        height: LAYOUT.bottomRail,
        background: 'linear-gradient(0deg, rgba(2,10,36,0.9) 0%, rgba(2,10,36,0.55) 55%, rgba(2,10,36,0) 100%)',
      }}
    >
      {mode === 'live' && <LiveIndicator connected={connected} showDetail={canControl} />}
      <ProgressRail stages={stages} position={position} />
      {canControl && <Controls onPrev={onPrev} onNext={onNext} />}
    </motion.footer>
  )
}

function LiveIndicator({ connected, showDetail }: { connected: boolean; showDetail: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5" title={connected ? 'Live' : 'Reconnecting'}>
      <span className="relative flex h-2.5 w-2.5">
        {connected && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />}
        <span
          className={clsx(
            'relative h-2.5 w-2.5 rounded-full transition-colors',
            connected ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-amber-400 shadow-[0_0_10px_#fbbf24]',
          )}
        />
      </span>
      <span className="font-tech text-[12px] font-extrabold tracking-[0.3em] text-white/85">LIVE</span>
      {!connected && showDetail && <span className="text-[12px] text-amber-200/80">Reconnecting…</span>}
    </div>
  )
}

function ProgressRail({ stages, position }: { stages: ShowStage[]; position: Position }) {
  return (
    <ol className="flex min-w-0 flex-1 items-end gap-[0.6vw]" aria-label="Show progress">
      {stages.map((stage, i) => {
        const state = i < position.stageIndex ? 'past' : i === position.stageIndex ? 'current' : 'future'
        const progress = state === 'past' ? 1 : state === 'current' ? (position.step + 1) / Math.max(1, stage.stepCount) : 0
        const accent = stageAccent(stage)
        const { primary, secondary } = segmentLabel(stage)
        return (
          <li key={stage.key} className="min-w-0 flex-1" aria-current={state === 'current' ? 'step' : undefined}>
            <div
              className={clsx(
                'mb-1.5 flex items-baseline gap-2 whitespace-nowrap transition-opacity duration-500',
                state === 'current' ? 'opacity-100' : state === 'past' ? 'opacity-60' : 'opacity-35',
              )}
            >
              <span className="font-tech text-[11px] font-extrabold tracking-[0.08em]" style={{ color: state === 'current' ? accent : '#fff' }}>
                {primary}
              </span>
              {secondary && <span className="truncate text-[11px] font-medium text-white/80">{secondary}</span>}
            </div>
            <div
              className="relative h-[5px] overflow-hidden rounded-full bg-white/10 transition-shadow duration-500"
              style={{ boxShadow: state === 'current' ? `0 0 14px ${accent}99` : undefined }}
            >
              <motion.div
                className="absolute inset-0 origin-left rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${accent}aa, ${accent})`,
                  opacity: state === 'past' ? 0.55 : 1,
                }}
                initial={false}
                animate={{ scaleX: progress }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Controls({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const fullscreen = useIsFullscreen()
  return (
    <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity duration-300 focus-within:opacity-100 group-hover:opacity-100">
      <HudButton label="Back (←)" onClick={onPrev}>
        <ChevronLeft className="h-5 w-5" />
      </HudButton>
      <HudButton label="Next (→)" onClick={onNext}>
        <ChevronRight className="h-5 w-5" />
      </HudButton>
      <HudButton label={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} onClick={toggleFullscreen}>
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </HudButton>
    </div>
  )
}

function HudButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        // Drop focus so a later Space/Enter from a clicker drives the show, not this button.
        e.currentTarget.blur()
        onClick()
      }}
      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-navy-900/80 text-white/85 transition-colors hover:border-cyan-glow/50 hover:bg-navy-800 hover:text-white"
    >
      {children}
    </button>
  )
}

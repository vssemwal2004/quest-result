import { Eye } from 'lucide-react'
import type { ShowStage } from '@/types'
import type { Position } from '../navigation'

/** Rehearsal marker so nobody mistakes a preview tab for the live screen. */
export function PreviewBadge({ stages, position }: { stages: ShowStage[]; position: Position }) {
  const stage = stages[position.stageIndex]
  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-gold-300/60 bg-navy-950/90 py-1.5 pl-2 pr-4 text-[12px] shadow-glow-gold">
        <span className="flex items-center gap-1.5 rounded-full bg-gold-gradient px-2.5 py-0.5 font-display font-extrabold uppercase tracking-wider text-navy-900">
          <Eye className="h-3.5 w-3.5" /> Preview · not live
        </span>
        {stage && (
          <span className="whitespace-nowrap font-medium text-white/85">
            Stage {position.stageIndex + 1}/{stages.length} · Step {position.step + 1}/{stage.stepCount}
            <span className="text-white/50"> · {stage.title}</span>
          </span>
        )}
      </div>
    </div>
  )
}

import { useId, type CSSProperties } from 'react'
import type { Quality } from '@/types'
import { Panel } from '../../ui/Panel'
import { Toggle } from '../../ui/Toggle'
import { Segmented } from '../../ui/Segmented'

export interface DisplayValues {
  spoilerProtection: boolean
  autoScrollSpeed: number
  showRobot: boolean
  quality: Quality
}

export const SCROLL_MIN = 10
export const SCROLL_MAX = 200

const QUALITY_HELP: Record<Quality, string> = {
  high: 'Bloom glow, dense particles, full resolution. For a dedicated GPU / gaming laptop.',
  medium: 'Lighter glow and fewer particles. Good default for most laptops.',
  low: 'Minimal 3D effects. Use on weak machines or if the animation stutters.',
}

function speedLabel(v: number): string {
  if (v < 30) return 'Very slow'
  if (v < 60) return 'Relaxed'
  if (v < 110) return 'Brisk'
  return 'Fast'
}

export function DisplaySection({ value, onChange }: { value: DisplayValues; onChange: (patch: Partial<DisplayValues>) => void }) {
  const speedId = useId()
  const fill = ((value.autoScrollSpeed - SCROLL_MIN) / (SCROLL_MAX - SCROLL_MIN)) * 100
  return (
    <Panel title="Display options" description="How the big screen behaves. Applies to every screen as soon as you save.">
      <div className="grid gap-6 md:grid-cols-2">
        <Toggle
          checked={value.spoilerProtection}
          onChange={(v) => onChange({ spoilerProtection: v })}
          label="Spoiler protection"
          description="Recommended. Screens only receive names that have already been revealed, so nobody can peek at upcoming winners via the network or a stray refresh."
        />
        <Toggle
          checked={value.showRobot}
          onChange={(v) => onChange({ showRobot: v })}
          label="Show robot mascot"
          description="The white AI Quest robot floats beside the intro and finale."
        />

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor={speedId} className="label">
              Scroll wall speed
            </label>
            <span className="font-tech text-sm text-white">
              {value.autoScrollSpeed} px/s <span className="text-xs text-white/50">· {speedLabel(value.autoScrollSpeed)}</span>
            </span>
          </div>
          <input
            id={speedId}
            type="range"
            min={SCROLL_MIN}
            max={SCROLL_MAX}
            step={5}
            value={value.autoScrollSpeed}
            onChange={(e) => onChange({ autoScrollSpeed: Number(e.target.value) })}
            className="aq-range mt-2 w-full"
            style={{ '--fill': `${fill}%` } as CSSProperties}
          />
          <p className="mt-1.5 text-xs text-white/50">For “Scroll wall” tiers. ~45 px/s lets the audience read each name comfortably.</p>
        </div>

        <div>
          <p className="label">3D quality</p>
          <Segmented<Quality>
            ariaLabel="3D quality"
            value={value.quality}
            onChange={(q) => onChange({ quality: q })}
            options={[
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <p className="mt-1.5 text-xs text-white/50">{QUALITY_HELP[value.quality]}</p>
        </div>
      </div>
    </Panel>
  )
}

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

export function DisplaySection({ value, onChange }: { value: DisplayValues; onChange: (patch: Partial<DisplayValues>) => void }) {
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

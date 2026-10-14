import type { ShowStage } from '@/types'
import type { SceneMode } from './scene/types'

const INTRO_ACCENT = '#38e1ff'
const FINALE_ACCENT = '#ffd23f'

/** Accent colour of a stage: the tier colour, cyan for the intro, gold for the finale. */
export function stageAccent(stage: ShowStage | null | undefined): string {
  if (!stage) return INTRO_ACCENT
  if (stage.tier) return stage.tier.color
  return stage.type === 'finale' ? FINALE_ACCENT : INTRO_ACCENT
}

export function sceneModeFor(stage: ShowStage | null | undefined): SceneMode {
  if (!stage) return 'boot'
  if (stage.type === 'intro') return 'intro'
  if (stage.type === 'finale') return 'finale'
  return stage.tier?.style === 'podium' ? 'podium' : 'tier'
}

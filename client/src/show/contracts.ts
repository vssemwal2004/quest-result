// Contract between the show shell (ShowPage, background, intro, HUD) and the stage renderers.
// See docs/SPEC.md "Show model". Render from stageIndex/step — never from students.length.
import type { Settings, ShowStage } from '@/types'

export interface StageProps {
  /** The stage to render (type 'tier' for TierStage / PodiumStage, 'finale' for FinaleStage). */
  stage: ShowStage
  /**
   * Effective step for this stage:
   * - the live step when this is the current stage
   * - stage.stepCount - 1 when this stage is in the past (fully revealed)
   */
  step: number
  settings: Settings
  totalWinners: number
  /** Effective 3D/animation quality (settings.quality, downgraded for prefers-reduced-motion / weak GPUs). */
  quality: Settings['quality']
  reducedMotion: boolean
}

// Module paths & named exports (implemented by the stage renderers, consumed by ShowPage):
//   '@/show/stages/TierStage'    → export function TierStage(props: StageProps)    (styles scroll | grid | spotlight)
//   '@/show/podium/PodiumStage'  → export function PodiumStage(props: StageProps)  (style podium)
//   '@/show/stages/FinaleStage'  → export function FinaleStage(props: StageProps)
// Each renders full-viewport content on TOP of the shared animated background (transparent root).
// The shell draws a slim brand TopBar (LAYOUT.topBar px) on tier/finale stages and the HUD progress rail
// (LAYOUT.bottomRail px) at the bottom; stage content must live between them.
//
// Shared brand component (implemented by the shell, usable by stages):
//   '@/show/brand/QuestLogo' → export function QuestLogo(props: { size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string; animated?: boolean })
//   renders the poster-style 3D "AI" (electric blue, circuit texture) + "Quest" (gold) lockup.

export const LAYOUT = { topBar: 88, bottomRail: 72 } as const

/** Ranks shown as "151 – 200" or "#1" for a single rank. */
export function formatRange(from: number, to: number): string {
  return from === to ? `#${from}` : `${from} – ${to}`
}

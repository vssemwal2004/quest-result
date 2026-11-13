import type { ShowStage } from '@/types'

/** Bot artwork modes keep the shared background rendering while on the podium stage. */
export function usesBot(stage: ShowStage, _step?: number): boolean {
  return stage.tier?.style === 'podium' && (stage.tier.podiumMode === 'bot' || stage.tier.podiumMode === 'hybrid')
}

import { PartyPopper, Play, type LucideIcon } from 'lucide-react'
import type { ShowStage } from '@/types'
import { TIER_ICONS } from '../../lib/tierMeta'

export function stageIcon(stage: ShowStage): LucideIcon {
  if (stage.type === 'intro') return Play
  if (stage.type === 'finale') return PartyPopper
  return stage.tier ? TIER_ICONS[stage.tier.icon] : Play
}

export function stageColor(stage: ShowStage): string {
  if (stage.type === 'tier' && stage.tier) return stage.tier.color
  return stage.type === 'finale' ? '#ffd23f' : '#38e1ff'
}

export function previewHref(stageIndex: number, step: number, hud = true): string {
  return `/?preview=1&stage=${stageIndex}&step=${step}${hud ? '' : '&hud=0'}`
}

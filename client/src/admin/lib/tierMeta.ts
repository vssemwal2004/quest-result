import {
  Award,
  Crown,
  Focus,
  LayoutGrid,
  Medal,
  Rocket,
  Rows3,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { DisplayStyle, TierIcon } from '@/types'

export const TIER_ICONS: Record<TierIcon, LucideIcon> = {
  trophy: Trophy,
  medal: Medal,
  star: Star,
  award: Award,
  crown: Crown,
  rocket: Rocket,
  sparkles: Sparkles,
}

export const TIER_ICON_OPTIONS = Object.keys(TIER_ICONS) as TierIcon[]

export interface StyleMeta {
  label: string
  description: string
  icon: LucideIcon
}

export const STYLE_META: Record<DisplayStyle, StyleMeta> = {
  scroll: {
    label: 'Scroll wall',
    description: 'All names glide up a multi-column wall. Best for large groups (30+).',
    icon: Rows3,
  },
  grid: {
    label: 'Grid',
    description: 'Every card appears at once in a staggered grid. Best for 10–40 names.',
    icon: LayoutGrid,
  },
  spotlight: {
    label: 'Spotlight',
    description: 'One student at a time on a hero card, each press of Next reveals the next.',
    icon: Focus,
  },
  podium: {
    label: '3D Podium',
    description: 'Gold, silver and bronze blocks in 3D, revealed 3 → 2 → 1. Max 3 ranks.',
    icon: Trophy,
  },
}

export const STYLE_OPTIONS = Object.keys(STYLE_META) as DisplayStyle[]

export const ACCENT_SWATCHES = [
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#c084fc',
  '#f472b6',
  '#34d399',
  '#fb923c',
  '#facc15',
] as const

/** "#38bdf8" + 0.2 -> "rgba(56,189,248,0.2)". Falls back to cyan for malformed input. */
export function withAlpha(hex: string, alpha: number): string {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) h = '38e1ff'
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

export function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

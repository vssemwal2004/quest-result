import type { PublicStudent, PublicTier } from '@/types'

export type SlotKind = 'gold' | 'silver' | 'bronze' | 'fourth'

/** Podium geometry in world units. Blocks stand on the floor (y = 0) and face +z. */
export const BLOCK = { width: 2.3, depth: 2.1, radius: 0.09, spacing: 2.8 } as const
export const TROPHY_HEIGHT = 1.1

export interface MetalStyle {
  /** Block body color (metallic). */
  base: string
  /** Lighter tone for the embossed number. */
  light: string
  emissive: string
  /** Glowing edge strips / beam color. */
  glow: string
  /** CSS gradient for the DOM card's avatar ring and label. */
  ring: string
  /** Text color on top of `ring`. */
  ink: string
}

export const METAL: Record<SlotKind, MetalStyle> = {
  gold: {
    base: '#f3b63a',
    light: '#fff1b8',
    emissive: '#ff9d00',
    glow: '#ffd23f',
    ring: 'linear-gradient(160deg, #fff6c8 0%, #ffd23f 35%, #f59e0b 70%, #fff1a8 100%)',
    ink: '#3d2300',
  },
  silver: {
    base: '#e2e8f1',
    light: '#ffffff',
    emissive: '#7fb2ff',
    glow: '#d9f1ff',
    ring: 'linear-gradient(160deg, #ffffff 0%, #d7dee8 40%, #8f9db3 75%, #eef3fa 100%)',
    ink: '#0a1a45',
  },
  bronze: {
    base: '#c07338',
    light: '#ffd2a6',
    emissive: '#ff7a1a',
    glow: '#ffad66',
    ring: 'linear-gradient(160deg, #ffd9b0 0%, #e8954a 38%, #a85a1f 75%, #ffc58f 100%)',
    ink: '#2e1300',
  },
  fourth: {
    base: '#7888cf',
    light: '#e4eaff',
    emissive: '#746bff',
    glow: '#a7b5ff',
    ring: 'linear-gradient(160deg, #edf1ff 0%, #9eaaf2 40%, #6976bd 75%, #dce4ff 100%)',
    ink: '#141b4a',
  },
}

const THREE_LAYOUT: Record<SlotKind, { x: number; height: number }> = {
  gold: { x: 0, height: 1.7 },
  silver: { x: -BLOCK.spacing, height: 1.2 },
  bronze: { x: BLOCK.spacing, height: 0.85 },
  fourth: { x: BLOCK.spacing * 2, height: 0.58 },
}

const FOUR_LAYOUT: Record<SlotKind, { x: number; height: number }> = {
  gold: { x: -BLOCK.spacing / 2, height: 1.7 },
  silver: { x: BLOCK.spacing / 2, height: 1.2 },
  bronze: { x: -BLOCK.spacing * 1.5, height: 0.85 },
  fourth: { x: BLOCK.spacing * 1.5, height: 0.58 },
}

const KINDS: SlotKind[] = ['gold', 'silver', 'bronze', 'fourth']

export interface PodiumSlot {
  kind: SlotKind
  rank: number
  x: number
  height: number
  /** Only set once revealed — unrevealed students never reach the renderer (no spoilers on screen). */
  student: PublicStudent | null
  /** Index in the reveal order (0 = first revealed), -1 while unrevealed. */
  order: number
  /** Remains true on later steps even when this rank's winner card is out of focus. */
  revealed: boolean
  suspense: boolean
}

/**
 * Each rank gets an anonymous suspense step followed by a reveal step.
 * The final step shows every winner together.
 */
export function buildSlots(tier: PublicTier, students: PublicStudent[], step: number, revealRanks: number[] = students.map((s) => s.rank)): PodiumSlot[] {
  const span = Math.min(4, tier.rankTo - tier.rankFrom + 1)
  const groupStep = revealRanks.length > 1 && step > revealRanks.length * 2
  const activeIndex = step > 0 && !groupStep ? Math.floor((step - 1) / 2) : -1
  const activeRank = revealRanks[activeIndex]
  const suspense = step > 0 && step % 2 === 1 && !groupStep
  const visibleStudents = groupStep ? students : suspense ? [] : students.filter((s) => s.rank === activeRank)
  const layout = span === 4 ? FOUR_LAYOUT : THREE_LAYOUT
  return KINDS.slice(0, Math.max(1, span)).map((kind, offset) => {
    const rank = tier.rankFrom + offset
    const student = visibleStudents.find((s) => s.rank === rank) ?? null
    const order = revealRanks.indexOf(rank)
    const revealed = order >= 0 && (groupStep || step >= (order + 1) * 2)
    return { kind, rank, ...layout[kind], student, order, revealed, suspense: suspense && rank === activeRank }
  })
}

/** Rank labels for the overall Top 4. */
export function medalLabel(tier: PublicTier, slot: PodiumSlot): string {
  if (tier.rankFrom !== 1) return `Rank #${slot.rank}`
  return slot.kind === 'gold' ? 'Champion' : slot.kind === 'silver' ? '1st Runner-up' : slot.kind === 'bronze' ? '2nd Runner-up' : '4th Place'
}

/** Height of the DOM card's anchor above the block top (the champion card floats above the trophy). */
export function cardLift(kind: SlotKind): number {
  return kind === 'gold' ? TROPHY_HEIGHT + 0.25 : 0.25
}

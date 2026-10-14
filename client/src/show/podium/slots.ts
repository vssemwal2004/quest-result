import type { PublicStudent, PublicTier } from '@/types'

export type SlotKind = 'gold' | 'silver' | 'bronze'

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
}

const LAYOUT: Record<SlotKind, { x: number; height: number }> = {
  gold: { x: 0, height: 1.7 },
  silver: { x: -BLOCK.spacing, height: 1.2 },
  bronze: { x: BLOCK.spacing, height: 0.85 },
}

const KINDS: SlotKind[] = ['gold', 'silver', 'bronze']

export interface PodiumSlot {
  kind: SlotKind
  rank: number
  x: number
  height: number
  /** Only set once revealed — unrevealed students never reach the renderer (no spoilers on screen). */
  student: PublicStudent | null
  /** Index in the reveal order (0 = first revealed), -1 while unrevealed. */
  order: number
}

/**
 * One slot per rank in the tier (at most three): rankFrom → gold center, +1 → silver left, +2 → bronze right.
 * `stage.students` is in reveal order (rank DESC). Individual steps show one winner;
 * the last step shows everyone together.
 */
export function buildSlots(tier: PublicTier, students: PublicStudent[], step: number): PodiumSlot[] {
  const groupStep = students.length > 1 && step > students.length
  const revealed = step <= 0 ? [] : groupStep ? students : students.slice(step - 1, step)
  const span = Math.min(3, tier.rankTo - tier.rankFrom + 1)
  return KINDS.slice(0, Math.max(1, span)).map((kind, offset) => {
    const rank = tier.rankFrom + offset
    const student = revealed.find((s) => s.rank === rank) ?? null
    const order = student ? students.findIndex((s) => s.rank === rank) : -1
    return { kind, rank, ...LAYOUT[kind], student, order }
  })
}

/** Medal label above the name: champion wording only makes sense for the overall top 3. */
export function medalLabel(tier: PublicTier, slot: PodiumSlot): string {
  if (tier.rankFrom !== 1) return `Rank #${slot.rank}`
  return slot.kind === 'gold' ? 'Champion' : slot.kind === 'silver' ? '1st Runner-up' : '2nd Runner-up'
}

/** Height of the DOM card's anchor above the block top (the champion card floats above the trophy). */
export function cardLift(kind: SlotKind): number {
  return kind === 'gold' ? TROPHY_HEIGHT + 0.25 : 0.25
}

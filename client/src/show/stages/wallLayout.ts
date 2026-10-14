import { CARD, CARD_GAP, type CardSize } from './StudentCard'
import { clamp } from './units'

/** Smallest card width in CSS px, so 1280-wide screens get ~3 columns and 1920 gets ~5. */
const MIN_CARD_PX: Record<CardSize, number> = { md: 300, sm: 240 }

export function columnCount(widthPx: number, unitPx: number, size: CardSize, max = 6): number {
  const gap = CARD_GAP * unitPx
  const minWidth = Math.max(MIN_CARD_PX[size], CARD[size].minWidth * unitPx)
  return clamp(Math.floor((widthPx + gap) / (minWidth + gap)), 1, max)
}

export function rowsThatFit(heightPx: number, unitPx: number, size: CardSize): number {
  const gap = CARD_GAP * unitPx
  return Math.max(1, Math.floor((heightPx + gap) / (CARD[size].height * unitPx + gap)))
}

/** Height in px of `rows` stacked cards including gaps. */
export function stackHeight(rows: number, unitPx: number, size: CardSize): number {
  return rows <= 0 ? 0 : rows * CARD[size].height * unitPx + (rows - 1) * CARD_GAP * unitPx
}

/** Split into `parts` contiguous, balanced chunks (first chunks get the extra item). */
export function chunk<T>(items: readonly T[], parts: number): T[][] {
  const n = Math.max(1, parts)
  const base = Math.floor(items.length / n)
  const extra = items.length % n
  const out: T[][] = []
  let i = 0
  for (let c = 0; c < n; c++) {
    const len = base + (c < extra ? 1 : 0)
    out.push(items.slice(i, i + len))
    i += len
  }
  return out
}

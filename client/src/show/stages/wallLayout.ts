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

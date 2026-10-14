import { MathUtils, type Vector3 } from 'three'
import { BLOCK, TROPHY_HEIGHT } from './slots'

export const CAMERA_FOV = 30
const PITCH = MathUtils.degToRad(6)

/** Preferred podium scale: 1 world unit = 8.5 stage units on screen. */
const PX_PER_WORLD_U = 8.5
/** Screen budget (stage units) kept free above the champion trophy for its card, and below the podium base (the block fronts project lower than the base center). */
const CARD_BUDGET_U = 18.5
const TOP_MARGIN_U = 1.2
const BOTTOM_MARGIN_U = 6
/** World height from the floor to the top of the trophy on the gold block. */
const PODIUM_COLUMN = 1.7 + TROPHY_HEIGHT
/** Half of the horizontal world extent that must stay visible (outer block edges + card overhang). */
const HALF_SPAN = BLOCK.spacing + BLOCK.width / 2 + 0.7

export interface Framing {
  distance: number
  targetY: number
  /** Resulting screen scale at the podium plane (CSS px per world unit). */
  pxPerUnit: number
}

/**
 * Camera distance and look-at height so that the podium scales with the stage unit (cards are sized
 * in stage units too), leaves room for the champion card above, and never crops horizontally on
 * narrow aspect ratios.
 */
export function computeFraming(width: number, height: number, unitPx: number): Framing {
  const tanHalf = Math.tan(MathUtils.degToRad(CAMERA_FOV / 2))
  const aspect = width / Math.max(1, height)
  const verticalBudget = (height - (CARD_BUDGET_U + TOP_MARGIN_U + BOTTOM_MARGIN_U) * unitPx) / PODIUM_COLUMN
  const preferredScale = Math.max(1, Math.min(PX_PER_WORLD_U * unitPx, verticalBudget))
  const distance = Math.max(height / (2 * tanHalf * preferredScale), HALF_SPAN / (tanHalf * aspect))

  // Pick the look-at height that puts the podium base BOTTOM_MARGIN_U above the bottom edge.
  const ndcBase = -1 + (2 * BOTTOM_MARGIN_U * unitPx) / Math.max(1, height)
  const angleToBase = Math.atan(ndcBase * tanHalf) - PITCH
  const targetY = -distance * (Math.cos(PITCH) * Math.tan(angleToBase) + Math.sin(PITCH))
  return { distance, targetY, pxPerUnit: height / (2 * tanHalf * distance) }
}

/** Camera position for a framing, panned sideways by `panX` and pushed in by `dolly` (< 1 = closer). */
export function cameraPosition(f: Framing, panX: number, dolly: number, out: Vector3): Vector3 {
  const d = f.distance * dolly
  return out.set(panX, f.targetY + d * Math.sin(PITCH), d * Math.cos(PITCH))
}

import type { Color } from 'three'
import type { Quality } from '@/types'

/** What the shared background is currently framing. Drives robot placement and activity level. */
export type SceneMode = 'boot' | 'intro' | 'tier' | 'podium' | 'finale'

/**
 * Mutable values shared by every scene component. They are plain objects on purpose: shader
 * uniforms reference them directly (`{ uTime: signals.time }`), so one driver updates all materials
 * without React re-renders.
 */
export interface SceneSignals {
  time: { value: number }
  /** Current accent, eased toward the tier colour. */
  accent: { value: Color }
  /** 0 → 1 while the intro countdown warps the camera. */
  warp: { value: number }
  /** Pointer in normalized device coordinates (-1..1), smoothed. */
  pointer: { x: number; y: number }
}

export interface QualityLevel {
  dpr: number
  bloom: boolean
  environment: boolean
  particles: number
  traceLayers: number
  /** Physical (clearcoat) robot materials vs. cheaper standard ones. */
  physical: boolean
}

/**
 * Runtime quality ladder, best first. settings.quality picks the CEILING (starting rung); the
 * PerformanceMonitor steps down when frames drop — dpr first, then bloom, then environment and
 * particle count — and back up (with hysteresis) when there is headroom.
 */
export const LEVELS: readonly QualityLevel[] = [
  { dpr: 1.5, bloom: true, environment: true, particles: 700, traceLayers: 3, physical: true },
  { dpr: 1.25, bloom: true, environment: true, particles: 700, traceLayers: 3, physical: true },
  { dpr: 1.25, bloom: false, environment: true, particles: 400, traceLayers: 3, physical: true },
  { dpr: 1, bloom: false, environment: true, particles: 400, traceLayers: 3, physical: true },
  { dpr: 1, bloom: false, environment: false, particles: 150, traceLayers: 2, physical: false },
]

export const CEILING: Record<Quality, number> = { high: 0, medium: 2, low: 4 }

/** Fixed per-scene detail that does not change at runtime (keeps geometry stable). */
export const TRACES_PER_LAYER = 56
export const STREAKS = 4
export const CHIPS = 5
export const HEXES = 7

/** Camera rest pose; the robot and layers are laid out against this frustum. */
export const CAMERA = { z: 10, fov: 50, lookAtZ: -6 } as const

/** Visible height (world units) at a given distance from the camera with the rest fov. */
export function visibleHeight(distance: number): number {
  return 2 * distance * Math.tan(((CAMERA.fov / 2) * Math.PI) / 180)
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt)
}

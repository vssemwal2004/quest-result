import { useCallback, useEffect, useState, type CSSProperties } from 'react'

/**
 * Stage scale unit. 1u = 1% of the largest 16:9 frame that fits the viewport
 * (19.2px at 1920×1080, 12.8px at 1280×720, 38.4px at 3840×2160), so every stage
 * keeps the same proportions on any projector. CSS reads it from `--u`.
 */
export const U_CSS = 'min(1vw, 1.7778vh)'

/** `n` stage units as a CSS length. */
export const u = (n: number): string => `calc(var(--u) * ${n})`

function readUnit(): number {
  return Math.min(window.innerWidth / 100, (window.innerHeight * 16) / 9 / 100)
}

/** Current value of 1u in CSS pixels (tracks window resizes). */
export function useStageUnit(): number {
  const [unit, setUnit] = useState(readUnit)
  useEffect(() => {
    const onResize = () => setUnit(readUnit())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return unit
}

export interface Size {
  width: number
  height: number
}

/** Callback-ref based element measuring (content box, via ResizeObserver). */
export function useMeasure<T extends HTMLElement>(): [(el: T | null) => void, Size] {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  const ref = useCallback((node: T | null) => setEl(node), [])
  return [ref, size]
}

/** "#38bdf8" → "56 189 248" (space separated, for `rgb(r g b / a)`). Falls back to cyan-glow. */
export function hexToRgbTriplet(hex: string): string {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim())
  if (!m) return '56 225 255'
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const n = parseInt(h, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** The tier accent color at the given alpha (reads `--accent-rgb` set by StageFrame). */
export const accent = (alpha = 1): string => `rgb(var(--accent-rgb) / ${alpha})`

/** Typed helper for inline CSS custom properties. */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

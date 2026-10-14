import { useMemo, useSyncExternalStore } from 'react'
import type { Quality } from '@/types'

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  )
}

let webglCache: boolean | null = null

/** Probes once whether a WebGL context can be created (blocklisted GPUs, disabled acceleration…). */
export function isWebGLAvailable(): boolean {
  if (webglCache !== null) return webglCache
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    webglCache = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglCache = false
  }
  return webglCache
}

export interface EffectiveQuality {
  quality: Quality
  reducedMotion: boolean
  webgl: boolean
}

/** settings.quality, downgraded to 'low' for prefers-reduced-motion or when WebGL is unavailable. */
export function useEffectiveQuality(setting: Quality | undefined): EffectiveQuality {
  const reducedMotion = usePrefersReducedMotion()
  const webgl = useMemo(isWebGLAvailable, [])
  const quality: Quality = reducedMotion || !webgl ? 'low' : (setting ?? 'medium')
  return { quality, reducedMotion, webgl }
}

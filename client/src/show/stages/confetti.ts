import { useCallback, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

export const GOLD_CONFETTI = ['#fff1a8', '#ffe066', '#ffd23f', '#fbbf24', '#f59e0b', '#ffffff']
export const QUEST_CONFETTI = ['#ffd23f', '#fbbf24', '#38e1ff', '#00c2ff', '#ffffff', '#4d7dff']

/** Hard cap per burst so no call site can flood the main thread on a weak laptop. */
const MAX_PARTICLES = 120

/**
 * canvas-confetti bound to our own <canvas> (not a global full-page canvas) so it layers correctly
 * inside the stage and is fully reset on unmount. No worker: StrictMode remounts would fail to
 * transfer the same canvas twice.
 */
export function useConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const instance = useRef<confetti.CreateTypes | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const inst = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true })
    instance.current = inst
    return () => {
      inst.reset()
      instance.current = null
    }
  }, [])

  const fire = useCallback((options: confetti.Options) => {
    if (document.hidden) return
    void instance.current?.({ ...options, particleCount: Math.min(options.particleCount ?? 50, MAX_PARTICLES) })
  }, [])

  return { canvasRef, fire }
}

import { useEffect, useMemo, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, type PerspectiveCamera } from 'three'
import { CAMERA, damp, type SceneSignals } from './types'

/**
 * Advances every shared signal once per frame: time (slowed for reduced motion), accent colour
 * easing toward the tier colour, the countdown warp amount and the smoothed pointer.
 */
export function SignalDriver({
  signals,
  accent,
  warp,
  pointer,
  timeScale,
}: {
  signals: SceneSignals
  accent: string
  warp: boolean
  pointer: MutableRefObject<{ x: number; y: number }>
  timeScale: number
}) {
  const target = useMemo(() => new Color(), [])
  useEffect(() => {
    target.set(accent)
  }, [accent, target])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    signals.time.value += dt * timeScale
    signals.accent.value.lerp(target, damp(1.8, dt))
    // Build up slowly during the 3-2-1, release quickly afterwards.
    const w = warp ? 1 : 0
    signals.warp.value += (w - signals.warp.value) * damp(warp ? 0.9 : 2.2, dt)
    signals.pointer.x += (pointer.current.x - signals.pointer.x) * damp(2.5, dt)
    signals.pointer.y += (pointer.current.y - signals.pointer.y) * damp(2.5, dt)
  })
  return null
}

/** Slow cinematic drift + pointer parallax; dollies forward and widens the lens during the warp. */
export function CameraRig({ signals, drift }: { signals: SceneSignals; drift: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = signals.time.value
    const w = signals.warp.value
    const amp = drift ? 1 : 0
    const tx = (Math.sin(t * 0.07) * 0.35 + signals.pointer.x * 0.45) * amp
    const ty = (Math.cos(t * 0.05) * 0.22 + signals.pointer.y * 0.28) * amp
    const tz = CAMERA.z - w * 5.5
    const k = damp(2, dt)
    camera.position.x += (tx - camera.position.x) * k
    camera.position.y += (ty - camera.position.y) * k
    camera.position.z += (tz - camera.position.z) * k
    const fov = CAMERA.fov + w * 22
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(0, 0, CAMERA.lookAtZ)
  })
  return null
}

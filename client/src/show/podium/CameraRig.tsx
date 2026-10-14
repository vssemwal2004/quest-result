import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3 } from 'three'
import { frameDelta } from './frame'
import { cameraPosition, computeFraming } from './framing'

/** How long the camera lingers on a freshly revealed block before easing back to the full view. */
const FOCUS_MS = 2600
const PAN_FACTOR = 0.33
const DOLLY_IN = 0.9

export interface CameraFocus {
  x: number
  /** Changes on every new reveal so repeated reveals of the same slot retrigger the move. */
  id: number
}

/** Frames the podium for the current canvas size and performs the reveal push-in. */
export function CameraRig({ unitPx, focus, reducedMotion }: { unitPx: number; focus: CameraFocus | null; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const framing = useMemo(() => computeFraming(width, height, unitPx), [width, height, unitPx])

  const focusUntil = useRef(0)
  const focusX = useRef(0)
  const current = useRef<{ pan: number; dolly: number } | null>(null)
  const position = useMemo(() => new Vector3(), [])

  useEffect(() => {
    if (!focus) {
      focusUntil.current = 0
      return
    }
    if (reducedMotion) return
    focusX.current = focus.x
    focusUntil.current = performance.now() + FOCUS_MS
  }, [focus, reducedMotion])

  useFrame((_, delta) => {
    const dt = frameDelta(delta)
    const active = performance.now() < focusUntil.current
    const pan = active ? focusX.current * PAN_FACTOR : 0
    const dolly = active ? DOLLY_IN : 1
    if (!current.current) {
      current.current = { pan, dolly } // first frame: snap, never fly in from the default camera
    } else {
      current.current.pan = MathUtils.damp(current.current.pan, pan, 1.6, dt)
      current.current.dolly = MathUtils.damp(current.current.dolly, dolly, 1.6, dt)
    }
    cameraPosition(framing, current.current.pan, current.current.dolly, position)
    camera.position.copy(position)
    camera.lookAt(current.current.pan, framing.targetY, 0)
  })

  return null
}

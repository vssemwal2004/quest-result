import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  CircleGeometry,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  type BufferGeometry,
  type InstancedMesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createChipTexture } from './textures'
import { CAMERA, CHIPS, HEXES, visibleHeight, type SceneSignals } from './types'

interface Holo {
  /** Position as a fraction of the visible frame at that depth (keeps edges busy, centre clear). */
  fx: number
  fy: number
  z: number
  size: number
  phase: number
}

const CHIP_SLOTS: Holo[] = [
  { fx: 0.43, fy: -0.2, z: -6, size: 1.5, phase: 0 },
  { fx: -0.42, fy: 0.27, z: -8, size: 1.7, phase: 1.7 },
  { fx: -0.33, fy: -0.34, z: -11, size: 1.9, phase: 3.1 },
  { fx: 0.36, fy: 0.36, z: -13, size: 2.1, phase: 4.4 },
  { fx: -0.47, fy: -0.04, z: -16, size: 2.4, phase: 5.2 },
]

const HEX_SLOTS: Holo[] = [
  { fx: 0.28, fy: 0.42, z: -9, size: 1.1, phase: 0.4 },
  { fx: -0.22, fy: 0.43, z: -14, size: 1.5, phase: 2.2 },
  { fx: 0.46, fy: 0.06, z: -12, size: 1.3, phase: 1.1 },
  { fx: -0.45, fy: 0.15, z: -7, size: 0.9, phase: 3.6 },
  { fx: 0.12, fy: -0.43, z: -10, size: 1.2, phase: 4.8 },
  { fx: -0.14, fy: -0.4, z: -17, size: 1.8, phase: 5.9 },
  { fx: 0.31, fy: -0.42, z: -6, size: 0.8, phase: 2.9 },
]

const CYAN = new Color('#7fe9ff')

/** Outline + faint fill + bright core, merged with per-vertex intensity so all hexes are one draw. */
function buildHexGeometry(): BufferGeometry {
  const withIntensity = (g: BufferGeometry, v: number) => {
    const n = g.getAttribute('position').count
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(v), 3))
    return g
  }
  const parts = [
    withIntensity(new RingGeometry(0.46, 0.5, 6, 1), 1),
    withIntensity(new CircleGeometry(0.46, 6), 0.12),
    withIntensity(new CircleGeometry(0.09, 6), 1),
  ]
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  if (!merged) throw new Error('hex geometry merge failed')
  return merged
}

/** Floating holographic "AI" chips and hexagon nodes around the edges of the frame (2 instanced draws). */
export function HoloChips({ signals }: { signals: SceneSignals }) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const chipMesh = useRef<InstancedMesh>(null)
  const hexMesh = useRef<InstancedMesh>(null)

  const res = useMemo(() => {
    const texture = createChipTexture()
    const flat = { transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false } as const
    return {
      texture,
      chipGeometry: new PlaneGeometry(1, 1),
      hexGeometry: buildHexGeometry(),
      chip: new MeshBasicMaterial({ ...flat, map: texture, opacity: 0.5, side: DoubleSide }),
      hex: new MeshBasicMaterial({ ...flat, vertexColors: true, opacity: 0.55, side: DoubleSide }),
    }
  }, [])

  useEffect(
    () => () => {
      res.texture.dispose()
      res.chipGeometry.dispose()
      res.hexGeometry.dispose()
      res.chip.dispose()
      res.hex.dispose()
    },
    [res],
  )

  // Base positions depend only on the aspect ratio.
  const layout = useMemo(() => {
    const place = (h: Holo) => {
      const vh = visibleHeight(CAMERA.z - h.z)
      return { x: h.fx * vh * aspect, y: h.fy * vh, z: h.z }
    }
    return { chips: CHIP_SLOTS.slice(0, CHIPS).map(place), hexes: HEX_SLOTS.slice(0, HEXES).map(place) }
  }, [aspect])

  const dummy = useMemo(() => new Object3D(), [])

  useFrame(() => {
    const t = signals.time.value
    res.chip.color.copy(CYAN).lerp(signals.accent.value, 0.3)
    res.hex.color.copy(res.chip.color)

    const chips = chipMesh.current
    if (chips) {
      layout.chips.forEach((p, i) => {
        const s = CHIP_SLOTS[i]
        dummy.position.set(p.x, p.y + Math.sin(t * 0.5 + s.phase) * 0.18, p.z)
        dummy.rotation.set(Math.sin(t * 0.27 + s.phase * 1.3) * 0.2, Math.sin(t * 0.35 + s.phase) * 0.45, 0)
        dummy.scale.setScalar(s.size)
        dummy.updateMatrix()
        chips.setMatrixAt(i, dummy.matrix)
      })
      chips.instanceMatrix.needsUpdate = true
    }

    const hexes = hexMesh.current
    if (hexes) {
      layout.hexes.forEach((p, i) => {
        const s = HEX_SLOTS[i]
        dummy.position.set(p.x, p.y, p.z)
        dummy.rotation.set(0, Math.sin(t * 0.3 + s.phase) * 0.5, t * 0.08 * (i % 2 ? 1 : -1) + s.phase)
        dummy.scale.setScalar(s.size)
        dummy.updateMatrix()
        hexes.setMatrixAt(i, dummy.matrix)
      })
      hexes.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={chipMesh} args={[res.chipGeometry, res.chip, CHIPS]} frustumCulled={false} />
      <instancedMesh ref={hexMesh} args={[res.hexGeometry, res.hex, HEXES]} frustumCulled={false} />
    </>
  )
}

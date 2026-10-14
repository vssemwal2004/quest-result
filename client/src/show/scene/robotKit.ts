import {
  AdditiveBlending,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  LatheGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  SplineCurve,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Quality } from '@/types'

/*
 * Model-space layout of the mascot (units ≈ metres of a toy, origin = torso centre).
 * Everything the component positions is derived from these numbers.
 */
export const DIM = {
  head: { w: 1.5, h: 1.12, d: 1.18, r: 0.42 },
  headY: 1.04,
  neckY: 0.46,
  shoulder: { x: 0.52, y: 0.14 },
  upperArm: 0.34,
  forearm: 0.33,
  thrusterY: -0.62,
  /** Bottom of the hover ring to the antenna tip. */
  height: 2.56,
  /** Visual centre relative to the torso centre. */
  centerY: 0.63,
} as const

const EYE = new Color('#38e1ff')

/** Bell-shaped torso profile (radius, height), smoothed through a spline. */
const TORSO_PROFILE = [
  [0, 0.4],
  [0.24, 0.39],
  [0.4, 0.3],
  [0.49, 0.12],
  [0.5, -0.05],
  [0.46, -0.24],
  [0.36, -0.4],
  [0.2, -0.49],
  [0, -0.52],
].map(([x, y]) => new Vector2(x, y))

export function createRobotKit(quality: Quality) {
  const fine = quality !== 'low'
  const seg = fine ? 48 : 24
  const torsoPoints = new SplineCurve(TORSO_PROFILE).getPoints(fine ? 48 : 24)
  const radiusAt = (y: number) => torsoPoints.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a)).x

  const geo = {
    head: new RoundedBoxGeometry(DIM.head.w, DIM.head.h, DIM.head.d, fine ? 8 : 4, DIM.head.r),
    bezel: new RoundedBoxGeometry(1.24, 0.84, 0.3, fine ? 6 : 3, 0.14),
    screen: new RoundedBoxGeometry(1.16, 0.76, 0.3, fine ? 6 : 3, 0.14),
    eye: new CapsuleGeometry(0.085, 0.09, 8, 20),
    mouth: new TorusGeometry(0.075, 0.017, 10, 28, Math.PI),
    earPod: new CylinderGeometry(0.26, 0.26, 0.2, seg),
    earCap: new CylinderGeometry(0.19, 0.21, 0.06, seg),
    earRing: new TorusGeometry(0.205, 0.022, 10, seg),
    earSeam: new TorusGeometry(0.262, 0.01, 6, seg),
    antenna: new CylinderGeometry(0.022, 0.03, 0.24, 16),
    sphere: new SphereGeometry(1, seg, Math.round(seg * 0.75)),
    neck: new CylinderGeometry(0.2, 0.24, 0.14, seg),
    torso: new LatheGeometry(torsoPoints, seg),
    waistSeam: new TorusGeometry(radiusAt(-0.18) + 0.003, 0.012, 6, 64),
    chestPanel: new RoundedBoxGeometry(0.36, 0.22, 0.08, 4, 0.035),
    chestRing: new TorusGeometry(0.05, 0.013, 8, 32),
    upperArm: new CapsuleGeometry(0.095, 0.2, 8, 20),
    forearm: new CapsuleGeometry(0.09, 0.16, 8, 20),
    thruster: new TorusGeometry(0.16, 0.02, 8, 40),
  } satisfies Record<string, BufferGeometry>

  // Shell is kept below pure white and only moderately glossy so it never clips into bloom.
  const shell = fine
    ? new MeshPhysicalMaterial({ color: '#e8eef8', roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.8 })
    : new MeshStandardMaterial({ color: '#e8eef8', roughness: 0.36, metalness: 0, envMapIntensity: 0.8 })
  const trim = new MeshStandardMaterial({ color: '#c5d0e4', roughness: 0.45, metalness: 0.1, envMapIntensity: 0.7 })
  const screen = fine
    ? new MeshPhysicalMaterial({ color: '#04060c', roughness: 0.1, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 })
    : new MeshStandardMaterial({ color: '#04060c', roughness: 0.15, metalness: 0.4 })
  const joint = new MeshStandardMaterial({ color: '#27324d', roughness: 0.35, metalness: 0.6, envMapIntensity: 0.9 })
  const seam = new MeshBasicMaterial({ color: '#7e8db0' })

  // Only these parts emit light. Over-range colour (no tone mapping) is what the bloom threshold picks up.
  const boost = quality === 'high' ? 2 : 1
  const glow = new MeshBasicMaterial({ color: EYE.clone().multiplyScalar(boost), toneMapped: false })
  const sparkle = new MeshBasicMaterial({ color: new Color('#eafcff').multiplyScalar(quality === 'high' ? 1.1 : 1), toneMapped: false })
  const thruster = new MeshBasicMaterial({
    color: EYE.clone().multiplyScalar(boost * 0.8),
    transparent: true,
    opacity: 0.45,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })

  const mat = { shell, trim, screen, joint, seam, glow, sparkle, thruster } satisfies Record<string, Material>

  return {
    geo,
    mat,
    dispose() {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(mat).forEach((m) => m.dispose())
    },
  }
}

export type RobotKit = ReturnType<typeof createRobotKit>

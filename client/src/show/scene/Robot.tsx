import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import type { Quality } from '@/types'
import { createRobotKit, DIM, type RobotKit } from './robotKit'
import { CAMERA, damp, visibleHeight, type SceneMode, type SceneSignals } from './types'

interface Pose {
  x: number
  y: number
  scale: number
  yaw: number
}

/** Where the robot stands for each mode, derived from the visible frame at its depth (z = 0). */
function poseFor(mode: SceneMode, aspect: number): Pose | null {
  const vh = visibleHeight(CAMERA.z)
  const vw = vh * aspect
  switch (mode) {
    case 'intro': {
      // Right third, below the handwritten lines, ~47% of the frame height, turned toward the CTA.
      const scale = (0.47 * vh) / DIM.height
      return { x: vw * 0.33, y: -vh * 0.11, scale, yaw: -0.32 }
    }
    case 'tier': {
      // Small, in the bottom-right corner just above the HUD rail.
      const scale = (0.18 * vh) / DIM.height
      return { x: vw / 2 - 1.8 * scale, y: -vh / 2 + vh * 0.085 + (DIM.height * scale) / 2, scale, yaw: -0.45 }
    }
    case 'finale': {
      const scale = (0.36 * vh) / DIM.height
      return { x: vw * 0.36, y: -vh * 0.16, scale, yaw: -0.25 }
    }
    default:
      return null
  }
}

interface ArmTarget {
  sx: number
  sy: number
  sz: number
  ex: number
  ez: number
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mixArm = (a: ArmTarget, b: ArmTarget, k: number): ArmTarget => ({
  sx: mix(a.sx, b.sx, k),
  sy: mix(a.sy, b.sy, k),
  sz: mix(a.sz, b.sz, k),
  ex: mix(a.ex, b.ex, k),
  ez: mix(a.ez, b.ez, k),
})

// side: -1 = viewer-left arm, +1 = viewer-right arm.
const relaxed = (side: number, t: number): ArmTarget => ({
  sx: 0.05,
  sy: 0,
  sz: side * (0.17 + Math.sin(t * 1.3 + side) * 0.025),
  ex: -0.35,
  ez: side * 0.08,
})
const pointing = (t: number): ArmTarget => ({ sx: 0, sy: 0.45, sz: -1.62 + Math.sin(t * 2.1) * 0.04, ex: 0, ez: -0.12 })
// Raised in front of the ear pod (sy brings it toward the camera), forearm swinging from the elbow.
const waving = (t: number): ArmTarget => ({ sx: 0, sy: -0.5, sz: 2.2 + Math.sin(t * 4.5) * 0.06, ex: 0, ez: 0.45 + Math.sin(t * 9) * 0.45 })
// Arms open in a V, clear of the wide helmet, pumping with the bounce.
const cheering = (side: number, t: number): ArmTarget => ({
  sx: 0,
  sy: -side * 0.2,
  sz: side * (2.15 + Math.sin(t * 6) * 0.14),
  ex: 0,
  ez: side * (0.08 + Math.sin(t * 6 + 1) * 0.1),
})

/** Wave windows: intro waves ~2.4 s every 7 s, tier every 6 s. */
function waveTarget(mode: SceneMode, t: number): number {
  if (mode === 'intro') return t % 7 > 4.6 ? 1 : 0
  if (mode === 'tier') return t % 6 > 3.4 ? 1 : 0
  return 0
}

/** 0 → 1 → 0 over [0, 1]; 0 elsewhere. */
const bump = (x: number) => (x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0)

function useRobotKit(quality: Quality): RobotKit {
  const kit = useMemo(() => createRobotKit(quality), [quality])
  useEffect(() => () => kit.dispose(), [kit])
  return kit
}

interface ArmRefs {
  shoulder: RefObject<Group>
  elbow: RefObject<Group>
}

function Arm({ side, kit, refs }: { side: -1 | 1; kit: RobotKit; refs: ArmRefs }) {
  const { geo, mat } = kit
  return (
    <group ref={refs.shoulder} position={[side * DIM.shoulder.x, DIM.shoulder.y, 0]}>
      <mesh geometry={geo.sphere} material={mat.shell} scale={0.15} />
      <mesh geometry={geo.upperArm} material={mat.shell} position={[0, -0.17, 0]} />
      <group ref={refs.elbow} position={[0, -DIM.upperArm, 0]}>
        <mesh geometry={geo.sphere} material={mat.joint} scale={0.085} />
        <mesh geometry={geo.forearm} material={mat.shell} position={[0, -0.15, 0]} />
        {/* Mitten hand with a thumb */}
        <mesh geometry={geo.sphere} material={mat.shell} position={[0, -DIM.forearm - 0.03, 0]} scale={[0.13, 0.15, 0.12]} />
        <mesh geometry={geo.sphere} material={mat.shell} position={[-side * 0.1, -0.3, 0.05]} scale={[0.05, 0.075, 0.05]} />
      </group>
    </group>
  )
}

/**
 * Procedural version of the poster mascot: bevelled white helmet with a glossy black face screen,
 * blinking cyan eyes, headphone-style ear pods, antenna, bell torso with chest light, and articulated
 * arms (shoulder → elbow → mitten). Only the eyes, rings, antenna tip and chest light emit light.
 * All motion is damped toward analytic targets, so pose changes are always smooth.
 */
export function Robot({
  mode,
  enabled,
  quality,
  signals,
}: {
  mode: SceneMode
  enabled: boolean
  quality: Quality
  signals: SceneSignals
}) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const kit = useRobotKit(quality)
  const { geo, mat } = kit

  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const eyeL = useRef<Mesh>(null)
  const eyeR = useRef<Mesh>(null)
  const antennaTip = useRef<Mesh>(null)
  const chestLight = useRef<Mesh>(null)
  const thruster = useRef<Mesh>(null)
  const armL: ArmRefs = { shoulder: useRef<Group>(null), elbow: useRef<Group>(null) }
  const armR: ArmRefs = { shoulder: useRef<Group>(null), elbow: useRef<Group>(null) }
  const anim = useRef({ wave: 0, point: 0, cheer: 0, blinkAt: 2.5, blinkStart: -1, double: false })
  const lastPose = useRef<Pose | null>(null)

  useFrame((_, rawDt) => {
    const g = root.current
    if (!g || !body.current || !head.current) return
    const dt = Math.min(rawDt, 0.05)
    const t = signals.time.value
    const a = anim.current

    const target = enabled ? poseFor(mode, aspect) : null
    if (target) lastPose.current = target
    const pose = target ?? lastPose.current
    if (!pose) {
      g.visible = false
      return
    }

    // Appear in place (grow) rather than flying in from the origin.
    if (!g.visible && target) {
      g.position.set(pose.x, pose.y, 0)
      g.rotation.y = pose.yaw
    }
    const k = damp(2.6, dt)
    g.position.x += (pose.x - g.position.x) * k
    g.position.y += (pose.y - g.position.y) * k
    g.rotation.y += (pose.yaw - g.rotation.y) * k
    const s = g.scale.x + ((target ? pose.scale : 0) - g.scale.x) * damp(target ? 3 : 5, dt)
    g.scale.setScalar(s)
    g.visible = s > 0.002
    if (!g.visible) return

    // Gesture weights ease in and out so poses blend instead of snapping.
    const kw = damp(4, dt)
    a.wave += (waveTarget(mode, t) - a.wave) * kw
    a.point += ((mode === 'intro' ? 1 : 0) - a.point) * kw
    a.cheer += ((mode === 'finale' ? 1 : 0) - a.cheer) * kw

    // Idle hover + body language.
    body.current.position.y = Math.sin(t * 1.5) * 0.06 + Math.abs(Math.sin(t * 3)) * 0.1 * a.cheer
    body.current.rotation.z = Math.sin(t * 0.8) * 0.03
    body.current.rotation.x = Math.sin(t * 1.1) * 0.02

    const left = mixArm(mixArm(relaxed(-1, t), pointing(t), a.point), cheering(-1, t), a.cheer)
    const right = mixArm(mixArm(relaxed(1, t), waving(t), a.wave), cheering(1, t), a.cheer)
    const ka = damp(10, dt)
    for (const [refs, tgt] of [
      [armL, left],
      [armR, right],
    ] as const) {
      const sh = refs.shoulder.current
      const el = refs.elbow.current
      if (!sh || !el) continue
      sh.rotation.x += (tgt.sx - sh.rotation.x) * ka
      sh.rotation.y += (tgt.sy - sh.rotation.y) * ka
      sh.rotation.z += (tgt.sz - sh.rotation.z) * ka
      el.rotation.x += (tgt.ex - el.rotation.x) * ka
      el.rotation.z += (tgt.ez - el.rotation.z) * ka
    }

    // Head: looks toward the pointer, tilts into the wave.
    const kh = damp(3, dt)
    const yaw = signals.pointer.x * 0.35 + (mode === 'intro' ? 0.22 : 0.15)
    const pitch = -signals.pointer.y * 0.15 + 0.04
    const roll = Math.sin(t * 0.7) * 0.04 - a.wave * 0.08
    head.current.rotation.y += (yaw - head.current.rotation.y) * kh
    head.current.rotation.x += (pitch - head.current.rotation.x) * kh
    head.current.rotation.z += (roll - head.current.rotation.z) * kh

    // Blink every few seconds, sometimes twice.
    if (t >= a.blinkAt && a.blinkStart < 0) {
      a.blinkStart = t
      a.double = Math.random() < 0.25
    }
    let open = 1
    if (a.blinkStart >= 0) {
      const p = (t - a.blinkStart) / 0.14
      open = 1 - 0.92 * Math.max(bump(p), a.double ? bump(p - 1.35) : 0)
      if (p > (a.double ? 2.4 : 1)) {
        a.blinkStart = -1
        a.blinkAt = t + 2.6 + Math.random() * 3
      }
    }
    eyeL.current?.scale.set(1, open, 0.3)
    eyeR.current?.scale.set(1, open, 0.3)

    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4)
    antennaTip.current?.scale.setScalar(0.06 + pulse * 0.012)
    chestLight.current?.scale.setScalar(0.9 + pulse * 0.15)
    thruster.current?.scale.setScalar(0.92 + pulse * 0.12)
  })

  const { head: H } = DIM
  const headTop = H.h / 2
  return (
    <group ref={root} scale={0} visible={false}>
      <group ref={body}>
        <group position={[0, -DIM.centerY, 0]}>
          {/* Head pivots at the neck so tilts read naturally. */}
          <group ref={head} position={[0, DIM.neckY + 0.04, 0]}>
            <group position={[0, DIM.headY - DIM.neckY - 0.04, 0]}>
              <mesh geometry={geo.head} material={mat.shell} />
              <mesh geometry={geo.bezel} material={mat.trim} position={[0, -0.03, 0.5]} />
              <mesh geometry={geo.screen} material={mat.screen} position={[0, -0.03, 0.52]} />
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  ref={side < 0 ? eyeL : eyeR}
                  geometry={geo.eye}
                  material={mat.glow}
                  position={[side * 0.25, 0.01, 0.675]}
                  scale={[1, 1, 0.3]}
                >
                  <mesh geometry={geo.sphere} material={mat.sparkle} position={[-0.03, 0.08, 0.09]} scale={[0.024, 0.032, 0.03]} />
                </mesh>
              ))}
              <mesh geometry={geo.mouth} material={mat.glow} position={[0, -0.2, 0.675]} rotation={[0, 0, Math.PI]} scale={[1, 0.8, 0.4]} />

              {[-1, 1].map((side) => (
                // Rotated so the pod's local -y points away from the head on both sides.
                <group key={side} position={[side * 0.8, 0, 0]} rotation={[0, 0, (side * Math.PI) / 2]}>
                  <mesh geometry={geo.earPod} material={mat.shell} />
                  <mesh geometry={geo.earSeam} material={mat.seam} position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]} />
                  <mesh geometry={geo.earCap} material={mat.joint} position={[0, -0.11, 0]} />
                  <mesh geometry={geo.earRing} material={mat.glow} position={[0, -0.13, 0]} rotation={[Math.PI / 2, 0, 0]} />
                </group>
              ))}

              <mesh geometry={geo.sphere} material={mat.trim} position={[0, headTop - 0.02, 0]} scale={[0.09, 0.05, 0.09]} />
              <mesh geometry={geo.antenna} material={mat.joint} position={[0, headTop + 0.1, 0]} />
              <mesh ref={antennaTip} geometry={geo.sphere} material={mat.glow} position={[0, headTop + 0.24, 0]} scale={0.065} />
            </group>
          </group>

          <mesh geometry={geo.neck} material={mat.joint} position={[0, DIM.neckY - 0.02, 0]} />

          {/* Torso is slightly flattened front-to-back; its seam and chest panel share that space. */}
          <group scale={[1, 1, 0.85]}>
            <mesh geometry={geo.torso} material={mat.shell} />
            <mesh geometry={geo.waistSeam} material={mat.seam} position={[0, -0.18, 0]} rotation={[Math.PI / 2, 0, 0]} />
            <group position={[0, 0.07, 0.47]} rotation={[-0.08, 0, 0]}>
              <mesh geometry={geo.chestPanel} material={mat.screen} />
              <mesh ref={chestLight} geometry={geo.chestRing} material={mat.glow} position={[0, 0, 0.045]} />
              <mesh geometry={geo.sphere} material={mat.glow} position={[0, 0, 0.042]} scale={[0.018, 0.018, 0.008]} />
            </group>
          </group>

          <Arm side={-1} kit={kit} refs={armL} />
          <Arm side={1} kit={kit} refs={armR} />

          {/* Small hover light under the body. */}
          <mesh ref={thruster} geometry={geo.thruster} material={mat.thruster} position={[0, DIM.thrusterY, 0]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
      </group>
    </group>
  )
}

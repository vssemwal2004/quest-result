import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import { AdditiveBlending, MathUtils, MeshStandardMaterial, Vector2, type Group, type MeshBasicMaterial, type PointLight } from 'three'
import { frameDelta } from './frame'
import { TROPHY_HEIGHT } from './slots'
import { useRaysTexture } from './textures'

/** Cup + stem + foot silhouette (radius, height), revolved around Y. Closed at both ends on the axis. */
const PROFILE: [number, number][] = [
  [0, 0], [0.36, 0], [0.36, 0.05], [0.3, 0.09], [0.3, 0.15], [0.2, 0.19], [0.09, 0.25], [0.06, 0.37],
  [0.06, 0.5], [0.1, 0.55], [0.16, 0.58], [0.12, 0.62], [0.2, 0.68], [0.32, 0.8], [0.4, 0.95], [0.44, 1.1],
  [0.46, 1.22], [0.42, 1.22], [0.39, 1.1], [0.35, 0.98], [0, 0.9],
]
const PLINTH_HEIGHT = 0.16
const MODEL_HEIGHT = 1.22 + PLINTH_HEIGHT

/**
 * Procedural gold trophy that rises out of the champion block when #1 is revealed, turns once and sways,
 * and throws light rays + a warm point light. Starts at its target state (instant when mounted revealed).
 */
export function Trophy({ baseY, raised, reducedMotion }: { baseY: number; raised: boolean; reducedMotion: boolean }) {
  const root = useRef<Group>(null)
  const spinner = useRef<Group>(null)
  const raysGroup = useRef<Group>(null)
  const raysMat = useRef<MeshBasicMaterial>(null)
  const light = useRef<PointLight>(null)
  const level = useRef(raised ? 1 : 0)
  const raysTex = useRaysTexture()

  const points = useMemo(() => PROFILE.map(([r, y]) => new Vector2(r, y)), [])
  const gold = useMemo(
    () => new MeshStandardMaterial({ color: '#ffc93c', metalness: 1, roughness: 0.17, emissive: '#ff9d00', emissiveIntensity: 0.12, envMapIntensity: 1.6 }),
    [],
  )
  useEffect(() => () => gold.dispose(), [gold])

  useFrame((state, delta) => {
    const dt = frameDelta(delta)
    level.current = MathUtils.damp(level.current, raised ? 1 : 0, raised ? 2.2 : 4, dt)
    const t = level.current
    if (root.current) {
      root.current.visible = t > 0.002
      // Emerges from inside the (opaque) gold block.
      root.current.position.y = baseY - (1 - t) * (TROPHY_HEIGHT + 0.15)
    }
    // One decelerating full turn while rising, then a gentle sway: any frozen frame (frameloop "demand") faces front.
    if (spinner.current) {
      const sway = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.6) * 0.35
      spinner.current.rotation.y = (1 - t) * Math.PI * 2 + sway
    }
    if (raysGroup.current && !reducedMotion) raysGroup.current.rotation.z += dt * 0.07
    if (raysMat.current) raysMat.current.opacity = 0.42 * t * t
    if (light.current) light.current.intensity = 6 * t
  })

  const scale = TROPHY_HEIGHT / MODEL_HEIGHT

  return (
    <group ref={root} position={[0, baseY, 0]}>
      <group ref={spinner} scale={scale}>
        <mesh position={[0, PLINTH_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[0.4, 0.44, PLINTH_HEIGHT, 48]} />
          <meshStandardMaterial color="#0a1d5a" metalness={0.8} roughness={0.3} envMapIntensity={1.2} />
        </mesh>
        <mesh material={gold} position={[0, PLINTH_HEIGHT - 0.02, 0]}>
          <torusGeometry args={[0.415, 0.022, 12, 64]} />
        </mesh>
        <group position={[0, PLINTH_HEIGHT, 0]}>
          <mesh material={gold}>
            <latheGeometry args={[points, 72]} />
          </mesh>
          {/* handles: half tori bulging outwards */}
          <mesh material={gold} position={[0.35, 0.97, 0]} rotation-z={-Math.PI / 2}>
            <torusGeometry args={[0.19, 0.035, 14, 32, Math.PI]} />
          </mesh>
          <mesh material={gold} position={[-0.35, 0.97, 0]} rotation-z={Math.PI / 2}>
            <torusGeometry args={[0.19, 0.035, 14, 32, Math.PI]} />
          </mesh>
        </group>
      </group>

      <Billboard position={[0, TROPHY_HEIGHT * 0.6, -0.5]}>
        <group ref={raysGroup}>
          <mesh renderOrder={1}>
            <planeGeometry args={[6.5, 6.5]} />
            <meshBasicMaterial
              ref={raysMat}
              map={raysTex}
              color="#ffd23f"
              transparent
              opacity={0}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      </Billboard>
      <pointLight ref={light} position={[0, TROPHY_HEIGHT + 0.6, 1.2]} color="#ffd88a" intensity={0} distance={6} decay={1.5} />
    </group>
  )
}

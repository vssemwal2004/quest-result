import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { AdditiveBlending, type Mesh } from 'three'
import type { Quality } from '@/types'
import { useCircuitRingTexture, useFloorAlphaTexture, useGlowTexture } from './textures'

const FLOOR_RADIUS = 15
const FLOOR_COLOR = '#06164a'

/**
 * Glossy dark stage floor that fades out at its edge (alpha map) so it melts into the shared
 * background, with a slowly rotating glowing circuit ring under the podium.
 * high: real blurred reflections; medium/low: a cheap glossy standard material.
 */
export function StageFloor({ quality, reducedMotion }: { quality: Quality; reducedMotion: boolean }) {
  const ring = useRef<Mesh>(null)
  const alphaMap = useFloorAlphaTexture()
  const ringTex = useCircuitRingTexture()
  const glowTex = useGlowTexture()

  useFrame((_, dt) => {
    if (ring.current && !reducedMotion) ring.current.rotation.z += dt * 0.04
  })

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[FLOOR_RADIUS, 96]} />
        {quality === 'high' ? (
          <MeshReflectorMaterial
            mirror={0.55}
            blur={[256, 64]}
            resolution={512}
            mixBlur={0.6}
            mixStrength={2.4}
            mixContrast={1.1}
            depthScale={0.9}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.3}
            roughness={0.82}
            metalness={0.55}
            color={FLOOR_COLOR}
            alphaMap={alphaMap}
            transparent
          />
        ) : (
          <meshStandardMaterial color={FLOOR_COLOR} metalness={0.6} roughness={0.38} envMapIntensity={0.9} alphaMap={alphaMap} transparent />
        )}
      </mesh>

      {/* soft blue pool of light under the podium */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0.4]} renderOrder={1}>
        <planeGeometry args={[16, 9]} />
        <meshBasicMaterial map={glowTex} color="#1f5eff" transparent opacity={0.55} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>

      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.008, 0.3]} renderOrder={1}>
        <planeGeometry args={[12.5, 12.5]} />
        <meshBasicMaterial map={ringTex} color="#7feaff" transparent opacity={0.85} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  )
}

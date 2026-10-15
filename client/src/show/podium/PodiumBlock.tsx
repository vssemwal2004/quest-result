import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, Text } from '@react-three/drei'
import {
  AdditiveBlending,
  Color,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  type Group,
  type MeshStandardMaterial,
  type SpotLight,
} from 'three'
import orbitronUrl from '@fontsource/orbitron/files/orbitron-latin-900-normal.woff?url'
import { BeamCone } from './BeamCone'
import { frameDelta } from './frame'
import { BLOCK, METAL, type PodiumSlot } from './slots'
import { useGlowTexture } from './textures'

export const PODIUM_FONT = orbitronUrl
export const PODIUM_GLYPHS = '0123456789?'

const LIGHT_HEIGHT = 8.5
const SPOT_INTENSITY = 5.5

/**
 * One podium block: metallic rounded body, dark number plate with an embossed rank, glowing edge
 * strips, a floor glow pad, a spotlight + visible beam, and a floating "?" while unrevealed.
 * All "lit" visuals follow one damped level that starts at its target, so a block mounted in the
 * revealed state is instantly correct.
 */
export function PodiumBlock({ slot, reducedMotion }: { slot: PodiumSlot; reducedMotion: boolean }) {
  const metal = METAL[slot.kind]
  const h = slot.height
  const lit = slot.revealed || slot.suspense
  const level = useRef(lit ? 1 : 0)
  const markerLevel = useRef(lit ? 0 : 1)

  const body = useRef<MeshStandardMaterial>(null)
  const light = useRef<SpotLight>(null)
  const marker = useRef<Group>(null)
  const [target] = useState(() => new Object3D())
  const glowTex = useGlowTexture()

  const colors = useMemo(() => {
    const full = new Color(metal.base)
    return { full, dim: full.clone().multiplyScalar(0.42) }
  }, [metal.base])

  const strip = useMemo(
    () => new MeshBasicMaterial({ color: metal.glow, transparent: true, opacity: 0.25, toneMapped: false }),
    [metal.glow],
  )
  const pad = useMemo(
    () =>
      new MeshBasicMaterial({
        color: metal.glow,
        map: glowTex,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [metal.glow, glowTex],
  )
  useEffect(
    () => () => {
      strip.dispose()
      pad.dispose()
    },
    [strip, pad],
  )

  useFrame((state, delta) => {
    const dt = frameDelta(delta)
    level.current = MathUtils.damp(level.current, lit ? 1 : 0, lit ? 6 : 3, dt)
    markerLevel.current = MathUtils.damp(markerLevel.current, lit ? 0 : 1, 5, dt)
    const t = level.current
    if (body.current) {
      body.current.color.lerpColors(colors.dim, colors.full, t)
      body.current.emissiveIntensity = 0.04 + 0.2 * t
    }
    strip.opacity = 0.25 + 0.75 * t
    pad.opacity = 0.18 + 0.62 * t
    if (light.current) light.current.intensity = SPOT_INTENSITY * t
    if (marker.current) {
      const m = markerLevel.current
      marker.current.visible = !lit && m > 0.01
      marker.current.scale.setScalar(0.4 + 0.6 * m)
      const bob = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.6 + slot.x) * 0.07
      marker.current.position.y = h + 0.78 + bob
    }
  })

  const fontSize = Math.min(0.88, h * 0.5)
  const front = BLOCK.depth / 2

  return (
    <group position={[slot.x, 0, 0]}>
      <RoundedBox args={[BLOCK.width, h, BLOCK.depth]} radius={BLOCK.radius} smoothness={4} position={[0, h / 2, 0]}>
        <meshStandardMaterial
          ref={body}
          color={metal.base}
          metalness={1}
          roughness={0.26}
          emissive={metal.emissive}
          emissiveIntensity={0.04}
          envMapIntensity={1.35}
        />
      </RoundedBox>

      {/* number plate + embossed rank */}
      <RoundedBox args={[BLOCK.width * 0.78, h * 0.64, 0.05]} radius={0.025} smoothness={2} position={[0, h * 0.5, front + 0.01]}>
        <meshStandardMaterial color="#061235" metalness={0.85} roughness={0.22} emissive="#0b3bb3" emissiveIntensity={0.04} />
      </RoundedBox>
      <Text
        font={PODIUM_FONT}
        characters={PODIUM_GLYPHS}
        fontSize={fontSize}
        position={[0.03, h * 0.5 - 0.03, front + 0.045]}
        color="#020a24"
      >
        {slot.rank}
      </Text>
      <Text font={PODIUM_FONT} characters={PODIUM_GLYPHS} fontSize={fontSize} position={[0, h * 0.5, front + 0.06]}>
        {slot.rank}
        <meshStandardMaterial color={metal.light} metalness={0.5} roughness={0.32} emissive={metal.light} emissiveIntensity={0.55} />
      </Text>

      {/* glowing edge strips */}
      <mesh material={strip} position={[0, h - 0.05, front + 0.012]}>
        <boxGeometry args={[BLOCK.width - 0.22, 0.035, 0.02]} />
      </mesh>
      <mesh material={strip} position={[0, 0.07, front + 0.012]}>
        <boxGeometry args={[BLOCK.width - 0.22, 0.03, 0.02]} />
      </mesh>
      <mesh material={strip} position={[-BLOCK.width / 2 - 0.012, h - 0.05, 0]}>
        <boxGeometry args={[0.02, 0.035, BLOCK.depth - 0.22]} />
      </mesh>
      <mesh material={strip} position={[BLOCK.width / 2 + 0.012, h - 0.05, 0]}>
        <boxGeometry args={[0.02, 0.035, BLOCK.depth - 0.22]} />
      </mesh>

      {/* contact shadow + floor glow */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, 0]} renderOrder={1}>
        <planeGeometry args={[BLOCK.width * 1.9, BLOCK.depth * 1.9]} />
        <meshBasicMaterial map={glowTex} color="#000000" transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh material={pad} rotation-x={-Math.PI / 2} position={[0, 0.012, 0.2]} renderOrder={1}>
        <planeGeometry args={[BLOCK.width * 2.6, BLOCK.depth * 2.6]} />
      </mesh>

      {/* spotlight + beam */}
      <primitive object={target} position={[0, h, 0]} />
      <spotLight
        ref={light}
        position={[0, LIGHT_HEIGHT, 0.9]}
        target={target}
        angle={0.27}
        penumbra={0.75}
        decay={0}
        intensity={SPOT_INTENSITY * level.current}
        color={metal.glow}
      />
      <BeamCone color={metal.glow} top={LIGHT_HEIGHT} bottom={h} radiusTop={0.14} radiusBottom={1.45} level={level} />

      {/* "?" while unrevealed */}
      <group ref={marker} visible={!lit} position={[0, h + 0.78, 0]}>
        <mesh renderOrder={3}>
          <planeGeometry args={[1.8, 1.8]} />
          <meshBasicMaterial map={glowTex} color="#38e1ff" transparent opacity={0.55} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <Text font={PODIUM_FONT} characters={PODIUM_GLYPHS} fontSize={0.78} color="#bff6ff" position={[0, 0, 0.02]}>
          ?
          <meshBasicMaterial color="#bff6ff" toneMapped={false} />
        </Text>
      </group>
    </group>
  )
}

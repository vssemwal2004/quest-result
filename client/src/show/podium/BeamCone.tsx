import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, type ShaderMaterial } from 'three'

const vertexShader = /* glsl */ `
  uniform float uHeight;
  varying float vH;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vH = position.y / uHeight + 0.5; // 0 at the floor end, 1 at the source
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vH;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Bright core facing the camera, soft silhouette edges, brighter towards the source.
    float facing = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    float along = mix(0.2, 1.0, pow(vH, 1.3)) * smoothstep(0.0, 0.1, vH);
    gl_FragColor = vec4(uColor, uOpacity * facing * along);
  }
`

/**
 * Fake volumetric spotlight beam: an open cylinder (narrow at the source, wide at the floor end)
 * with an additive, view-dependent falloff. `level` (0..1) is read every frame.
 */
export function BeamCone({
  color,
  top,
  bottom,
  radiusTop,
  radiusBottom,
  level,
  strength = 0.6,
}: {
  color: string
  top: number
  bottom: number
  radiusTop: number
  radiusBottom: number
  level: MutableRefObject<number>
  strength?: number
}) {
  const material = useRef<ShaderMaterial>(null)
  const height = top - bottom
  const uniforms = useMemo(
    () => ({ uColor: { value: new Color(color) }, uOpacity: { value: 0 }, uHeight: { value: height } }),
    [color, height],
  )
  useFrame(() => {
    if (material.current) material.current.uniforms.uOpacity.value = level.current * strength
  })
  return (
    <mesh position={[0, (top + bottom) / 2, 0]} renderOrder={2}>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, 48, 1, true]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

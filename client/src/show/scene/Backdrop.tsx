import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Color, ShaderMaterial } from 'three'
import type { SceneSignals } from './types'

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Screen-aligned quad drawn behind everything, independent of the camera.
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform vec3 uAccent;
  uniform vec3 uCore;
  uniform vec3 uMid;
  uniform vec3 uDeep;
  uniform vec3 uEdge;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 p = vUv - vec2(0.5, 0.56);
    p.x *= uAspect;
    float r = length(p * vec2(0.82, 1.0));

    // Poster look: luminous royal blue core falling off into deep navy.
    vec3 col = mix(uCore, uMid, smoothstep(0.0, 0.5, r));
    col = mix(col, uDeep, smoothstep(0.35, 1.0, r));
    col = mix(col, uEdge, smoothstep(0.85, 1.55, r));

    // Accent bloom behind the content, and slow aurora bands for life.
    col += uAccent * 0.085 * exp(-r * r * 4.0);
    float band = sin(vUv.x * 3.2 + uTime * 0.045 + sin(vUv.y * 3.7 - uTime * 0.06) * 1.4);
    col += vec3(0.0, 0.18, 0.55) * 0.05 * (0.5 + 0.5 * band) * (1.0 - smoothstep(0.25, 1.05, vUv.y));
    // Faint horizon glow along the bottom like the poster's lower light band.
    col += uAccent * 0.05 * exp(-pow((vUv.y - 0.12) * 5.0, 2.0));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    // Dither after encoding to break 8-bit banding in the large gradient.
    gl_FragColor.rgb += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0 * 1.6;
  }
`

/** Full-screen radial gradient (royal blue → navy) tinted by the current accent. */
export function Backdrop({ signals }: { signals: SceneSignals }) {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: signals.time,
          uAccent: signals.accent,
          uAspect: { value: 16 / 9 },
          uCore: { value: new Color('#1650e6') },
          uMid: { value: new Color('#0b2f98') },
          uDeep: { value: new Color('#051852') },
          uEdge: { value: new Color('#020a24') },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    [signals],
  )

  useEffect(() => {
    material.uniforms.uAspect.value = width / Math.max(1, height)
  }, [material, width, height])

  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh renderOrder={-1000} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

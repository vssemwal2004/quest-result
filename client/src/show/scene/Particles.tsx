import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import { createRandom } from './random'
import type { SceneSignals } from './types'
import { usePointScale } from './usePointScale'

const FIELD = { width: 46, height: 30, zNear: 5, zFar: -26 }

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uWarp;
  uniform float uPointScale;
  uniform float uHeight;
  attribute float aSize;
  attribute float aSeed;
  varying float vSeed;
  varying float vFade;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    // Rise slowly and wrap; positions are animated entirely on the GPU.
    float speed = 0.12 + aSeed * 0.35;
    p.y = mod(p.y + uTime * speed + uHeight * 0.5, uHeight) - uHeight * 0.5;
    p.x += sin(uTime * (0.15 + aSeed * 0.2) + aSeed * 31.0) * 0.35;
    p.z += uWarp * 6.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPointScale / max(0.5, -mv.z);
    // Fade at the wrap seam and very close to the camera.
    vFade = (1.0 - smoothstep(uHeight * 0.38, uHeight * 0.5, abs(p.y))) * smoothstep(0.6, 3.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uAccent;
  varying float vSeed;
  varying float vFade;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 1.8);
    // A few particles become hollow "bokeh" discs.
    float bokeh = step(0.86, vSeed) * smoothstep(0.55, 0.85, r) * (1.0 - smoothstep(0.9, 1.0, r));
    vec3 cyan = vec3(0.25, 0.85, 1.0);
    vec3 white = vec3(0.85, 0.95, 1.0);
    vec3 col = mix(mix(cyan, white, fract(vSeed * 13.7)), uAccent, 0.25);
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.0 + vSeed * 2.0) + vSeed * 60.0);
    float a = (soft * 0.75 + bokeh * 0.5) * twinkle * vFade;
    gl_FragColor = vec4(col * a, 1.0);
    #include <colorspace_fragment>
  }
`

/** Floating dust/bokeh field with additive blending. */
export function Particles({ count, signals }: { count: number; signals: SceneSignals }) {
  const pointScale = usePointScale()

  const geometry = useMemo(() => {
    const rnd = createRandom(4242)
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rnd.range(-FIELD.width / 2, FIELD.width / 2)
      pos[i * 3 + 1] = rnd.range(-FIELD.height / 2, FIELD.height / 2)
      pos[i * 3 + 2] = rnd.range(FIELD.zFar, FIELD.zNear)
      const s = rnd.next()
      seed[i] = s
      // Mostly fine dust, occasionally a large soft bokeh.
      size[i] = s > 0.86 ? rnd.range(0.22, 0.42) : rnd.range(0.025, 0.09)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSize', new BufferAttribute(size, 1))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    return g
  }, [count])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: signals.time,
          uWarp: signals.warp,
          uAccent: signals.accent,
          uPointScale: pointScale,
          uHeight: { value: FIELD.height },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [signals, pointScale],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

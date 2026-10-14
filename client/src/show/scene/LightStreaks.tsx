import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import { createRandom } from './random'
import { STREAKS, type SceneSignals } from './types'

const VERT = /* glsl */ `
  attribute vec4 aParams; // speed, phase, intensity, sharpness
  varying vec2 vUv;
  varying vec4 vParams;
  void main() {
    vUv = uv;
    vParams = aParams;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uAccent;
  varying vec2 vUv;
  varying vec4 vParams;
  void main() {
    // Thin anamorphic band across the quad...
    float band = exp(-pow((vUv.y - 0.5) * vParams.w, 2.0));
    // ...with a bright comet travelling along it and a long fading tail.
    float head = fract(uTime * vParams.x + vParams.y) * 1.6 - 0.3;
    float d = head - vUv.x;
    float comet = smoothstep(-0.02, 0.0, d) * exp(-max(d, 0.0) * 5.0);
    float ends = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
    vec3 col = mix(vec3(0.55, 0.9, 1.0), uAccent, 0.35);
    gl_FragColor = vec4(col * band * (0.1 + comet) * ends * vParams.z, 1.0);
    #include <colorspace_fragment>
  }
`

interface Streak {
  x: number
  y: number
  z: number
  rotation: number
  width: number
  height: number
  params: [speed: number, phase: number, intensity: number, sharpness: number]
}

function buildStreaks(): Streak[] {
  const rnd = createRandom(99)
  // One wide, very soft diagonal sweep for the "light leak" feel, then thin comets.
  const list: Streak[] = [{ x: 0, y: 1.5, z: -14, rotation: -0.32, width: 60, height: 9, params: [0.018, 0.2, 0.35, 3] }]
  for (let i = 1; i < STREAKS; i++) {
    list.push({
      x: rnd.range(-3, 3),
      y: rnd.range(-5, 5),
      z: rnd.range(-12, -5),
      rotation: rnd.range(-0.25, 0.25),
      width: rnd.range(26, 38),
      height: rnd.range(0.35, 0.6),
      params: [rnd.range(0.03, 0.07), rnd.next(), rnd.range(0.5, 0.85), 9],
    })
  }
  return list
}

/** All quads baked into one buffer (per-streak params as attributes) → a single draw call. */
function buildGeometry(streaks: Streak[]): BufferGeometry {
  const pos = new Float32Array(streaks.length * 12)
  const uv = new Float32Array(streaks.length * 8)
  const params = new Float32Array(streaks.length * 16)
  const index: number[] = []
  const corners = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ]
  streaks.forEach((s, i) => {
    const c = Math.cos(s.rotation)
    const sn = Math.sin(s.rotation)
    corners.forEach(([cx, cy, u, v], k) => {
      const lx = cx * s.width
      const ly = cy * s.height
      const vi = i * 4 + k
      pos.set([s.x + lx * c - ly * sn, s.y + lx * sn + ly * c, s.z], vi * 3)
      uv.set([u, v], vi * 2)
      params.set(s.params, vi * 4)
    })
    const b = i * 4
    index.push(b, b + 1, b + 2, b, b + 2, b + 3)
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setAttribute('aParams', new BufferAttribute(params, 4))
  g.setIndex(index)
  return g
}

/** Long soft light streaks and sweeps drifting through the depth of the scene. */
export function LightStreaks({ signals }: { signals: SceneSignals }) {
  const geometry = useMemo(() => buildGeometry(buildStreaks()), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: signals.time, uAccent: signals.accent },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [signals],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

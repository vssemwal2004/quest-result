import { useEffect, useMemo } from 'react'
import { AdditiveBlending, Color, ShaderMaterial } from 'three'
import { buildTraceGeometry, type PlacedTraceLayer } from './circuitGeometry'
import { CAMERA, TRACES_PER_LAYER, visibleHeight, type SceneSignals } from './types'
import { usePointScale } from './usePointScale'

const RIBBON_VERT = /* glsl */ `
  attribute float aSide;
  attribute float aDist;
  attribute float aLen;
  attribute float aSeed;
  attribute float aOpacity;
  varying float vSide;
  varying float vDist;
  varying float vLen;
  varying float vSeed;
  varying float vOpacity;
  void main() {
    vSide = aSide;
    vDist = aDist;
    vLen = aLen;
    vSeed = aSeed;
    vOpacity = aOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const RIBBON_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWarp;
  uniform vec3 uAccent;
  uniform vec3 uBase;
  uniform vec3 uPulse;
  varying float vSide;
  varying float vDist;
  varying float vLen;
  varying float vSeed;
  varying float vOpacity;
  void main() {
    float core = smoothstep(0.0, 0.85, 1.0 - abs(vSide));
    // One light pulse per trace, travelling from start to end, then a pause before the next.
    float speed = mix(1.3, 3.4, fract(vSeed * 7.31));
    float period = vLen + 8.0 + vSeed * 10.0;
    float head = mod(uTime * speed * (1.0 + uWarp * 4.0) + vSeed * 97.0, period);
    float behind = head - vDist;
    float tail = 1.2 + vSeed * 1.4;
    float pulse = smoothstep(-0.12, 0.0, behind) * exp(-max(behind, 0.0) / tail * 3.0);
    vec3 base = mix(uBase, uAccent, 0.3) * (0.5 + 0.4 * core);
    vec3 glow = mix(uPulse, uAccent, 0.25) * pulse * (0.35 + core) * (1.5 + uWarp);
    gl_FragColor = vec4((base + glow) * vOpacity * (0.55 + 0.45 * core), 1.0);
    #include <colorspace_fragment>
  }
`

const PAD_VERT = /* glsl */ `
  uniform float uPointScale;
  attribute float aSeed;
  attribute float aSize;
  attribute float aOpacity;
  varying float vSeed;
  varying float vOpacity;
  void main() {
    vSeed = aSeed;
    vOpacity = aOpacity;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPointScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const PAD_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uAccent;
  uniform vec3 uPulse;
  varying float vSeed;
  varying float vOpacity;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float ring = smoothstep(0.5, 0.64, r) * (1.0 - smoothstep(0.8, 1.0, r));
    float center = 1.0 - smoothstep(0.18, 0.34, r);
    float twinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.8 + vSeed * 1.6) + vSeed * 40.0));
    vec3 col = mix(uPulse, uAccent, 0.3) * (ring * 0.7 + center) * twinkle;
    gl_FragColor = vec4(col * vOpacity * 0.8, 1.0);
    #include <colorspace_fragment>
  }
`

interface LayerConfig {
  z: number
  pitch: number
  lineWidth: number
  opacity: number
  padSize: number
}

const LAYERS: LayerConfig[] = [
  { z: -3, pitch: 0.42, lineWidth: 0.032, opacity: 1, padSize: 0.13 },
  { z: -10, pitch: 0.56, lineWidth: 0.045, opacity: 0.62, padSize: 0.18 },
  { z: -20, pitch: 0.78, lineWidth: 0.065, opacity: 0.38, padSize: 0.25 },
]

const BASE = new Color('#2b6dff')
const PULSE = new Color('#7ff0ff')

/**
 * Layered PCB traces with travelling light pulses; deeper layers are coarser and dimmer for parallax.
 * Every layer lives in one merged buffer, so the whole field costs two draw calls.
 */
export function CircuitTraces({ layers, signals }: { layers: number; signals: SceneSignals }) {
  const pointScale = usePointScale()

  const geometry = useMemo(() => {
    const placed: PlacedTraceLayer[] = LAYERS.slice(0, layers).map((cfg, i) => {
      const height = visibleHeight(CAMERA.z - cfg.z) * 1.35
      return {
        ...cfg,
        seed: 1337 + i * 7919,
        width: height * 2.6,
        height,
        traces: TRACES_PER_LAYER,
        quietCenter: 0.42,
      }
    })
    return buildTraceGeometry(placed)
  }, [layers])

  const materials = useMemo(() => {
    const shared = { uTime: signals.time, uWarp: signals.warp, uAccent: signals.accent, uPulse: { value: PULSE } }
    const common = { transparent: true, depthWrite: false, blending: AdditiveBlending }
    return {
      ribbon: new ShaderMaterial({
        ...common,
        uniforms: { ...shared, uBase: { value: BASE } },
        vertexShader: RIBBON_VERT,
        fragmentShader: RIBBON_FRAG,
      }),
      pads: new ShaderMaterial({
        ...common,
        uniforms: { ...shared, uPointScale: pointScale },
        vertexShader: PAD_VERT,
        fragmentShader: PAD_FRAG,
      }),
    }
  }, [signals, pointScale])

  useEffect(
    () => () => {
      geometry.ribbons.dispose()
      geometry.pads.dispose()
    },
    [geometry],
  )
  useEffect(
    () => () => {
      materials.ribbon.dispose()
      materials.pads.dispose()
    },
    [materials],
  )

  return (
    <>
      <mesh geometry={geometry.ribbons} material={materials.ribbon} frustumCulled={false} />
      <points geometry={geometry.pads} material={materials.pads} frustumCulled={false} />
    </>
  )
}

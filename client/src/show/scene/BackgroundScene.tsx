import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, AdaptiveEvents, Environment, Lightformer, PerformanceMonitor, Stats } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Color, NeutralToneMapping } from 'three'
import type { Quality } from '@/types'
import { ShowErrorBoundary } from '../ShowErrorBoundary'
import { Backdrop } from './Backdrop'
import { CircuitTraces } from './CircuitTraces'
import { CssBackground } from './CssBackground'
import { HoloChips } from './HoloChips'
import { LightStreaks } from './LightStreaks'
import { Particles } from './Particles'
import { Robot } from './Robot'
import { CameraRig, SignalDriver } from './SceneDrivers'
import { CAMERA, CEILING, LEVELS, type QualityLevel, type SceneMode, type SceneSignals } from './types'

export interface BackgroundSceneProps {
  mode: SceneMode
  /** Hex accent; the scene eases toward it. */
  accent: string
  /** Quality CEILING from settings; the scene adapts below it at runtime. */
  quality: Quality
  reducedMotion: boolean
  showRobot: boolean
  /** True while the intro countdown runs. */
  warp: boolean
  /** Fires once, after the first frames have rendered (shaders compiled), or when falling back to CSS. */
  onReady: () => void
  /** Dev aid (`?fps=1`): FPS panel + renderer info on window.__questGl. */
  showFps?: boolean
}

/** Studio lighting for the robot's glossy shell, rendered once into a cube map (works offline). */
const StudioEnvironment = memo(function StudioEnvironment() {
  return (
    <Environment resolution={128} frames={1}>
      {/* Soft top softbox gives the glossy visor its long highlight; side strips tint the edges. */}
      <Lightformer form="rect" intensity={1.3} position={[0, 4, 5]} rotation={[-Math.PI / 5, 0, 0]} scale={[8, 1.6, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={0.6} position={[-6, 1, 2]} rotation={[0, Math.PI / 2, 0]} scale={[5, 3, 1]} color="#8fe9ff" />
      <Lightformer form="rect" intensity={0.5} position={[6, -1, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 3, 1]} color="#4d7dff" />
      <Lightformer form="circle" intensity={0.3} position={[0, -5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={6} color="#0b3bb3" />
    </Environment>
  )
})

/** Reports readiness after two rendered frames, so first-use shader compilation happens behind the loader. */
function FirstFrame({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 2) window.setTimeout(onReady, 0)
  })
  return null
}

declare global {
  interface Window {
    __questGl?: unknown
  }
}

function DebugProbe() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    window.__questGl = gl
    return () => {
      delete window.__questGl
    }
  }, [gl])
  return <Stats />
}

type SceneContentsProps = Omit<BackgroundSceneProps, 'quality' | 'onReady' | 'showFps'> & {
  level: QualityLevel
  pointer: MutableRefObject<{ x: number; y: number }>
}

function SceneContents({ mode, accent, level, reducedMotion, showRobot, warp, pointer }: SceneContentsProps) {
  const signals = useMemo<SceneSignals>(
    () => ({
      time: { value: 0 },
      accent: { value: new Color('#38e1ff') },
      warp: { value: 0 },
      pointer: { x: 0, y: 0 },
    }),
    [],
  )
  const robotQuality: Quality = level.bloom ? 'high' : level.physical ? 'medium' : 'low'

  return (
    <>
      <SignalDriver signals={signals} accent={accent} warp={warp} pointer={pointer} timeScale={reducedMotion ? 0.25 : 1} />
      <CameraRig signals={signals} drift={!reducedMotion} />

      <Backdrop signals={signals} />
      <CircuitTraces layers={level.traceLayers} signals={signals} />
      <LightStreaks signals={signals} />
      <HoloChips signals={signals} />
      <Particles count={level.particles} signals={signals} />

      {/* Robot lighting (everything else in the scene is unlit): warm key, cool fill, cyan rims for silhouette. */}
      <hemisphereLight args={['#dfe9ff', '#0a1f60', 0.35]} />
      <directionalLight position={[-4, 5, 7]} intensity={1.9} color="#fff1de" />
      <directionalLight position={[5, 0, 6]} intensity={0.45} color="#9fc0ff" />
      <directionalLight position={[3, 4, -6]} intensity={3.2} color="#38e1ff" />
      <directionalLight position={[-4, 2, -5]} intensity={1.8} color="#4d7dff" />
      {level.environment && <StudioEnvironment />}
      <Robot mode={mode} enabled={showRobot} quality={robotQuality} signals={signals} />

      {level.bloom && (
        // High threshold: only over-range emissive parts (eyes, rings, pulses) bloom, never the white shell.
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.9} luminanceSmoothing={0.1} radius={0.6} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      )}
    </>
  )
}

/** Minimum time after a quality decline before the scene may step back up. */
const INCLINE_COOLDOWN_MS = 10_000

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return hidden
}

/**
 * The single persistent full-screen 3D background shared by every stage (never remounted per stage).
 * Quality adapts at runtime below the configured ceiling. Falls back to a static CSS rendition if the
 * context is lost or the scene throws.
 */
export function BackgroundScene({ quality, onReady, showFps = false, ...sceneProps }: BackgroundSceneProps) {
  const { mode, accent } = sceneProps
  const [failed, setFailed] = useState(false)
  const pointer = useRef({ x: 0, y: 0 })
  const hidden = useDocumentHidden()

  const ceiling = CEILING[quality]
  const [levelIndex, setLevelIndex] = useState(ceiling)
  const level = LEVELS[levelIndex]
  const lowest = LEVELS.length - 1

  // Hysteresis: never step back up within INCLINE_COOLDOWN_MS of a decline; on flip-flopping,
  // settle on the worst rung that was actually needed.
  const adapt = useRef({ lastDecline: 0, worst: ceiling })
  useEffect(() => {
    adapt.current = { lastDecline: 0, worst: ceiling }
    setLevelIndex(ceiling)
  }, [ceiling])
  const decline = () => {
    const next = Math.min(lowest, levelIndex + 1)
    adapt.current.lastDecline = performance.now()
    adapt.current.worst = Math.max(adapt.current.worst, next)
    setLevelIndex(next)
  }
  const incline = () => {
    if (performance.now() - adapt.current.lastDecline < INCLINE_COOLDOWN_MS) return
    setLevelIndex(Math.max(ceiling, levelIndex - 1))
  }
  const settle = () => setLevelIndex(adapt.current.worst)
  // The podium stage brings its own Canvas: stop redrawing once the robot has left the frame.
  const [podiumIdle, setPodiumIdle] = useState(false)
  useEffect(() => {
    if (mode !== 'podium') {
      setPodiumIdle(false)
      return
    }
    const id = window.setTimeout(() => setPodiumIdle(true), 1600)
    return () => window.clearTimeout(id)
  }, [mode])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // A failed scene still has to release the loader.
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  useEffect(() => {
    if (failed) readyRef.current()
  }, [failed])

  if (failed) return <CssBackground accent={accent} />

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <ShowErrorBoundary fallback={null} onError={() => setFailed(true)}>
        <Canvas
          // The GL context is recreated only when the ceiling changes: with bloom possible ('high') the
          // composer replaces renderer MSAA, otherwise the renderer antialiases.
          key={quality}
          frameloop={hidden || podiumIdle ? 'demand' : 'always'}
          dpr={level.dpr}
          camera={{ position: [0, 0, CAMERA.z], fov: CAMERA.fov, near: 0.1, far: 120 }}
          gl={{
            antialias: quality !== 'high',
            alpha: false,
            stencil: false,
            powerPreference: 'high-performance',
            toneMapping: NeutralToneMapping,
          }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault()
              setFailed(true)
            })
          }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <PerformanceMonitor bounds={() => [48, 58]} flipflops={4} onDecline={decline} onIncline={incline} onFallback={settle}>
            <SceneContents {...sceneProps} level={level} pointer={pointer} />
          </PerformanceMonitor>
          <AdaptiveDpr pixelated={false} />
          <AdaptiveEvents />
          <FirstFrame onReady={onReady} />
          {showFps && <DebugProbe />}
        </Canvas>
      </ShowErrorBoundary>
    </div>
  )
}

/** Default export for React.lazy: three.js stays out of the show's first-paint chunk. */
export default BackgroundScene

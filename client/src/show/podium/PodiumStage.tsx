import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { AnimatePresence } from 'framer-motion'
import type confetti from 'canvas-confetti'
import type { StageProps } from '@/show/contracts'
import { GOLD_CONFETTI, useConfettiCanvas } from '@/show/stages/confetti'
import { StageFrame } from '@/show/stages/StageFrame'
import { useStageUnit } from '@/show/stages/units'
import type { Quality } from '@/types'
import type { CameraFocus } from './CameraRig'
import { CAMERA_FOV } from './framing'
import { PodiumNameplate, PodiumTitle } from './PodiumOverlays'
import { PodiumScene } from './PodiumScene'
import { buildSlots } from './slots'

/** dpr caps keep fill-rate sane on 4K projectors and integrated GPUs. */
const DPR: Record<Quality, number | [number, number]> = { high: [1, 1.5], medium: [1, 1.25], low: 1 }

/**
 * After a step change the scene renders continuously only until its animations have settled
 * (camera push-in + return, block glow, card spring; longer for the trophy rise), then switches to
 * frameloop "demand": a static podium costs no GPU time while the host speaks.
 */
const SETTLE_MS = 5500
const CHAMPION_SETTLE_MS = 8000

/** Gold cannons from both lower corners, then a shower from the top — timed to land with the champion card. */
function celebrateChampion(fire: (o: confetti.Options) => void, quality: Quality): number[] {
  const n = (count: number) => Math.round(count * (quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1))
  const cannon = (x: number, angle: number, count: number): confetti.Options => ({
    particleCount: n(count),
    angle,
    spread: 65,
    startVelocity: 72,
    origin: { x, y: 0.98 },
    colors: GOLD_CONFETTI,
    ticks: 260,
  })
  const shots: [number, confetti.Options][] = [
    [450, cannon(0, 62, 90)],
    [450, cannon(1, 118, 90)],
    [850, { particleCount: n(110), spread: 160, startVelocity: 42, gravity: 0.85, scalar: 1.1, origin: { x: 0.5, y: 0.18 }, colors: GOLD_CONFETTI, ticks: 300 }],
    [1700, cannon(0.1, 70, 50)],
    [1700, cannon(0.9, 110, 50)],
  ]
  return shots.map(([ms, options]) => window.setTimeout(() => fire(options), ms))
}

/**
 * Podium tier: a real 3D podium in its own transparent canvas (the shared background shows through).
 * step 0 = empty podium + title; step k = first k students revealed (reveal order rank 3 → 2 → 1).
 */
export function PodiumStage({ stage, step, quality, reducedMotion }: StageProps) {
  const tier = stage.tier
  const unitPx = useStageUnit()
  const { canvasRef, fire } = useConfettiCanvas()
  const slots = useMemo(() => (tier ? buildSlots(tier, stage.students, step) : []), [tier, stage.students, step])
  const [focus, setFocus] = useState<CameraFocus | null>(null)
  const [live, setLive] = useState(true)
  // One-way: once frames drop we stay on the cheaper path (no reflector/sparkles, dpr 1) for this stage.
  const [degraded, setDegraded] = useState(false)

  // Anything already revealed when we mount (or after stepping back) appears instantly.
  const instantBelow = useRef(step)
  if (step < instantBelow.current) instantBelow.current = step

  const prevStep = useRef(step)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  useEffect(() => {
    setLive(true)
    const championShown = slots.some((s) => s.kind === 'gold' && s.student !== null)
    const id = window.setTimeout(() => setLive(false), championShown ? CHAMPION_SETTLE_MS : SETTLE_MS)
    return () => window.clearTimeout(id)
  }, [step, slots])

  useEffect(() => {
    const prev = prevStep.current
    prevStep.current = step
    if (step <= prev) return
    const newest = slots.find((s) => s.order === step - 1)
    if (!newest) return
    setFocus({ x: newest.x, id: performance.now() })
    if (newest.kind === 'gold' && !reducedMotion) timers.current.push(...celebrateChampion(fire, quality))
  }, [step, slots, fire, quality, reducedMotion])

  if (!tier) return null

  return (
    <StageFrame accentColor={tier.color}>
      <div className="absolute inset-0">
        <Canvas
          dpr={degraded ? 1 : DPR[quality]}
          frameloop={live ? 'always' : 'demand'}
          gl={{ alpha: true, antialias: quality !== 'low', powerPreference: 'high-performance' }}
          camera={{ fov: CAMERA_FOV, near: 0.1, far: 80, position: [0, 3, 14] }}
        >
          <PerformanceMonitor onDecline={() => setDegraded(true)} />
          <Suspense fallback={null}>
            <PodiumScene
              tier={tier}
              slots={slots}
              quality={degraded && quality === 'high' ? 'medium' : quality}
              degraded={degraded}
              reducedMotion={reducedMotion}
              unitPx={unitPx}
              focus={focus}
              instantBelow={instantBelow.current}
            />
          </Suspense>
        </Canvas>
      </div>
      {/* Above the WebGL canvas, below the winner cards (drei <Html> z-index 10–20). */}
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
      <AnimatePresence>
        {step <= 0 ? <PodiumTitle key="title" tier={tier} reducedMotion={reducedMotion} /> : <PodiumNameplate key="plate" tier={tier} />}
      </AnimatePresence>
    </StageFrame>
  )
}

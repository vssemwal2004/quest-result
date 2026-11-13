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
import { BotRevealStage } from './BotRevealStage'
import { HybridMedalStage } from './HybridMedalStage'
import { ChampionFireworks } from './ChampionFireworks'

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

/** A smaller metal-coloured burst lands with each runner-up reveal. */
function celebrateRunnerUp(fire: (o: confetti.Options) => void, quality: Quality, place: 'silver' | 'bronze'): number[] {
  const count = quality === 'low' ? 22 : quality === 'medium' ? 38 : 55
  const colors = place === 'silver' ? ['#f7fbff', '#b6e9ff', '#8eaad0', '#38e1ff'] : ['#ffe5b9', '#e8954a', '#bd622d', '#ffd23f']
  return [
    window.setTimeout(() => fire({ particleCount: count, angle: 68, spread: 52, startVelocity: 53, origin: { x: 0.12, y: 0.94 }, colors }), 180),
    window.setTimeout(() => fire({ particleCount: count, angle: 112, spread: 52, startVelocity: 53, origin: { x: 0.88, y: 0.94 }, colors }), 390),
  ]
}

/**
 * step 0 = title; odd steps focus an anonymous winner; even steps reveal that winner;
 * the final step brings all winners together.
 */
function Podium3DStage({ stage, step, quality, reducedMotion }: StageProps) {
  const tier = stage.tier
  const unitPx = useStageUnit()
  const { canvasRef, fire } = useConfettiCanvas()
  const slots = useMemo(() => (tier ? buildSlots(tier, stage.students, step, stage.revealRanks) : []), [tier, stage.students, stage.revealRanks, step])
  const [focus, setFocus] = useState<CameraFocus | null>(null)
  const [live, setLive] = useState(true)
  // One-way: once frames drop we stay on the cheaper path (no reflector/sparkles, dpr 1) for this stage.
  const [degraded, setDegraded] = useState(false)

  // Anything already revealed when we mount (or after stepping back) appears instantly.
  const instantBelow = useRef(step)
  if (step < instantBelow.current) instantBelow.current = step

  const prevStep = useRef(-1)
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
    if (step === prev) return
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    const newest = step <= stage.studentCount * 2 ? slots.find((s) => s.order === Math.floor((step - 1) / 2)) : null
    if (!newest) {
      setFocus(null)
      return
    }
    setFocus({ x: newest.x, hold: step % 2 === 1, id: performance.now() })
    if (step > prev && step % 2 === 0 && !reducedMotion) {
      if (newest.kind === 'gold') timers.current.push(...celebrateChampion(fire, quality))
      else if (newest.kind === 'silver' || newest.kind === 'bronze') timers.current.push(...celebrateRunnerUp(fire, quality, newest.kind))
    }
  }, [step, slots, fire, quality, reducedMotion, stage.studentCount])

  if (!tier) return null
  const championReveal = step > 0 && step <= stage.studentCount * 2 && step % 2 === 0
    && slots.some((slot) => slot.kind === 'gold' && slot.student !== null)

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
              solo={step > 0 && step <= stage.studentCount * 2}
            />
          </Suspense>
        </Canvas>
      </div>
      {championReveal && <ChampionFireworks quality={quality} reducedMotion={reducedMotion} />}
      {/* Above the WebGL canvas, below the winner cards (drei <Html> z-index 10–20). */}
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 z-[2] h-full w-full" />
      <AnimatePresence>
        {step <= 0 ? <PodiumTitle key="title" tier={tier} reducedMotion={reducedMotion} /> : <PodiumNameplate key="plate" tier={tier} compact={step > stage.studentCount * 2} />}
      </AnimatePresence>
    </StageFrame>
  )
}

/** Keep each presentation mode available without switching scenes mid-reveal. */
export function PodiumStage(props: StageProps) {
  if (props.stage.tier?.podiumMode === 'hybrid') return <HybridMedalStage {...props} />
  return props.stage.tier?.podiumMode === 'bot' ? <BotRevealStage {...props} /> : <Podium3DStage {...props} />
}

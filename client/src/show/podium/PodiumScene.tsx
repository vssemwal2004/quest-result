import { useThree } from '@react-three/fiber'
import { Environment, Html, Lightformer, Sparkles } from '@react-three/drei'
import { AnimatePresence } from 'framer-motion'
import { clamp } from '@/show/stages/units'
import type { PublicTier, Quality } from '@/types'
import { CameraRig, type CameraFocus } from './CameraRig'
import { computeFraming } from './framing'
import { PodiumBlock } from './PodiumBlock'
import { BLOCK, cardLift, medalLabel, type PodiumSlot } from './slots'
import { StageFloor } from './StageFloor'
import { Trophy } from './Trophy'
import { WINNER_CARD_WIDTH, WinnerCard } from './WinnerCard'
import { DecoyName } from '@/show/stages/DecoyName'
import { u } from '@/show/stages/units'

/** Offline studio lighting for the metals: Lightformers baked once into an env map (no HDR download). */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 6, 6]} scale={[12, 3, 1]} />
      <Lightformer form="rect" intensity={2.2} color="#38e1ff" position={[-8, 2.5, 3]} scale={[10, 2.5, 1]} />
      <Lightformer form="rect" intensity={2.2} color="#1f5eff" position={[8, 2.5, 3]} scale={[10, 2.5, 1]} />
      <Lightformer form="ring" intensity={2.5} color="#ffe39a" position={[0, 5, -6]} scale={5} />
      <Lightformer form="rect" intensity={0.8} color="#0b3bb3" position={[0, -4, 0]} scale={[20, 20, 1]} />
    </Environment>
  )
}

export function PodiumScene({
  tier,
  slots,
  quality,
  degraded,
  reducedMotion,
  unitPx,
  focus,
  instantBelow,
  solo,
}: {
  tier: PublicTier
  slots: PodiumSlot[]
  quality: Quality
  /** Set by the PerformanceMonitor when frames drop: sparkles off (the stage also lowers quality/dpr). */
  degraded: boolean
  reducedMotion: boolean
  unitPx: number
  focus: CameraFocus | null
  /** Slots revealed at a reveal index below this appear without an entrance animation. */
  instantBelow: number
  solo: boolean
}) {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  // Shrink cards when the blocks end up closer together on screen (short or narrow viewports).
  const { pxPerUnit } = computeFraming(width, height, unitPx)
  const neededPx = (WINNER_CARD_WIDTH.gold / 2 + WINNER_CARD_WIDTH.silver / 2 + 1.2) * unitPx
  const cardScale = clamp((BLOCK.spacing * pxPerUnit) / neededPx, 0.6, 1)
  const gold = slots.find((s) => s.kind === 'gold')

  return (
    <>
      <CameraRig unitPx={unitPx} focus={focus} reducedMotion={reducedMotion} />
      <hemisphereLight args={['#6d97ff', '#020a24', 0.55]} />
      <directionalLight position={[4, 7, 9]} intensity={1.1} color="#e6eeff" />
      <pointLight position={[0, 3.5, -4]} intensity={18} distance={16} color="#38e1ff" />
      <StudioEnvironment />

      <StageFloor quality={quality} reducedMotion={reducedMotion} />
      {slots.map((slot) => (
        <PodiumBlock key={slot.kind} slot={slot} reducedMotion={reducedMotion} />
      ))}
      {gold && (
        <group position={[gold.x, 0, 0]}>
          <Trophy baseY={gold.height} raised={gold.student !== null} reducedMotion={reducedMotion} />
        </group>
      )}
      {quality !== 'low' && !degraded && (
        <Sparkles
          count={quality === 'high' ? 60 : 30}
          scale={[13, 5.5, 5]}
          position={[0, 3, -0.5]}
          size={quality === 'high' ? 3.2 : 2.6}
          speed={reducedMotion ? 0 : 0.3}
          opacity={0.85}
          noise={0.6}
          color="#ffe39a"
        />
      )}

      {slots.map((slot) => (
        <Html key={slot.kind} position={[slot.x, slot.height + cardLift(slot.kind), 0]} zIndexRange={[20, 10]} pointerEvents="none">
          <AnimatePresence>
            {slot.suspense && (
              <div
                key={`pending-${slot.rank}`}
                className="rounded-2xl border border-cyan-200/70 bg-[#07163d]/95 text-center text-white shadow-[0_0_35px_rgba(56,225,255,.6)]"
                style={{ width: u(23 * cardScale), padding: `${u(1.2 * cardScale)} ${u(1.5 * cardScale)}`, transform: 'translate(-50%, -100%)' }}
              >
                <div className="font-tech font-bold uppercase tracking-[.25em] text-cyan-200" style={{ fontSize: u(1.05 * cardScale) }}>Rank #{slot.rank}</div>
                <div className="mt-2 whitespace-nowrap font-display font-black" style={{ fontSize: u(1.45 * cardScale) }}><DecoyName reducedMotion={reducedMotion} /></div>
                <div className="mt-2 font-tech uppercase tracking-widest text-white/70" style={{ fontSize: u(.8 * cardScale) }}>Reveal pending</div>
              </div>
            )}
            {slot.student && (
              <WinnerCard
                key={slot.student.id}
                student={slot.student}
                kind={slot.kind}
                label={medalLabel(tier, slot)}
                scale={cardScale}
                instant={slot.order * 2 + 2 <= instantBelow || !solo}
                reducedMotion={reducedMotion}
                solo={solo}
                prizeAmount={tier.prizeAmount}
                prize={tier.prize}
              />
            )}
          </AnimatePresence>
        </Html>
      ))}
    </>
  )
}

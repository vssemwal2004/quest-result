import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useAnimationFrame, useMotionValue, type MotionValue } from 'framer-motion'
import { Users } from 'lucide-react'
import { formatRange } from '@/show/contracts'
import type { PublicTier, Quality } from '@/types'
import { Glints } from './Glints'
import { GlowText } from './GlowText'
import { PrizeBanner } from './PrizeBanner'
import { TierIconRing } from './TierIcon'
import { accent, clamp, cssVars, u } from './units'

const EASE_OUT = [0.16, 1, 0.3, 1] as const

/** Pointer-following tilt with a slow idle sway (the projector PC rarely has a moving mouse). */
function useTilt(enabled: boolean): { rotateX: MotionValue<number>; rotateY: MotionValue<number> } {
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)
  const pointer = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled])

  useAnimationFrame((t, delta) => {
    if (!enabled) return
    const k = 1 - Math.exp(-delta / 220)
    const targetX = -pointer.current.y * 7 + Math.sin(t / 2600) * 2.2
    const targetY = pointer.current.x * 9 + Math.cos(t / 3400) * 3.2
    rotateX.set(rotateX.get() + (targetX - rotateX.get()) * k)
    rotateY.set(rotateY.get() + (targetY - rotateY.get()) * k)
  })

  return { rotateX, rotateY }
}

/** Default subtitles like "Ranks 151 – 200" would just repeat the giant numerals. */
function isRedundantSubtitle(tier: PublicTier): boolean {
  const s = tier.subtitle
  return !s.trim() || (s.includes(String(tier.rankFrom)) && s.includes(String(tier.rankTo)))
}

/** Leaf element that fades/rises in on its own (opacity on the 3D parent would flatten preserve-3d). */
function Layer({ delay, depth, children, className }: { delay: number; depth: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      style={{ z: depth }}
    >
      {children}
    </motion.div>
  )
}

/** Step 0 of a tier: cinematic 3D glass title card (icon, rank range, name, prize, winners). */
export function TierTitleCard({
  tier,
  studentCount,
  quality,
  reducedMotion,
}: {
  tier: PublicTier
  studentCount: number
  quality: Quality
  reducedMotion: boolean
}) {
  const { rotateX, rotateY } = useTilt(!reducedMotion)
  const range = formatRange(tier.rankFrom, tier.rankTo)
  // Orbitron is very wide: size the numerals by character count so "151 – 200" still fits the card.
  const numeralSize = clamp(48 / (range.length * 0.82), 4.8, 10)
  const hasPrize = Boolean(tier.prize.trim() || tier.prizeAmount.trim())

  return (
    <div className="grid h-full w-full place-items-center" style={{ perspective: u(110) }}>
      <motion.div
        className="relative"
        style={{ transformStyle: 'preserve-3d' }}
        initial={reducedMotion ? false : { y: '40vh', z: -900, rotateX: 48, scale: 0.8 }}
        animate={{ y: 0, z: 0, rotateX: 0, scale: 1 }}
        transition={{ duration: 1.25, ease: EASE_OUT }}
      >
        <motion.div className="relative" style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>
          {/* accent halo behind the card */}
          <div
            aria-hidden
            className="qs-pulse-glow absolute rounded-full"
            style={{ inset: `${u(-6)} ${u(-10)}`, background: `radial-gradient(closest-side, ${accent(0.38)}, ${accent(0.1)} 55%, transparent)`, transform: `translateZ(${u(-6)})` }}
          />
          {quality !== 'low' && <Glints count={quality === 'high' ? 14 : 8} seed={tier.rankFrom} />}

          {/* baked drop shadow (radial gradient instead of a large blurred box-shadow) */}
          <div
            aria-hidden
            className="absolute rounded-[50%]"
            style={{ inset: `${u(2)} ${u(-3)} ${u(-5)}`, background: 'radial-gradient(closest-side, rgba(2,10,36,.6), rgba(2,10,36,0))' }}
          />

          {/* faux glass slab: opaque-enough gradients, 1px highlight and a baked inner rim glow (no backdrop blur) */}
          <motion.div
            aria-hidden
            className="absolute inset-0 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={{
              borderRadius: u(2.6),
              border: `2px solid ${accent(0.55)}`,
              background: `radial-gradient(130% 100% at 50% 45%, transparent 62%, ${accent(0.24)} 100%), linear-gradient(160deg, rgba(56,225,255,.2) 0%, rgba(20,70,214,.5) 30%, rgba(4,20,69,.9) 100%)`,
            }}
          >
            <div className="absolute inset-x-0 top-0 h-2/5" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.14), transparent)' }} />
            <div className="absolute inset-x-[8%] top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #fff, transparent)' }} />
            {!reducedMotion && (
              <div
                className="qs-sweep absolute inset-y-0 left-0 w-1/4"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)', ...cssVars({ '--d': '1.1s' }) }}
              />
            )}
          </motion.div>

          {/* content (layers float at different depths for parallax) */}
          <div
            className="relative flex flex-col items-center text-center"
            style={{ minWidth: u(54), maxWidth: u(80), padding: `${u(3)} ${u(5)} ${u(3.2)}`, transformStyle: 'preserve-3d' }}
          >
            <Layer delay={0.35} depth={70}>
              <TierIconRing icon={tier.icon} size={5} spin={!reducedMotion} />
            </Layer>

            <Layer delay={0.45} depth={50} className="font-tech font-semibold uppercase">
              <span style={{ fontSize: u(1.25), letterSpacing: '0.55em', color: accent(1), marginTop: u(1.6), display: 'block' }}>
                {tier.rankFrom === tier.rankTo ? 'Rank' : 'Ranks'}
              </span>
            </Layer>

            <Layer delay={0.55} depth={90}>
              <GlowText
                className="whitespace-nowrap font-tech font-black leading-none"
                gradient={`linear-gradient(180deg, #ffffff 0%, #ffffff 35%, ${accent(1)} 100%)`}
                glow={`0 0 ${u(1.2)} ${accent(0.75)}, 0 ${u(0.3)} 0 rgba(2,10,36,.8)`}
                style={{ fontSize: u(numeralSize), marginTop: u(0.3) }}
              >
                {range}
              </GlowText>
            </Layer>

            <Layer delay={0.7} depth={60}>
              <h1
                className="font-display font-black uppercase text-white"
                style={{ fontSize: u(3.7), lineHeight: 1.05, marginTop: u(1.2), letterSpacing: '0.01em', textShadow: `0 ${u(0.3)} ${u(1.4)} rgba(2,10,36,.8)` }}
              >
                {tier.name}
              </h1>
              {!isRedundantSubtitle(tier) && (
                <p className="font-sans font-medium text-white/80" style={{ fontSize: u(1.45), marginTop: u(0.5) }}>
                  {tier.subtitle}
                </p>
              )}
            </Layer>

            {hasPrize && (
              <Layer delay={0.9} depth={80} className="w-full">
                <div style={{ marginTop: u(2) }}>
                  <PrizeBanner amount={tier.prizeAmount} prize={tier.prize} />
                </div>
              </Layer>
            )}

            {studentCount > 0 && (
              <Layer delay={1.05} depth={40}>
                <span
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/10 font-sans font-semibold text-white"
                  style={{ fontSize: u(1.3), padding: `${u(0.55)} ${u(1.6)}`, gap: u(0.6), marginTop: u(2) }}
                >
                  <Users style={{ width: u(1.5), height: u(1.5), color: accent(1) }} />
                  {studentCount} {studentCount === 1 ? 'winner' : 'winners'}
                </span>
              </Layer>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

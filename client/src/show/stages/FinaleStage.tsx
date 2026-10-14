import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Phone } from 'lucide-react'
import type { StageProps } from '@/show/contracts'
import { QuestLogo } from '@/show/brand/QuestLogo'
import type { Quality } from '@/types'
import { GOLD_CONFETTI, QUEST_CONFETTI, useConfettiCanvas } from './confetti'
import { GoldText3D } from './GoldText3D'
import { Glints } from './Glints'
import { StageFrame } from './StageFrame'
import { u } from './units'

/** Gentle, sparse bursts; low only fires the opening salute (everyMs 0 = no loop). */
const FIREWORKS: Record<Quality, { everyMs: number; particles: number; salute: number }> = {
  high: { everyMs: 2800, particles: 36, salute: 80 },
  medium: { everyMs: 3800, particles: 24, salute: 50 },
  low: { everyMs: 0, particles: 0, salute: 30 },
}

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] as const },
})

/** Hand-drawn yellow swoosh from the poster's "Your Tomorrow" line. */
function Swoosh() {
  return (
    <svg aria-hidden viewBox="0 0 400 40" preserveAspectRatio="none" className="absolute left-[8%] w-[84%]" style={{ bottom: u(-1.2), height: u(1.6) }}>
      <path d="M6 30 C120 8 260 4 394 14 C280 14 150 20 40 36 Z" fill="#ffd23f" />
    </svg>
  )
}

/** Gentle looping firework bursts (none under reduced motion). */
function useFireworks(quality: Quality, reducedMotion: boolean) {
  const { canvasRef, fire } = useConfettiCanvas()
  useEffect(() => {
    if (reducedMotion) return
    const { everyMs, particles, salute } = FIREWORKS[quality]
    const burst = () =>
      fire({
        particleCount: particles,
        spread: 360,
        startVelocity: 26,
        gravity: 0.7,
        decay: 0.92,
        ticks: 110,
        scalar: 0.9,
        origin: { x: 0.12 + Math.random() * 0.76, y: 0.12 + Math.random() * 0.35 },
        colors: Math.random() < 0.5 ? GOLD_CONFETTI : QUEST_CONFETTI,
      })
    // Opening salute from both lower corners, then the loop.
    const opening = window.setTimeout(() => {
      fire({ particleCount: salute, angle: 60, spread: 70, startVelocity: 60, origin: { x: 0, y: 0.95 }, colors: GOLD_CONFETTI })
      fire({ particleCount: salute, angle: 120, spread: 70, startVelocity: 60, origin: { x: 1, y: 0.95 }, colors: GOLD_CONFETTI })
    }, 600)
    const loop = everyMs > 0 ? window.setInterval(burst, everyMs) : 0
    return () => {
      window.clearTimeout(opening)
      window.clearInterval(loop)
    }
  }, [fire, quality, reducedMotion])
  return canvasRef
}

/** Celebratory closing screen. */
export function FinaleStage({ settings, totalWinners, quality, reducedMotion }: StageProps) {
  const canvasRef = useFireworks(quality, reducedMotion)
  const title = settings.finaleTitle.trim() || 'Congratulations!'
  const event = [settings.eventTitle, settings.eventEdition].filter((s) => s.trim()).join(' ')
  const ribbon = totalWinners > 0 ? `To all ${totalWinners} winners of ${event}` : `To all the winners of ${event}`
  const place = [settings.organization, settings.location].filter((s) => s.trim()).join(', ')

  return (
    <StageFrame accentColor="#ffd23f">
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
      <div className="relative flex h-full flex-col items-center justify-center text-center" style={{ padding: `0 ${u(6)}`, gap: u(1.8) }}>
        <motion.div {...rise(0.1)}>
          <QuestLogo size="lg" animated={!reducedMotion} />
        </motion.div>

        <motion.h1
          {...rise(0.35)}
          className="relative font-display font-black uppercase"
          style={{ fontSize: u(title.length > 26 ? 5 : 6.4), lineHeight: 1.05, letterSpacing: '0.01em', maxWidth: u(86) }}
        >
          {quality !== 'low' && <Glints count={10} seed={42} />}
          <GoldText3D>{title}</GoldText3D>
        </motion.h1>

        <motion.div {...rise(0.6)}>
          <span
            className="inline-block rounded-full bg-white font-display font-extrabold uppercase text-navy-800"
            style={{
              fontSize: u(1.7),
              padding: `${u(0.6)} ${u(2.6)}`,
              letterSpacing: '0.04em',
              boxShadow: `0 0 0 ${u(0.25)} rgba(56,225,255,.35)`,
            }}
          >
            {ribbon}
          </span>
        </motion.div>

        {settings.finaleMessage.trim() && (
          <motion.p {...rise(0.85)} className="relative font-script text-gold-400" style={{ fontSize: u(3.6), lineHeight: 1.1, maxWidth: u(80), textShadow: '0 2px 10px rgba(2,10,36,.6)' }}>
            {settings.finaleMessage}
            <Swoosh />
          </motion.p>
        )}

        <motion.div {...rise(1.1)} className="flex flex-col items-center" style={{ gap: u(0.9), marginTop: u(1.4) }}>
          {place && (
            <p className="flex items-center font-sans font-semibold text-white/90" style={{ fontSize: u(1.55), gap: u(0.6) }}>
              <MapPin style={{ width: u(1.6), height: u(1.6) }} className="text-cyan-glow" />
              {place}
            </p>
          )}
          {settings.contact.trim() && (
            <p
              className="flex items-center rounded-full bg-gold-gradient font-sans font-bold text-navy-900"
              style={{ fontSize: u(1.3), padding: `${u(0.45)} ${u(1.8)}`, gap: u(0.6) }}
            >
              <Phone style={{ width: u(1.4), height: u(1.4) }} />
              For details contact {settings.contact}
            </p>
          )}
        </motion.div>
      </div>
    </StageFrame>
  )
}

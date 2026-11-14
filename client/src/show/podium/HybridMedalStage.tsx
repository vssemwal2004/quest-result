import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type confetti from 'canvas-confetti'
import { Crown, Medal } from 'lucide-react'
import type { StageProps } from '@/show/contracts'
import { StageFrame } from '@/show/stages/StageFrame'
import { DecoyName } from '@/show/stages/DecoyName'
import { ShuffleName } from '@/show/stages/ShuffleName'
import { GOLD_CONFETTI, useConfettiCanvas } from '@/show/stages/confetti'
import type { PublicStudent, PublicTier } from '@/types'
import { PodiumTitle } from './PodiumOverlays'
import './botStage.css'
import './hybridMedals.css'

function prizeFor(tier: PublicTier, rank: number) {
  const prize = tier.podiumPrizes?.find((entry) => entry.rank === rank)
  return [prize?.prizeAmount ?? (tier.podiumPrizes === null ? tier.prizeAmount : ''), prize?.prize ?? (tier.podiumPrizes === null ? tier.prize : '')]
    .map((value) => value.trim()).filter(Boolean).join(' · ')
}

function labelFor(rank: number, first: number) {
  if (rank === first) return 'Champion'
  if (rank === first + 1) return 'Second place'
  if (rank === first + 2) return 'Third place'
  return `Rank #${rank}`
}

function celebrate(fire: (options: confetti.Options) => void, rank: number, first: number) {
  const colors = rank === first ? GOLD_CONFETTI : rank === first + 1
    ? ['#eaf8ff', '#a6dfff', '#819cc7', '#42dfff'] : ['#ffdba4', '#f6a65c', '#a85a2d', '#fff0c3']
  const count = rank === first ? 90 : rank === first + 1 ? 65 : 45
  const velocity = rank === first ? 48 : rank === first + 1 ? 43 : 38
  const bursts = [
    { x: .25, y: .78, angle: 65, delay: 850 },
    { x: .75, y: .78, angle: 115, delay: 950 },
    { x: .28, y: .20, angle: 315, delay: 1060 },
    { x: .72, y: .20, angle: 225, delay: 1160 },
  ]
  return bursts.map(({ x, y, angle, delay }) => window.setTimeout(() => fire({
    particleCount: count, angle, spread: 62, startVelocity: velocity,
    origin: { x, y }, colors,
  }), delay))
}

function MedalPosition({ rank, first, student, active, shuffling, celebrating, reducedMotion, tier }: {
  rank: number; first: number; student?: PublicStudent; active: boolean; shuffling: boolean; celebrating: boolean; reducedMotion: boolean; tier: PublicTier
}) {
  const place = rank === first ? 'gold' : rank === first + 1 ? 'silver' : rank === first + 2 ? 'bronze' : 'fourth'
  const prize = student ? prizeFor(tier, rank) : ''
  const sparkCount = place === 'gold' ? 14 : place === 'silver' ? 10 : 7
  return (
    <motion.div className={`hybrid-medal hybrid-medal--${place} ${active ? 'hybrid-medal--active' : ''} ${student ? 'hybrid-medal--revealed' : ''} ${celebrating ? 'hybrid-medal--celebrating' : ''}`}
      initial={reducedMotion ? false : { opacity: 0, scale: .7, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reducedMotion ? .1 : .55, ease: 'easeOut' }}>
      <div className="hybrid-medal__caption">
        {student || shuffling ? (
          <div className="hybrid-medal__card">
            <span className="hybrid-medal__label">{rank === first ? <Crown /> : <Medal />} {labelFor(rank, first)}</span>
            <strong className="hybrid-medal__name">
              {student ? <ShuffleName name={student.name} duration={800} reducedMotion={reducedMotion} /> : <DecoyName reducedMotion={reducedMotion} />}
            </strong>
            {student && <>
              <span className="hybrid-medal__school">{[student.school, student.city].filter(Boolean).join(' · ')}</span>
              {prize && <span className="hybrid-medal__prize">{prize}</span>}
            </>}
          </div>
        ) : <div className="hybrid-medal__placeholder">{labelFor(rank, first)}</div>}
      </div>
      <div className="hybrid-medal__laurel" aria-hidden>
        {place === 'gold' && <svg className="hybrid-medal__crown" viewBox="0 0 100 58" fill="none">
          <path d="M10 45 4 11 27 29 50 4 73 29 96 11 90 45Z" fill="currentColor" stroke="#fff3af" strokeWidth="3" strokeLinejoin="round" />
          <path d="M12 49h76v6H12z" fill="currentColor" stroke="#fff3af" strokeWidth="2" />
          <circle cx="4" cy="9" r="4" fill="#fff6c5" /><circle cx="50" cy="4" r="4" fill="#fff6c5" /><circle cx="96" cy="9" r="4" fill="#fff6c5" />
        </svg>}
        <img className="hybrid-medal__wreath" src="/medal-laurel.png" alt="" />
        <strong>#{rank}</strong>
        {celebrating && <span className="hybrid-medal__sparks" aria-hidden>
          {Array.from({ length: sparkCount }, (_, index) => <i key={index} style={{ '--spark-angle': `${index * 360 / sparkCount}deg`, '--spark-delay': `${index % 3 * .1}s` } as CSSProperties} />)}
        </span>}
      </div>
      <div className="hybrid-medal__ring" aria-hidden><i /></div>
    </motion.div>
  )
}

/** One persistent reveal scene: bot greeting, three medal positions, then bronze to gold. */
export function HybridMedalStage({ stage, step, reducedMotion }: StageProps) {
  const tier = stage.tier
  const { canvasRef, fire } = useConfettiCanvas()
  const ranks = useMemo(() => stage.revealRanks ?? stage.students.map((person) => person.rank), [stage.revealRanks, stage.students])
  const activeIndex = step >= 3 ? Math.floor((step - 3) / 2) : -1
  const activeRank = ranks[activeIndex]
  const shuffling = step >= 3 && step % 2 === 1
  const firstRank = tier?.rankFrom
  const spotlightPlace = activeRank === firstRank ? 'gold'
    : firstRank != null && activeRank === firstRank + 1 ? 'silver'
      : firstRank != null && activeRank === firstRank + 2 ? 'bronze' : 'fourth'
  const [focusedRank, setFocusedRank] = useState<number | null>(null)
  const focusedPlace = focusedRank === firstRank ? 'gold'
    : firstRank != null && focusedRank === firstRank + 1 ? 'silver'
      : firstRank != null && focusedRank === firstRank + 2 ? 'bronze' : 'fourth'
  const hideBotForFocus = focusedRank != null && focusedRank !== firstRank
  const timers = useRef<number[]>([])
  const previousStep = useRef(step)

  useEffect(() => {
    if (reducedMotion || step < 3 || activeRank == null) {
      setFocusedRank(null)
      return
    }
    setFocusedRank(activeRank)
    if (step % 2 === 0) {
      const timer = window.setTimeout(() => setFocusedRank(null), 4200)
      return () => window.clearTimeout(timer)
    }
  }, [step, activeRank, reducedMotion])

  useEffect(() => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    if (tier && step > previousStep.current && step >= 4 && step % 2 === 0 && !reducedMotion && activeRank != null) {
      timers.current = celebrate(fire, activeRank, tier.rankFrom)
    }
    previousStep.current = step
    return () => timers.current.forEach(window.clearTimeout)
  }, [step, activeRank, tier, reducedMotion, fire])

  if (!tier) return null
  return (
    <StageFrame accentColor={tier.color} className="hybrid-medals">
      <canvas ref={canvasRef} aria-hidden className="bot-stage__confetti pointer-events-none absolute inset-0 h-full w-full" />
      {step === 0 ? <PodiumTitle tier={tier} reducedMotion={reducedMotion} /> : <>
      <motion.div className="bot-stage__fly-in hybrid-medals__bot"
        initial={reducedMotion ? false : { x: '110vw', y: '18vh', rotate: 10, scale: .55, opacity: 0 }}
        animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: hideBotForFocus ? 0 : 1 }}
        transition={reducedMotion ? { duration: .1 } : { duration: 2.5, ease: [.42, 0, .2, 1], opacity: { duration: step === 1 ? 2.5 : .35, delay: !hideBotForFocus && activeIndex >= 0 && activeRank !== firstRank ? .85 : 0 } }}>
        <div className={`bot-stage__artwork ${reducedMotion ? 'bot-stage__artwork--still' : step === 1 ? 'bot-stage__artwork--greeting' : ''}`}>
          <img src="/bot-reveal.png" alt="" aria-hidden className="bot-stage__image" />
          {step === 1 && !reducedMotion && <div className="bot-stage__wave-lines" aria-hidden><i /><i /><i /></div>}
          <div className="bot-stage__face-overlay">
            <AnimatePresence mode="wait">
              <motion.div key={activeRank ?? 'greeting'} className="bot-stage__screen-content"
                initial={reducedMotion ? false : { opacity: 0, scale: .88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? .1 : .4 }}>
                {step < 3 ? <div className="bot-stage__expression"><span className="bot-stage__eyes"><i /><i /></span><span className="bot-stage__smile" /></div>
                  : <div className="bot-stage__pending"><strong>#{activeRank}</strong></div>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
      {step >= 2 && <div className={`hybrid-medals__positions ${ranks.length === 4 ? 'hybrid-medals__positions--four' : ''} ${focusedRank != null ? `hybrid-medals__positions--zoom-${focusedPlace}` : ''}`}>
        {activeIndex >= 0 && <div key={spotlightPlace} className={`hybrid-medals__spotlight hybrid-medals__spotlight--${spotlightPlace}`} aria-hidden />}
        {ranks.map((rank, index) => {
          const student = step >= 4 + index * 2 ? stage.students.find((person) => person.rank === rank) : undefined
          return <MedalPosition key={rank} rank={rank} first={tier.rankFrom} student={student} active={index === activeIndex}
            shuffling={index === activeIndex && shuffling} celebrating={index === activeIndex && step >= 4 && step % 2 === 0 && !reducedMotion}
            reducedMotion={reducedMotion} tier={tier} />
        })}
      </div>}
      </>}
    </StageFrame>
  )
}

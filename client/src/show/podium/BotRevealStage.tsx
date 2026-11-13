import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Medal } from 'lucide-react'
import type confetti from 'canvas-confetti'
import { StudentAvatar } from '@/components/StudentAvatar'
import type { StageProps } from '@/show/contracts'
import { StageFrame } from '@/show/stages/StageFrame'
import { GOLD_CONFETTI, useConfettiCanvas } from '@/show/stages/confetti'
import { DecoyName } from '@/show/stages/DecoyName'
import { ShuffleName } from '@/show/stages/ShuffleName'
import type { PublicStudent, PublicTier } from '@/types'
import { ChampionFireworks } from './ChampionFireworks'
import './botStage.css'

function labelFor(rank: number, firstRank: number): string {
  if (firstRank !== 1) return `Rank #${rank}`
  return rank === 1 ? 'Champion' : rank === 2 ? '1st runner-up' : rank === 3 ? '2nd runner-up' : `${rank}th place`
}

function prizeFor(tier: PublicTier, rank: number): string {
  const entry = tier.podiumPrizes?.find((prize) => prize.rank === rank)
  return [entry?.prizeAmount ?? (tier.podiumPrizes === null ? tier.prizeAmount : ''), entry?.prize ?? (tier.podiumPrizes === null ? tier.prize : '')]
    .map((value) => value.trim()).filter(Boolean).join(' · ')
}

function celebrate(fire: (options: confetti.Options) => void): number[] {
  const count = 18
  return [
    window.setTimeout(() => fire({ particleCount: count, angle: 62, spread: 62, startVelocity: 65, ticks: 150, origin: { x: 0, y: 0.95 }, colors: GOLD_CONFETTI }), 250),
    window.setTimeout(() => fire({ particleCount: count, angle: 118, spread: 62, startVelocity: 65, ticks: 150, origin: { x: 1, y: 0.95 }, colors: GOLD_CONFETTI }), 250),
  ]
}

function HandWinner({ student, tier, reducedMotion }: { student: PublicStudent; tier: PublicTier; reducedMotion: boolean }) {
  const prize = prizeFor(tier, student.rank)
  return (
    <div className={`bot-hand-winner ${student.rank === 1 ? 'bot-hand-winner--gold' : ''}`}>
      <div className="bot-hand-winner__avatar"><StudentAvatar name={student.name} photoUrl={student.photoUrl} rank={student.rank} className="h-full w-full" /></div>
      <div className="bot-hand-winner__details">
        <span className="bot-hand-winner__place">{student.rank === 1 ? <Crown /> : <Medal />} {labelFor(student.rank, tier.rankFrom)}</span>
        <strong className="bot-hand-winner__name"><ShuffleName name={student.name} duration={900} reducedMotion={reducedMotion} /></strong>
        <span className="bot-hand-winner__school">{[student.school, student.city].filter(Boolean).join(' · ')}</span>
        {student.score != null && <span className="bot-hand-winner__score">Score {student.score}</span>}
        {prize && <span className="bot-hand-winner__prize">{prize}</span>}
      </div>
    </div>
  )
}

/** Visor shows rank only; the name shuffle and winner details appear above the open hand. */
export function BotRevealStage({ stage, step, reducedMotion }: StageProps) {
  const tier = stage.tier
  const { canvasRef, fire } = useConfettiCanvas()
  const revealRanks = useMemo(() => stage.revealRanks ?? Array.from({ length: stage.studentCount }, (_, i) => (tier?.rankTo ?? 0) - i), [stage.revealRanks, stage.studentCount, tier?.rankTo])
  const championOrder = tier?.podiumMode === 'hybrid' ? revealRanks.indexOf(tier.rankFrom) : -1
  const greetingStep = championOrder < 0 ? -1 : championOrder * 2 + 1
  const greeting = step === greetingStep
  const revealStep = greetingStep >= 0 && step > greetingStep ? step - 1 : step
  const group = stage.studentCount > 1 && revealStep > stage.studentCount * 2
  const activeIndex = revealStep > 0 && !group ? Math.floor((revealStep - 1) / 2) : -1
  const activeRank = revealRanks[activeIndex]
  const revealed = revealStep > 0 && revealStep % 2 === 0 && !group
  const student = revealed ? stage.students.find((person) => person.rank === activeRank) : undefined
  const allStudents = group ? revealRanks.map((rank) => stage.students.find((person) => person.rank === rank)).filter((person): person is PublicStudent => Boolean(person)) : []
  const timers = useRef<number[]>([])
  const prevStep = useRef(step)

  useEffect(() => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    if (step > prevStep.current && revealed && activeRank === 1 && !reducedMotion) timers.current = celebrate(fire)
    prevStep.current = step
    return () => timers.current.forEach(window.clearTimeout)
  }, [step, revealed, activeRank, reducedMotion, fire])

  if (!tier) return null
  const screenKey = greeting ? 'greeting' : group ? 'group' : step === 0 ? 'intro' : `rank-${activeRank}`
  const entering = step === 0 || greeting
  const championReveal = revealed && activeRank === tier.rankFrom

  return (
    <StageFrame accentColor={tier.color} className="bot-stage">
      {championReveal && <motion.div className="bot-stage__champion-light" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.9 }} aria-hidden />}
      {championReveal && <ChampionFireworks quality="low" reducedMotion={reducedMotion} />}
      <motion.div className="bot-stage__fly-in" style={{ transformOrigin: '22% 42%' }}
        initial={reducedMotion ? false : { x: '110vw', y: '20vh', rotate: 12, scale: 0.55, opacity: 0 }}
        animate={{ x: 0, y: 0, rotate: 0, scale: revealed ? 1.08 : 1, opacity: 1 }}
        transition={reducedMotion ? { duration: 0.1 } : { duration: entering ? 2.5 : 0.75, ease: entering ? [0.42, 0, 0.2, 1] : [0.16, 1, 0.3, 1] }}>
        <div className={`bot-stage__artwork ${reducedMotion ? 'bot-stage__artwork--still' : greeting ? 'bot-stage__artwork--greeting' : ''}`} aria-label="Robot presenting the winners">
          <img src="/bot-reveal.png" alt="" aria-hidden className="bot-stage__image" />
          {greeting && !reducedMotion && <div className="bot-stage__wave-lines" aria-hidden><i /><i /><i /></div>}
          <div className="bot-stage__face-overlay">
            <AnimatePresence mode="wait">
              <motion.div key={screenKey} className="bot-stage__screen-content"
                initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.04 }}
                transition={{ duration: reducedMotion ? 0.15 : 0.45 }}>
                {step === 0 || greeting ? (
                  <div className="bot-stage__expression" aria-label="The bot is ready to reveal the winners"><span className="bot-stage__eyes"><i /><i /></span><span className="bot-stage__smile" /></div>
                ) : group ? (
                  <div className="bot-stage__rank-list">{revealRanks.map((rank) => <span key={rank}>#{rank}</span>)}</div>
                ) : (
                  <div className="bot-stage__pending"><strong>#{activeRank}</strong></div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            {step > 0 && !greeting && (
              <motion.div key={group ? 'hand-group' : `hand-${activeRank}-${revealed}`} className={`bot-stage__hand-holo ${group ? 'bot-stage__hand-holo--group' : revealed ? 'bot-stage__hand-holo--revealed' : 'bot-stage__hand-holo--shuffling'}`}
                style={{ transformOrigin: '25% 95%' }}
                initial={reducedMotion ? false : { opacity: 0, y: revealed ? 60 : 24, scale: revealed ? 0.35 : 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.92 }}
                transition={{ duration: reducedMotion ? 0.15 : 0.45, delay: reducedMotion ? 0 : step === 1 ? 0.9 : 0 }}>
                {group ? (
                  <div className="bot-stage__hand-group">{allStudents.map((person) => <div key={person.id}><span>#{person.rank}</span><strong>{person.name}</strong>{person.score != null && <span>{person.score}</span>}</div>)}</div>
                ) : revealed && student ? (
                  <HandWinner student={student} tier={tier} reducedMotion={reducedMotion} />
                ) : (
                  <><span className="bot-stage__hand-label">Rank #{activeRank} · Shuffling</span><strong className="bot-stage__hand-name"><DecoyName reducedMotion={reducedMotion} /></strong></>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      <canvas ref={canvasRef} aria-hidden className="bot-stage__confetti pointer-events-none absolute inset-0 h-full w-full" />
    </StageFrame>
  )
}

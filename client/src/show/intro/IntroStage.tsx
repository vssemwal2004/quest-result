import type { ReactNode } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { CalendarDays, MapPin, Trophy } from 'lucide-react'
import { GlowDivider, Sparkle } from '../brand/GlowDivider'
import { OrgLockup } from '../brand/OrgLockup'
import { QuestLogo } from '../brand/QuestLogo'
import { LAYOUT, type StageProps } from '../contracts'
import { HandwrittenLines } from './HandwrittenLines'
import { RevealButton } from './RevealButton'

export interface IntroStageProps extends StageProps {
  /** Admin / preview screens get the Reveal button; the audience sees a waiting notice. */
  canControl: boolean
  /** True while the countdown runs (disables the CTA). */
  revealing: boolean
  onReveal: () => void
}

const EASE = [0.22, 1, 0.36, 1] as const

function Rise({ delay, className, children }: { delay: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.8, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/** "2026-10-16" → "Friday, 16 October 2026"; anything else is shown as typed. */
export function formatEventDate(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return value
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Highlights "Class XII students" (or similar) in gold, like the poster's sub-headline. */
function SubTagline({ text }: { text: string }) {
  const m = text.match(/\bclass\s+[ivxlcdm\d]+\b(?:\s+students?)?/i)
  const parts = m && m.index !== undefined ? [text.slice(0, m.index), m[0], text.slice(m.index + m[0].length)] : [text, '', '']
  return (
    <p
      className="font-display font-extrabold uppercase tracking-[0.06em] text-white"
      style={{ fontSize: 'calc(var(--u) * 1.4)', textShadow: '0 2px 14px rgba(2,10,36,0.7)' }}
    >
      {parts[0]}
      {parts[1] && <span className="text-gold-300">{parts[1]}</span>}
      {parts[2]}
    </p>
  )
}

/** "Results 2026" in glowing Orbitron; a trailing year is picked out in gold. */
function Edition({ text }: { text: string }) {
  const m = text.match(/^(.*?)(\s*\d{4})$/)
  const [label, year] = m ? [m[1], m[2]] : [text, '']
  return (
    <div className="flex items-center justify-center gap-[calc(var(--u)*1.6)]">
      <GlowDivider className="w-[calc(var(--u)*7)]" />
      <h2
        className="whitespace-nowrap font-tech font-black uppercase leading-none text-white"
        style={{
          fontSize: 'calc(var(--u) * 3.5)',
          letterSpacing: '0.16em',
          textShadow: '0 0 0.25em rgba(56,225,255,0.85), 0 0 0.8em rgba(31,94,255,0.7)',
        }}
      >
        {label}
        {year && (
          <span className="text-gold-300" style={{ textShadow: '0 0 0.25em rgba(255,210,63,0.8), 0 0 0.8em rgba(245,158,11,0.5)' }}>
            {year}
          </span>
        )}
      </h2>
      <GlowDivider className="w-[calc(var(--u)*7)]" />
    </div>
  )
}

function InfoChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span
      className="show-glass inline-flex items-center gap-[calc(var(--u)*0.6)] whitespace-nowrap rounded-full font-semibold text-white/90"
      style={{ fontSize: 'calc(var(--u) * 1.02)', padding: 'calc(var(--u) * 0.5) calc(var(--u) * 1.25)' }}
    >
      <span className="text-gold-300 [&>svg]:h-[1.15em] [&>svg]:w-[1.15em]">{icon}</span>
      {children}
    </span>
  )
}

function WaitingNotice() {
  return (
    <div
      className="show-glass inline-flex items-center gap-[calc(var(--u)*1)] rounded-full font-display font-extrabold uppercase tracking-[0.18em] text-white/90"
      style={{ fontSize: 'calc(var(--u) * 1.35)', padding: 'calc(var(--u) * 0.95) calc(var(--u) * 2.2)' }}
    >
      <span className="relative inline-flex h-[0.6em] w-[0.6em]">
        <span className="absolute inset-0 animate-ping rounded-full bg-cyan-glow/70" />
        <span className="relative inline-flex h-full w-full rounded-full bg-cyan-glow shadow-glow" />
      </span>
      <span>
        The reveal begins shortly
        <span className="wait-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </span>
    </div>
  )
}

/** Welcome screen: poster lockup on the left two-thirds (the robot stands on the right, in the 3D scene). */
export function IntroStage({ settings, totalWinners, canControl, revealing, onReveal }: IntroStageProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{
        padding: `calc(var(--u) * 2.4) calc(var(--u) * 4) ${LAYOUT.bottomRail + 12}px`,
      }}
    >
      <HandwrittenLines lines={settings.handwrittenLines} className="absolute right-[calc(var(--u)*6)] top-[calc(var(--u)*2.6)]" />

      <Rise delay={0.1} className="relative z-[1] self-start">
        <OrgLockup settings={settings} />
      </Rise>

      <main className="flex min-h-0 flex-1 items-center">
        <div className="flex w-[66%] flex-col items-center text-center">
          <QuestLogo size="xl" animated />

          <Rise delay={0.85} className="relative mt-[calc(var(--u)*0.6)]">
            <span className="tagline-ribbon" style={{ fontSize: 'calc(var(--u) * 2.05)' }}>
              {settings.tagline}
            </span>
            <Sparkle
              className="absolute -right-[calc(var(--u)*2.6)] top-1/2 -translate-y-1/2 animate-pulse text-gold-300 drop-shadow-[0_0_8px_rgba(255,210,63,0.9)]"
              style={{ width: 'calc(var(--u) * 1.6)', height: 'calc(var(--u) * 1.6)' }}
            />
          </Rise>

          {settings.subTagline && (
            <Rise delay={1} className="mt-[calc(var(--u)*1.3)]">
              <SubTagline text={settings.subTagline} />
            </Rise>
          )}

          <Rise delay={1.15} className="mt-[calc(var(--u)*1.7)]">
            <Edition text={settings.eventEdition} />
          </Rise>

          <Rise delay={1.3} className="mt-[calc(var(--u)*1.6)] flex flex-wrap items-center justify-center gap-[calc(var(--u)*0.8)]">
            {settings.eventDate && <InfoChip icon={<CalendarDays />}>{formatEventDate(settings.eventDate)}</InfoChip>}
            {settings.location && <InfoChip icon={<MapPin />}>{settings.location}</InfoChip>}
            {totalWinners > 0 && <InfoChip icon={<Trophy />}>{totalWinners} Winners</InfoChip>}
          </Rise>

          <Rise delay={1.5} className={clsx('mt-[calc(var(--u)*2.8)]', revealing && 'pointer-events-none')}>
            {canControl ? <RevealButton onClick={onReveal} disabled={revealing} /> : <WaitingNotice />}
          </Rise>
        </div>
      </main>
    </div>
  )
}

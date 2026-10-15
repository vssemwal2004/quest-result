import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, Medal } from 'lucide-react'
import { StudentAvatar } from '@/components/StudentAvatar'
import { u } from '@/show/stages/units'
import type { PublicStudent } from '@/types'
import { METAL, type SlotKind } from './slots'

/** Card widths in stage units (before `scale`); PodiumScene shrinks them when blocks get closer on screen. */
export const WINNER_CARD_WIDTH: Record<SlotKind, number> = { gold: 26, silver: 19.5, bronze: 19.5, fourth: 19.5 }

/** Shrink long names so most fit on one line (stage units). */
function nameSize(name: string, champion: boolean): number {
  const len = name.length
  if (len <= 16) return champion ? 2.5 : 2
  if (len <= 24) return champion ? 2.1 : 1.7
  return champion ? 1.8 : 1.5
}

/**
 * Floating winner card above a podium block: metallic-ring avatar, medal label, very large name, school.
 * Anchored at its bottom-center (the parent positions it at the block's projected top).
 */
export function WinnerCard({
  student,
  kind,
  label,
  scale,
  instant,
  reducedMotion,
  solo,
  prizeAmount,
  prize,
}: {
  student: PublicStudent
  kind: SlotKind
  label: string
  scale: number
  instant: boolean
  reducedMotion: boolean
  solo: boolean
  prizeAmount: string
  prize: string
}) {
  const metal = METAL[kind]
  const champion = kind === 'gold'
  const s = (n: number) => u(n * scale)
  const avatar = champion ? 6.6 : 5.4
  const Icon = champion ? Crown : Medal
  const school = [student.school, student.city].filter(Boolean).join(' · ')
  const hasPrize = Boolean(prizeAmount.trim() || prize.trim())
  const [open, setOpen] = useState(instant || reducedMotion || !solo)

  useEffect(() => {
    if (instant || reducedMotion || !solo) {
      setOpen(true)
      return
    }
    setOpen(false)
    const timer = window.setTimeout(() => setOpen(true), 650)
    return () => window.clearTimeout(timer)
  }, [student.id, instant, reducedMotion, solo])

  // The plain wrapper owns the anchor offset; framer-motion owns the inner transform.
  return (
    <div style={{ width: s(WINNER_CARD_WIDTH[kind]), transform: 'translate(-50%, -100%)' }}>
      {!open ? (
        <div
          className="qs-card-back relative flex flex-col items-center justify-center overflow-hidden border text-center"
          style={{ minHeight: s(champion ? 12 : 9), padding: s(1.2), borderRadius: s(1.8), borderColor: metal.glow, background: 'linear-gradient(160deg, #1643aa, #061b56 70%)', boxShadow: `0 0 ${s(2)} ${metal.glow}77` }}
        >
          <span className="font-tech font-black uppercase text-cyan-100" style={{ fontSize: s(1) }}>Rank #{student.rank}</span>
          <span className="font-display font-black text-white/75" style={{ fontSize: s(champion ? 2.2 : 1.7), marginTop: s(.8), letterSpacing: '.18em' }}>···· ····</span>
        </div>
      ) : (
      <motion.div
        className="relative flex flex-col items-center text-center"
        initial={instant || reducedMotion ? false : { opacity: 0, y: 35, rotateY: -65, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.9, transition: { duration: 0.3 } }}
        transition={{ type: 'spring', stiffness: 110, damping: 15, delay: instant || reducedMotion ? 0 : 0.1 }}
      >
        {/* baked metal glow behind the whole card (static gradient; the card moves with the 3D camera) */}
        <div
          aria-hidden
          className="absolute rounded-[50%]"
          style={{ inset: `${s(-3)} ${s(-4)}`, background: `radial-gradient(closest-side, ${metal.glow}66, ${metal.glow}00)` }}
        />
        <div
          className="relative z-10 rounded-full"
          style={{
            width: s(avatar),
            height: s(avatar),
            fontSize: s(avatar * 0.8),
            padding: s(0.36),
            background: metal.ring,
          }}
        >
          <StudentAvatar name={student.name} photoUrl={student.photoUrl} rank={student.rank} className="h-full w-full" ring="ring-navy-900" />
        </div>

        <div
          className="relative w-full"
          style={{
            marginTop: s(-avatar * 0.42),
            padding: s(0.14),
            borderRadius: s(1.8),
            background: metal.ring,
          }}
        >
          <div
            className="flex flex-col items-center"
            style={{
              borderRadius: s(1.66),
              padding: `${s(avatar * 0.42 + 0.7)} ${s(1.3)} ${s(1.2)}`,
              background: 'linear-gradient(170deg, rgba(20,70,214,.92) 0%, rgba(7,32,101,.96) 45%, rgba(4,20,69,.98) 100%)',
            }}
          >
            <span
              className="inline-flex items-center rounded-full font-display font-extrabold uppercase"
              style={{
                background: metal.ring,
                color: metal.ink,
                fontSize: s(champion ? 1.05 : 0.9),
                padding: `${s(0.3)} ${s(1)}`,
                gap: s(0.4),
                letterSpacing: '0.16em',
              }}
            >
              <Icon style={{ width: s(1.1), height: s(1.1) }} strokeWidth={2.4} />
              {label}
            </span>
            <h3
              className="line-clamp-2 break-words font-display font-extrabold text-white"
              style={{ fontSize: s(nameSize(student.name, champion)), lineHeight: 1.08, marginTop: s(0.7), textShadow: `0 0 ${s(1.4)} ${metal.glow}66` }}
            >
              {student.name}
            </h3>
            <p
              className="line-clamp-2 font-sans font-medium text-white/80"
              style={{ fontSize: s(champion ? 1.1 : 0.98), lineHeight: 1.25, marginTop: s(0.45) }}
            >
              {school}
            </p>
            {solo && student.score != null && (
              <span className="font-tech font-bold text-cyan-200" style={{ fontSize: s(0.9), marginTop: s(0.6) }}>
                Score {student.score}
              </span>
            )}
            {solo && hasPrize && (
              <div className="flex w-full flex-col items-center border-t border-white/20 text-center" style={{ marginTop: s(0.9), paddingTop: s(0.8), gap: s(0.25) }}>
                <span className="font-tech font-bold uppercase text-white/60" style={{ fontSize: s(0.72), letterSpacing: '0.12em' }}>
                  Tier prizes
                </span>
                {prizeAmount.trim() && (
                  <span className="font-display font-black text-gold-300" style={{ fontSize: s(1.35), lineHeight: 1.1 }}>
                    {prizeAmount}
                  </span>
                )}
                {prize.trim() && (
                  <span className="font-sans font-semibold text-white/85" style={{ fontSize: s(0.82), lineHeight: 1.2 }}>
                    {prize}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
      )}
    </div>
  )
}

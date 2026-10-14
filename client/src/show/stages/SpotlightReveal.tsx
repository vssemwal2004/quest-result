import { AnimatePresence, motion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { StudentAvatar } from '@/components/StudentAvatar'
import type { PublicStudent, PublicTier, Quality } from '@/types'
import { GlowText } from './GlowText'
import { CARD, CARD_GAP, StudentCard } from './StudentCard'
import { TierHeader } from './TierHeader'
import { accent, clamp, cssVars, u, useMeasure, useStageUnit } from './units'
import { columnCount, rowsThatFit } from './wallLayout'

/**
 * `spotlight` tier, step k ≥ 1: the k-th student (reveal order) gets the hero card,
 * the previous k-1 move to the "wall of fame" (newest first).
 */
export function SpotlightReveal({
  tier,
  students,
  studentCount,
  step,
  quality,
  reducedMotion,
}: {
  tier: PublicTier
  students: PublicStudent[]
  studentCount: number
  step: number
  quality: Quality
  reducedMotion: boolean
}) {
  const k = clamp(step, 0, studentCount)
  const revealed = students.slice(0, k)
  const hero = revealed[k - 1]
  const wall = revealed.slice(0, Math.max(0, k - 1)).reverse()

  return (
    <div className="flex h-full flex-col" style={{ gap: u(1.6) }}>
      <TierHeader tier={tier} studentCount={studentCount} right={<Progress k={k} total={studentCount} />} />
      <div className="flex min-h-0 flex-1" style={{ gap: u(3) }}>
        <div className="relative min-w-0" style={{ flex: '1.45 1 0%' }}>
          {quality !== 'low' && !reducedMotion && <HeroBackdrop step={k} />}
          <AnimatePresence>
            {hero && (
              <motion.div
                key={hero.id}
                className="absolute inset-0 grid place-items-center"
                style={{ perspective: u(110) }}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, rotateY: -75, scale: 0.55, z: -400 }}
                animate={{ opacity: 1, rotateY: 0, scale: 1, z: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: '35%', scale: 0.55, transition: { duration: 0.45, ease: [0.4, 0, 1, 1] } }}
                transition={{ type: 'spring', stiffness: 80, damping: 15, mass: 1.1 }}
              >
                <HeroCard student={hero} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <WallOfFame students={wall} upcoming={Math.max(0, studentCount - k)} />
      </div>
    </div>
  )
}

function Progress({ k, total }: { k: number; total: number }) {
  return (
    <span
      className="inline-flex items-baseline rounded-full border border-white/20 bg-white/10 font-display font-black text-white"
      style={{ fontSize: u(1.6), padding: `${u(0.4)} ${u(1.4)}`, gap: u(0.5) }}
    >
      <span style={{ color: accent(1), textShadow: `0 0 ${u(0.8)} ${accent(0.8)}` }}>{k}</span>
      <span className="text-white/50" style={{ fontSize: u(1.1) }}>
        / {total}
      </span>
    </span>
  )
}

/** Light burst + slowly rotating rays behind the hero; the burst replays on every reveal. */
function HeroBackdrop({ step }: { step: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        className="qs-spin absolute aspect-square rounded-full opacity-50"
        style={{
          width: u(70),
          background: `repeating-conic-gradient(from 0deg, ${accent(0.35)} 0deg 5deg, transparent 5deg 20deg)`,
          WebkitMaskImage: 'radial-gradient(closest-side, #000 15%, transparent 100%)',
          maskImage: 'radial-gradient(closest-side, #000 15%, transparent 100%)',
          ...cssVars({ '--t': '60s' }),
        }}
      />
      <div
        key={step}
        className="qs-burst absolute aspect-square rounded-full"
        style={{ width: u(36), background: `radial-gradient(circle, #ffffff 0%, ${accent(0.75)} 25%, ${accent(0)} 70%)` }}
      />
    </div>
  )
}

function HeroCard({ student }: { student: PublicStudent }) {
  const long = student.name.length > 22
  return (
    <div className="relative w-full" style={{ maxWidth: u(64) }}>
      {/* baked accent halo + drop shadow (static gradients, no blurred box-shadow) */}
      <div aria-hidden className="absolute rounded-[50%]" style={{ inset: `${u(-4)} ${u(-6)}`, background: `radial-gradient(closest-side, ${accent(0.4)}, ${accent(0)})` }} />
      <div
        aria-hidden
        className="absolute rounded-[50%]"
        style={{ inset: `${u(3)} ${u(-1)} ${u(-4)}`, background: 'radial-gradient(closest-side, rgba(2,10,36,.65), rgba(2,10,36,0))' }}
      />
      <div
        className="absolute inset-0"
        style={{
          borderRadius: u(2.6),
          background: `linear-gradient(135deg, #ffffff 0%, ${accent(1)} 22%, ${accent(0.15)} 50%, ${accent(0.9)} 100%)`,
        }}
      />
      <div
        className="absolute overflow-hidden"
        style={{
          inset: 3,
          borderRadius: `calc(${u(2.6)} - 3px)`,
          background: 'linear-gradient(160deg, rgba(31,94,255,.55) 0%, rgba(10,42,133,.9) 40%, rgba(4,20,69,.97) 100%)',
        }}
      >
        <div className="absolute inset-x-0 top-0 h-2/5" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.14), transparent)' }} />
        <div className="qs-sweep absolute inset-y-0 left-0 w-1/4" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent)' }} />
      </div>

      <div className="relative flex items-center" style={{ padding: `${u(3)} ${u(3.4)}`, gap: u(3) }}>
        <div className="relative shrink-0" style={{ width: u(17), height: u(17), fontSize: u(17 * 0.8) }}>
          <div
            className="qs-spin absolute rounded-full"
            style={{
              inset: u(-0.7),
              background: `conic-gradient(from 0deg, ${accent(0)}, ${accent(1)}, #ffffff, ${accent(1)}, ${accent(0)} 70%, ${accent(0)})`,
              ...cssVars({ '--t': '5s' }),
            }}
          />
          <div aria-hidden className="absolute rounded-full" style={{ inset: u(-3), background: `radial-gradient(closest-side, ${accent(0.6)}, ${accent(0)})` }} />
          <div className="absolute inset-0 rounded-full" style={{ padding: u(0.3), background: '#041445' }}>
            <StudentAvatar name={student.name} photoUrl={student.photoUrl} rank={student.rank} className="h-full w-full" ring="ring-white/40" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline" style={{ gap: u(1) }}>
            <span className="font-tech font-semibold uppercase text-white/70" style={{ fontSize: u(1.2), letterSpacing: '0.4em' }}>
              Rank
            </span>
            <GlowText
              className="font-tech font-black leading-none"
              gradient={`linear-gradient(180deg, #ffffff 20%, ${accent(1)} 100%)`}
              glow={`0 0 ${u(1.2)} ${accent(0.8)}`}
              style={{ fontSize: u(7) }}
            >
              #{student.rank}
            </GlowText>
          </div>
          <h2
            className="line-clamp-2 break-words font-display font-extrabold text-white"
            style={{ fontSize: u(long ? 3.1 : 3.9), lineHeight: 1.08, marginTop: u(1), textShadow: `0 ${u(0.3)} ${u(1.2)} rgba(2,10,36,.8)` }}
          >
            {student.name}
          </h2>
          <p className="line-clamp-2 font-sans font-medium text-white/85" style={{ fontSize: u(1.7), lineHeight: 1.25, marginTop: u(0.9) }}>
            {student.school}
          </p>
          {student.city && (
            <p
              className="flex items-center font-sans font-semibold uppercase"
              style={{ fontSize: u(1.25), marginTop: u(0.7), gap: u(0.5), letterSpacing: '0.12em', color: '#8fe9ff' }}
            >
              <MapPin style={{ width: u(1.4), height: u(1.4) }} />
              {student.city}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Previously revealed students (newest first). Shows dim placeholders while it is still empty. */
function WallOfFame({ students, upcoming }: { students: PublicStudent[]; upcoming: number }) {
  const unitPx = useStageUnit()
  const [ref, size] = useMeasure<HTMLDivElement>()
  const labelPx = 3 * unitPx
  const cols = columnCount(size.width, unitPx, 'sm', 3)
  const rows = rowsThatFit(Math.max(0, size.height - labelPx), unitPx, 'sm')
  const capacity = size.width > 0 ? cols * rows : 0
  const overflow = students.length > capacity
  const shown = overflow ? students.slice(0, Math.max(0, capacity - 1)) : students
  const placeholders = students.length === 0 ? Math.min(capacity, upcoming) : 0
  const gapPx = CARD_GAP * unitPx
  const cardWidth = cols > 0 ? (size.width - (cols - 1) * gapPx) / cols : 0

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <div className="flex items-center font-tech font-bold uppercase text-white/75" style={{ height: labelPx, gap: u(0.8), fontSize: u(1.05), letterSpacing: '0.35em' }}>
        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${accent(0.8)})` }} />
        Wall of Fame
        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${accent(0.8)}, transparent)` }} />
      </div>
      {/* Mount the list only once measured, so cards already revealed don't all animate in at once. */}
      {capacity > 0 && (
        <div className="flex flex-wrap content-start" style={{ gap: u(CARD_GAP) }}>
          {/* Only the newest card animates (others just shift); no layout projection, so no per-frame reflow. */}
          {shown.map((s, i) => (
            <motion.div
              key={s.id}
              initial={i === 0 ? { opacity: 0, scale: 0.85, x: -40 } : false}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.35 }}
              style={{ width: cardWidth }}
            >
              <StudentCard student={s} size="sm" />
            </motion.div>
          ))}
          {overflow && (
            <div
              className="grid place-items-center rounded-2xl border border-white/15 bg-white/5 font-tech font-bold text-white/80"
              style={{ width: cardWidth, height: u(CARD.sm.height), fontSize: u(1.4) }}
            >
              +{students.length - shown.length} more
            </div>
          )}
          {Array.from({ length: placeholders }, (_, i) => (
            <div
              key={`p${i}`}
              className="rounded-2xl border border-dashed"
              style={{ width: cardWidth, height: u(CARD.sm.height), borderColor: accent(0.25), background: accent(0.04) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

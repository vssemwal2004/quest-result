import { AnimatePresence, motion } from 'framer-motion'
import type { StageProps } from '@/show/contracts'
import { SpotlightReveal } from './SpotlightReveal'
import { StageFrame } from './StageFrame'
import { StudentWall } from './StudentWall'
import { TierHeader } from './TierHeader'
import { TierTitleCard } from './TierTitleCard'
import { u } from './units'

/**
 * Tier stage for styles scroll | grid | spotlight (podium has its own renderer).
 * step 0 → title card; step ≥ 1 → list (scroll/grid) or the first `step` students (spotlight).
 * What to show is decided from `step` only; `stage.students` may be spoiler-filtered.
 */
export function TierStage({ stage, step, settings, quality, reducedMotion }: StageProps) {
  const tier = stage.tier
  if (!tier) return null
  const showTitle = step <= 0

  return (
    <StageFrame accentColor={tier.color}>
      <AnimatePresence mode="wait">
        {showTitle ? (
          <motion.div
            key="title"
            className="absolute inset-0"
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.18, transition: { duration: 0.5, ease: [0.5, 0, 0.75, 0] } }}
          >
            <TierTitleCard tier={tier} studentCount={stage.studentCount} quality={quality} reducedMotion={reducedMotion} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            className="absolute inset-0 flex flex-col"
            style={{ padding: `${u(1.6)} ${u(3)} ${u(1.2)}`, gap: u(1.6) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
          >
            {tier.style === 'spotlight' ? (
              <SpotlightReveal
                tier={tier}
                students={stage.students}
                studentCount={stage.studentCount}
                step={step}
                quality={quality}
                reducedMotion={reducedMotion}
              />
            ) : (
              <>
                <TierHeader tier={tier} studentCount={stage.studentCount} />
                <StudentWall
                  students={stage.students}
                  mode={tier.style === 'scroll' ? 'scroll' : 'grid'}
                  speed={settings.autoScrollSpeed}
                  reducedMotion={reducedMotion}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </StageFrame>
  )
}

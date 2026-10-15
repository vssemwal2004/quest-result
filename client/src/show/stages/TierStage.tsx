import { AnimatePresence, motion } from 'framer-motion'
import type { StageProps } from '@/show/contracts'
import { gridPageBounds, gridPageForStep } from '@/show/gridPages'
import { CardGrid } from './CardGrid'
import { SpotlightReveal } from './SpotlightReveal'
import { StageFrame } from './StageFrame'
import { TierHeader } from './TierHeader'
import { TierTitleCard } from './TierTitleCard'
import { u } from './units'

/**
 * Tier stage for grid | spotlight (podium has its own renderer).
 * step 0 → title; each grid page then gets a cycling-names step and a whole-page reveal.
 * What to show is decided from `step` only; `stage.students` may be spoiler-filtered.
 */
export function TierStage({ stage, step, quality, reducedMotion }: StageProps) {
  const tier = stage.tier
  if (!tier) return null
  const showTitle = step <= 0
  const gridRevealed = step > 0 && step % 2 === 0
  const page = gridPageForStep(stage, step)
  const gridPage = gridPageBounds(stage, page)

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
                studentRanks={stage.studentRanks ?? []}
                step={step}
                quality={quality}
                reducedMotion={reducedMotion}
              />
            ) : (
              <>
                <TierHeader tier={tier} studentCount={stage.studentCount} />
                <CardGrid
                  students={gridRevealed ? stage.students.slice(gridPage.start, gridPage.end) : []}
                  ranks={(stage.studentRanks ?? stage.students.map((student) => student.rank)).slice(gridPage.start, gridPage.end)}
                  page={page}
                  pageCount={stage.pageEnds?.length ?? 1}
                  revealed={gridRevealed}
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

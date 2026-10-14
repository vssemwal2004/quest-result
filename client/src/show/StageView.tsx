import { lazy, Suspense } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { FinaleStage } from '@/show/stages/FinaleStage'
import { TierStage } from '@/show/stages/TierStage'
import type { StageProps } from './contracts'
import { IntroStage } from './intro/IntroStage'
import { ShowErrorBoundary } from './ShowErrorBoundary'

// The podium is the only stage that pulls in three.js; load it on demand (it is prefetched by
// ShowPage once the intro is up, so it is warm long before the Champions are revealed).
const PodiumStage = lazy(() => import('@/show/podium/PodiumStage').then((m) => ({ default: m.PodiumStage })))
export const prefetchPodium = () => void import('@/show/podium/PodiumStage').catch(() => undefined)

// Zoom-through: the old stage rushes past the camera, the new one settles in from depth.
// Transform + opacity only (a full-screen blur filter would cost a pass every frame of the transition).
const CINEMATIC: Variants = {
  enter: { opacity: 0, scale: 0.92 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, scale: 1.12, transition: { duration: 0.3, ease: [0.55, 0, 0.8, 0.4] } },
}

const FADE: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.35 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
}

export interface StageViewProps extends StageProps {
  canControl: boolean
  revealing: boolean
  onReveal: () => void
}

function StageContent({ canControl, revealing, onReveal, ...props }: StageViewProps) {
  const { stage } = props
  if (stage.type === 'intro') return <IntroStage {...props} canControl={canControl} revealing={revealing} onReveal={onReveal} />
  if (stage.type === 'finale') return <FinaleStage {...props} />
  if (stage.tier?.style === 'podium')
    return (
      <Suspense fallback={null}>
        <PodiumStage {...props} />
      </Suspense>
    )
  return <TierStage {...props} />
}

/** Current stage with a cinematic transition between stages (keyed by stage.key, so steps don't re-trigger it). */
export function StageView(props: StageViewProps) {
  const simple = props.reducedMotion || props.quality === 'low'
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={props.stage.key}
        className="absolute inset-0 z-10"
        variants={simple ? FADE : CINEMATIC}
        initial="enter"
        animate="center"
        exit="exit"
      >
        {/* A crashing stage renderer leaves the background on screen instead of an error. */}
        <ShowErrorBoundary resetKey={props.stage.key} fallback={null}>
          <StageContent {...props} />
        </ShowErrorBoundary>
      </motion.div>
    </AnimatePresence>
  )
}

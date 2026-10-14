import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { QuestLogo } from '../brand/QuestLogo'
import { CssBackground } from '../scene/CssBackground'

/**
 * Instant first paint: pure CSS (no three.js), same palette as the 3D scene so the exit cross-fade is
 * seamless. Covers the screen until data has arrived AND the scene has rendered its first frames.
 * "Connecting" only appears if the data is genuinely slow, never as a flash.
 */
export function ShowLoader({ waitingForData }: { waitingForData: boolean }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!waitingForData) return
    const id = window.setTimeout(() => setSlow(true), 1200)
    return () => window.clearTimeout(id)
  }, [waitingForData])

  return (
    <motion.div
      className="show-loader"
      initial={false}
      exit={{ opacity: 0, transition: { duration: 0.7, ease: [0.4, 0, 0.2, 1] } }}
      role="status"
      aria-label="Loading AI Quest results"
    >
      <CssBackground accent="#38e1ff" />
      <div className="relative flex flex-col items-center gap-[calc(var(--u)*2.2)]">
        <QuestLogo size="lg" />
        <div className="show-loader__track">
          <div className="show-loader__bar" />
        </div>
        <motion.div
          className="h-[1.5em] font-tech font-semibold uppercase tracking-[0.42em] text-cyan-glow/80"
          style={{ fontSize: 'calc(var(--u) * 0.95)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: slow && waitingForData ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          Connecting
          <span className="wait-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </motion.div>
      </div>
    </motion.div>
  )
}

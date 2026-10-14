import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const TICK_MS = 950

/**
 * Full-screen 3-2-1 before the first reveal: numerals punch in with a ring burst over a CSS warp
 * tunnel; at zero a light flash covers the stage change. `onComplete` fires once at zero; the parent
 * unmounts the overlay when the next stage is on screen (the exit fade reveals it).
 */
export function Countdown({ onComplete, from = 3 }: { onComplete: () => void; from?: number }) {
  const [n, setN] = useState(from)
  const complete = useRef(onComplete)
  complete.current = onComplete

  useEffect(() => {
    if (n === 0) {
      complete.current()
      return
    }
    const id = window.setTimeout(() => setN(n - 1), TICK_MS)
    return () => window.clearTimeout(id)
  }, [n])

  return (
    <motion.div
      className="countdown"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeOut' } }}
      transition={{ duration: 0.35 }}
      role="status"
      aria-live="assertive"
    >
      <div className="countdown__dim" />
      <div className="countdown__warp" />
      <div className="countdown__label">Revealing the winners</div>

      <AnimatePresence>
        {n > 0 && (
          <motion.div
            key={`ring-${n}`}
            className="countdown__ring"
            style={{ gridArea: '1 / 1' }}
            initial={{ scale: 0.35, opacity: 1 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: TICK_MS / 1000, ease: [0.15, 0.7, 0.3, 1] }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {n > 0 && (
          <motion.div
            key={n}
            className="countdown__num"
            style={{ gridArea: '1 / 1' }}
            initial={{ scale: 2.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.55, opacity: 0, transition: { duration: 0.25, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          >
            {n}
          </motion.div>
        )}
      </AnimatePresence>

      {n === 0 && (
        <motion.div className="countdown__flash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }} />
      )}
    </motion.div>
  )
}

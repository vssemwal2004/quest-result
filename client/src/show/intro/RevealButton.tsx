import { motion, useMotionValue, useSpring } from 'framer-motion'
import { ChevronsRight, Sparkles } from 'lucide-react'
import type { PointerEvent } from 'react'

const SPRING = { stiffness: 220, damping: 18, mass: 0.6 }

/** The hero CTA: bevelled gold pill with shine sweep, pulsing rings, halo and a 3D tilt that follows the pointer. */
export function RevealButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const rotateX = useSpring(rx, SPRING)
  const rotateY = useSpring(ry, SPRING)

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 16)
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 22)
  }
  const reset = () => {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.button
      type="button"
      className="reveal-btn"
      style={{ rotateX, rotateY, transformPerspective: 700, fontSize: 'calc(var(--u) * 1.65)' }}
      disabled={disabled}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onClick={(e) => {
        e.currentTarget.blur()
        onClick()
      }}
      whileHover={{ scale: 1.045 }}
      whileTap={{ scale: 0.97 }}
      animate={disabled ? { scale: 0.96, opacity: 0.6 } : { scale: 1, opacity: 1 }}
    >
      <span className="reveal-btn__halo" aria-hidden />
      <span className="reveal-btn__ring" aria-hidden />
      <span className="reveal-btn__ring" aria-hidden />
      <span className="reveal-btn__ring" aria-hidden />
      <span className="reveal-btn__face">
        <span className="reveal-btn__icon" aria-hidden>
          <Sparkles style={{ width: '1.05em', height: '1.05em' }} strokeWidth={2.4} />
        </span>
        Reveal Results
        <ChevronsRight aria-hidden style={{ width: '1.1em', height: '1.1em', marginLeft: '-0.2em' }} strokeWidth={3} />
        <span className="reveal-btn__shine" aria-hidden />
      </span>
    </motion.button>
  )
}

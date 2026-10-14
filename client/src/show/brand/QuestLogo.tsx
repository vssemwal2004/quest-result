import clsx from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import { Sparkle } from './GlowDivider'
import './questLogo.css'

export type QuestLogoSize = 'sm' | 'md' | 'lg' | 'xl'

const WORDS = [
  { text: 'AI', variant: 'ai' },
  { text: 'Quest', variant: 'quest' },
] as const

/**
 * The poster lockup in pure HTML/CSS: chunky italic electric-blue "AI" with a circuit texture and
 * gold "Quest", each letter a 2-layer stack (extrusion → face) so it stays crisp at any size and
 * costs nothing per frame once painted. `animated` adds the rising-letter entrance and star glints.
 */
export function QuestLogo({
  size = 'lg',
  className,
  animated = false,
}: {
  size?: QuestLogoSize
  className?: string
  animated?: boolean
}) {
  const reduced = useReducedMotion() ?? false
  const rise = animated && !reduced
  let index = 0
  return (
    <span className={clsx('ql', `ql--${size}`, className)} role="img" aria-label="AI Quest">
      {WORDS.map((word) => (
        <span key={word.variant} className={`ql-word ql-word--${word.variant}`} aria-hidden>
          {Array.from(word.text).map((ch) => {
            const i = index++
            return (
              <motion.span
                key={i}
                className="ql-ch"
                initial={rise ? { opacity: 0, y: '0.6em', rotateX: -80, scale: 0.82 } : false}
                animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.075, type: 'spring', stiffness: 160, damping: 15, mass: 0.9 }}
              >
                <span className="ql-depth">{ch}</span>
                <span className="ql-face">{ch}</span>
              </motion.span>
            )
          })}
        </span>
      ))}
      {animated && (
        <>
          <Sparkle className="ql-glint ql-glint--ai" />
          <Sparkle className="ql-glint ql-glint--quest" />
        </>
      )}
    </span>
  )
}

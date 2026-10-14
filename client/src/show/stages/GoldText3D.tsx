import clsx from 'clsx'
import type { CSSProperties, ReactNode } from 'react'

/** Stacked text-shadows (em-based so they scale with font-size) give the poster's chunky gold extrusion. */
const EXTRUSION = [
  '0 0.012em 0 #f2a20c',
  '0 0.024em 0 #e08e08',
  '0 0.036em 0 #c97a06',
  '0 0.048em 0 #b26a05',
  '0 0.06em 0 #9a5a04',
  '0 0.072em 0 #7d4703',
  '0 0.1em 0.06em rgba(2,10,36,.55)',
  '0 0.18em 0.35em rgba(2,10,36,.5)',
].join(', ')

/**
 * Poster-style 3D gold lettering. The extruded back layer and the gradient face are separate
 * because text-shadow cannot be combined with background-clip:text on the same element.
 */
export function GoldText3D({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={clsx('relative inline-block', className)} style={style}>
      <span aria-hidden className="absolute inset-0" style={{ color: '#f59e0b', textShadow: EXTRUSION, WebkitTextStroke: '0.02em #0a2a85' }}>
        {children}
      </span>
      <span className="text-gold-gradient relative">{children}</span>
    </span>
  )
}

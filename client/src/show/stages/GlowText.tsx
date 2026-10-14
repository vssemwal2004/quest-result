import clsx from 'clsx'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Gradient-filled text with a glow. `background-clip: text` cannot carry a text-shadow, and a CSS
 * `filter: drop-shadow` re-rasterises on every transform change, so the glow lives on a static
 * transparent-text twin behind the gradient face.
 */
export function GlowText({
  children,
  gradient,
  glow,
  className,
  style,
}: {
  children: ReactNode
  gradient: string
  /** CSS text-shadow list for the glow layer. */
  glow: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <span className={clsx('relative inline-block', className)} style={style}>
      <span aria-hidden className="absolute inset-0" style={{ color: 'transparent', textShadow: glow }}>
        {children}
      </span>
      <span className="relative" style={{ background: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
        {children}
      </span>
    </span>
  )
}

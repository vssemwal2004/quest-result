import clsx from 'clsx'
import type { CSSProperties } from 'react'
import './questLogo.css'

/** Hairline that fades in from both ends with a soft glow; `color` defaults to cyan. */
export function GlowDivider({ color, className }: { color?: string; className?: string }) {
  return <div className={clsx('glow-divider', className)} style={color ? ({ '--glow': color } as CSSProperties) : undefined} aria-hidden />
}

/** Four-point sparkle like the stars scattered on the poster. */
export function Sparkle({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path d="M12 0c.9 6.2 5.8 11.1 12 12-6.2.9-11.1 5.8-12 12-.9-6.2-5.8-11.1-12-12C6.2 11.1 11.1 6.2 12 0Z" fill="currentColor" />
    </svg>
  )
}

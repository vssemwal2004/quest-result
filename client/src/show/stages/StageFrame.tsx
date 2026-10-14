import clsx from 'clsx'
import type { ReactNode } from 'react'
import { LAYOUT } from '@/show/contracts'
import { U_CSS, cssVars, hexToRgbTriplet } from './units'
import './stages.css'

/**
 * Transparent content box between the shell's TopBar and progress rail.
 * Provides the `--u` scale unit and the tier accent (`--accent-rgb`) to everything inside.
 * `isolate` keeps internal z-indices (e.g. drei <Html> cards) from escaping above the shell HUD.
 */
export function StageFrame({
  accentColor = '#38e1ff',
  className,
  children,
}: {
  accentColor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={clsx('pointer-events-none absolute inset-x-0 isolate overflow-hidden', className)}
      style={{
        top: LAYOUT.topBar,
        bottom: LAYOUT.bottomRail,
        ...cssVars({ '--u': U_CSS, '--accent-rgb': hexToRgbTriplet(accentColor) }),
      }}
    >
      {children}
    </div>
  )
}

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import clsx from 'clsx'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let openCount = 0

function visibleFocusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
}

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** When false, Esc / backdrop clicks do nothing (e.g. while saving). */
  dismissible?: boolean
  /** Element to focus on open; defaults to the first focusable control in the body. */
  initialFocusRef?: RefObject<HTMLElement>
  /** Extra content rendered between the header and the body (e.g. a live preview). */
  hero?: ReactNode
}

type Variant = { kind: 'modal'; size: 'sm' | 'md' | 'lg' | 'xl' } | { kind: 'drawer' }

const MODAL_WIDTH = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const

function Panel({
  variant,
  onClose,
  title,
  description,
  children,
  footer,
  hero,
  dismissible = true,
  initialFocusRef,
}: OverlayProps & { variant: Variant }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  // Focus management + scroll lock for the lifetime of the panel.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const target = initialFocusRef?.current ?? visibleFocusables(bodyRef.current)[0] ?? panelRef.current
    target?.focus({ preventScroll: true })
    openCount++
    document.body.style.overflow = 'hidden'
    return () => {
      openCount--
      if (openCount === 0) document.body.style.overflow = ''
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [initialFocusRef])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (dismissible) onClose()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    e.stopPropagation()
    const nodes = visibleFocusables(panelRef.current)
    if (nodes.length === 0) {
      e.preventDefault()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const isDrawer = variant.kind === 'drawer'

  return (
    <div className={clsx('fixed inset-0 z-50 flex', isDrawer ? 'justify-end' : 'items-center justify-center p-4')}>
      <motion.div
        className="absolute inset-0 bg-navy-950/75 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={clsx(
          'glass-strong relative flex flex-col outline-none',
          isDrawer
            ? 'h-full w-full max-w-xl border-y-0 border-r-0 sm:rounded-l-2xl'
            : clsx('max-h-[calc(100dvh-2rem)] w-full rounded-2xl', MODAL_WIDTH[variant.size]),
        )}
        initial={isDrawer ? { x: '100%' } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={isDrawer ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
        exit={isDrawer ? { x: '100%' } : { opacity: 0, y: 8, scale: 0.98 }}
        transition={isDrawer ? { type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.32 } : { duration: 0.2 }}
      >
        <header className="flex items-start gap-4 border-b border-white/10 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-extrabold tracking-tight text-white">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-white/60">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            className="-mr-2 rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        {hero}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>
  )
}

function Overlay(props: OverlayProps & { variant: Variant }) {
  return createPortal(<AnimatePresence>{props.open && <Panel {...props} />}</AnimatePresence>, document.body)
}

/** Centered dialog with focus trap, Esc to close and focus restore. */
export function Modal({ size = 'md', ...props }: OverlayProps & { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return <Overlay {...props} variant={{ kind: 'modal', size }} />
}

/** Right-side sheet; same accessibility behaviour as Modal. */
export function Drawer(props: OverlayProps) {
  return <Overlay {...props} variant={{ kind: 'drawer' }} />
}

/** True while any Modal/Drawer is open — global keyboard shortcuts should stand down. */
export function isOverlayOpen(): boolean {
  return openCount > 0
}

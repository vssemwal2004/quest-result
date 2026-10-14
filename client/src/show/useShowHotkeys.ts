import { useCallback, useEffect, useRef } from 'react'

export interface ShowHotkeyHandlers {
  next: () => void
  prev: () => void
  toggleFullscreen: () => void
  toggleHud: () => void
}

// Presentation clickers send PageDown / PageUp.
const NEXT_KEYS = new Set(['ArrowRight', ' ', 'PageDown', 'Enter'])
const PREV_KEYS = new Set(['ArrowLeft', 'PageUp', 'Backspace'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Keyboard / clicker control for the show. */
export function useShowHotkeys(handlers: ShowHotkeyHandlers) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      // A focused button already turns Enter/Space into a click.
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) return

      const nav = NEXT_KEYS.has(e.key) ? 'next' : PREV_KEYS.has(e.key) ? 'prev' : null
      if (nav) {
        e.preventDefault()
        if (!e.repeat) ref.current[nav]()
        return
      }
      if (e.key === 'f' || e.key === 'F') ref.current.toggleFullscreen()
      else if (e.key === 'h' || e.key === 'H') ref.current.toggleHud()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Wraps navigation callbacks with one shared time lock so a double press never skips a reveal. */
export function useNavLock(ms = 350) {
  const lockedUntil = useRef(0)
  return useCallback(
    (fn: () => void) => {
      const now = performance.now()
      if (now < lockedUntil.current) return
      lockedUntil.current = now + ms
      fn()
    },
    [ms],
  )
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  else void document.documentElement.requestFullscreen?.().catch(() => undefined)
}

import { useEffect, useState } from 'react'

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TICK_MS = 55

function masked(chars: string[]): string {
  return chars.map((ch) => /\s/.test(ch) ? ch : '·').join('')
}

/** A restrained decode: only the next letter flickers while the rest stay masked. */
export function ShuffleName({
  name,
  duration = 1100,
  delay = 0,
  pending = false,
  instant = false,
  reducedMotion = false,
}: {
  name?: string
  duration?: number
  delay?: number
  pending?: boolean
  instant?: boolean
  reducedMotion?: boolean
}) {
  const [shown, setShown] = useState(() => pending ? '···· ····' : instant || reducedMotion ? name ?? '' : masked([...(name ?? '')]))
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (pending) {
      setShown('···· ····')
      setFlash(false)
      return
    }
    const source = name ?? ''
    if (instant || reducedMotion || !source) {
      setShown(source)
      setFlash(false)
      return
    }

    const chars = [...source]
    const total = Math.max(TICK_MS, duration)
    let elapsed = 0
    let interval: number | null = null
    let flashTimeout: number | null = null
    setShown(masked(chars))
    setFlash(false)

    const tick = () => {
      elapsed = Math.min(total, elapsed + TICK_MS)
      const locked = Math.floor(chars.length * elapsed / total)
      const next = chars.findIndex((ch, index) => index >= locked && !/\s/.test(ch))
      setShown(chars.map((ch, index) => {
        if (/\s/.test(ch) || index < locked) return ch
        return index === next ? LETTERS[Math.floor(Math.random() * LETTERS.length)] : '·'
      }).join(''))
      if (elapsed >= total) {
        setShown(source)
        setFlash(true)
        if (interval !== null) window.clearInterval(interval)
        flashTimeout = window.setTimeout(() => setFlash(false), 380)
      }
    }
    const start = window.setTimeout(() => {
      interval = window.setInterval(tick, TICK_MS)
      tick()
    }, delay)
    return () => {
      window.clearTimeout(start)
      if (interval !== null) window.clearInterval(interval)
      if (flashTimeout !== null) window.clearTimeout(flashTimeout)
    }
  }, [name, duration, delay, pending, instant, reducedMotion])

  return (
    <span
      className={pending && !reducedMotion ? 'qs-name-pending' : undefined}
      style={{ textShadow: flash ? '0 0 .35em rgba(157,238,255,.8)' : undefined, transition: 'text-shadow .3s ease' }}
    >
      {shown}
    </span>
  )
}

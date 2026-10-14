import { useEffect, useRef } from 'react'
import { onShowUpdate } from '@/lib/socket'
import type { ShowPayload } from '@/types'

/**
 * Calls `cb` when the server broadcasts `show:update` (any change to state, students, tiers or settings).
 * With `debounceMs`, bursts (e.g. a bulk import) collapse into one call with the latest payload.
 */
export function useShowUpdate(cb: (payload: ShowPayload) => void, debounceMs = 0) {
  const cbRef = useRef(cb)
  cbRef.current = cb

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = onShowUpdate((payload) => {
      if (!debounceMs) return cbRef.current(payload)
      clearTimeout(timer)
      timer = setTimeout(() => cbRef.current(payload), debounceMs)
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [debounceMs])
}

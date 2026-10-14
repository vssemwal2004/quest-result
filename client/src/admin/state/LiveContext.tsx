import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { useSocketConnected, useViewerCount } from '@/lib/socket'
import type { PresentationInfo, Settings, ShowStage, ShowState } from '@/types'
import { useShowUpdate } from '../hooks/useShowUpdate'

interface LiveValue {
  /** Unfiltered stages + live state (admin endpoint). Null until first load. */
  presentation: PresentationInfo | null
  settings: Settings | null
  loading: boolean
  error: unknown
  connected: boolean
  viewers: number | null
  currentStage: ShowStage | null
  reload: () => Promise<void>
  /** Apply a state returned by next/prev/goto/reset immediately (the socket broadcast follows). */
  applyState: (state: ShowState) => void
  applySettings: (settings: Settings) => void
}

const LiveContext = createContext<LiveValue | null>(null)

/** Keep whichever state the server produced last, so an older in-flight fetch never rewinds the UI. */
function newer(a: ShowState, b: ShowState): ShowState {
  return b.updatedAt >= a.updatedAt ? b : a
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [presentation, setPresentation] = useState<PresentationInfo | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const connected = useSocketConnected()
  const liveViewers = useViewerCount()
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const id = ++seq.current
    try {
      const [p, s] = await Promise.all([api.presentation(), api.settings()])
      if (id !== seq.current) return
      setPresentation((prev) => (prev ? { ...p, state: newer(prev.state, p.state) } : p))
      setSettings(s.settings)
      setError(null)
    } catch (err) {
      if (id === seq.current) setError(err)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const applyState = useCallback((state: ShowState) => {
    setPresentation((prev) => (prev ? { ...prev, state: newer(prev.state, state) } : prev))
  }, [])

  // Instant state/settings from the broadcast; stages are refetched (debounced) because the
  // public payload may be spoiler-filtered.
  useShowUpdate((payload) => {
    applyState(payload.state)
    setSettings(payload.settings)
  })
  useShowUpdate(() => void reload(), 300)

  // Refresh after a reconnect so nothing that happened while offline is missed.
  const wasConnected = useRef(connected)
  useEffect(() => {
    if (connected && !wasConnected.current) void reload()
    wasConnected.current = connected
  }, [connected, reload])

  const value = useMemo<LiveValue>(
    () => ({
      presentation,
      settings,
      loading,
      error,
      connected,
      viewers: liveViewers ?? presentation?.viewers ?? null,
      currentStage: presentation?.stages[presentation.state.stageIndex] ?? null,
      reload,
      applyState,
      applySettings: setSettings,
    }),
    [presentation, settings, loading, error, connected, liveViewers, reload, applyState],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive(): LiveValue {
  const ctx = useContext(LiveContext)
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>')
  return ctx
}

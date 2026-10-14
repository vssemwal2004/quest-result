import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth'
import { onShowUpdate, useSocketConnected } from '@/lib/socket'
import type { ShowPayload, ShowState } from '@/types'
import { clampPosition, hasDataFor, nextPosition, prevPosition, type Position } from './navigation'

export type ShowMode = 'live' | 'preview'

export interface ShowController {
  mode: ShowMode
  /** Last good payload; null only until the very first one arrives. */
  payload: ShowPayload | null
  /** Effective, clamped position to render (live: server state; preview: local). */
  position: Position
  /** Socket connection status (live indicator). */
  connected: boolean
  /** Whether this screen may drive the show (admin in live mode, always in preview). */
  canControl: boolean
  next: () => void
  prev: () => void
}

interface SourceResult {
  payload: ShowPayload | null
  position: Position
  canControl: boolean
  next: () => void
  prev: () => void
}

interface PreviewQuery {
  requested: boolean
  stage: number
  step: number
}

function readPreviewQuery(): PreviewQuery {
  const q = new URLSearchParams(window.location.search)
  return {
    requested: q.get('preview') === '1',
    stage: Number(q.get('stage') ?? 0) || 0,
    step: Number(q.get('step') ?? 0) || 0,
  }
}

const ORIGIN: Position = { stageIndex: 0, step: 0 }

/**
 * Show data + navigation for the big screen.
 * - LIVE: public payload over HTTP once, then `show:update` pushes; admins drive via the API.
 * - PREVIEW (`?preview=1` + admin token): unfiltered admin payload, position kept locally in the URL.
 * Failures never surface to the audience: the last good payload simply stays on screen.
 */
export function useShow(): ShowController {
  const isAdmin = useIsAdmin()
  const [query] = useState(readPreviewQuery)
  const mode: ShowMode = isAdmin && query.requested ? 'preview' : 'live'
  const connected = useSocketConnected()
  const live = useLiveSource(mode === 'live', isAdmin)
  const preview = usePreviewSource(mode === 'preview', query)
  return { mode, connected, ...(mode === 'preview' ? preview : live) }
}

function useLiveSource(enabled: boolean, isAdmin: boolean): SourceResult {
  const [payload, setPayload] = useState<ShowPayload | null>(null)
  const hasPayload = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let retry: number | undefined
    let attempt = 0
    const load = () => {
      api.publicShow().then(
        (p) => {
          if (cancelled) return
          hasPayload.current = true
          // A socket push may have landed first; never go back to an older version.
          setPayload((cur) => (cur && cur.version >= p.version ? cur : p))
        },
        () => {
          // Before the first payload keep retrying with backoff; afterwards the socket keeps us current.
          if (cancelled || hasPayload.current) return
          retry = window.setTimeout(load, Math.min(10_000, 1000 * 2 ** attempt++))
        },
      )
    }
    load()
    // The server also emits show:update on every (re)connect, which covers reconnect resync.
    const off = onShowUpdate((p) => {
      hasPayload.current = true
      setPayload(p)
    })
    return () => {
      cancelled = true
      window.clearTimeout(retry)
      off()
    }
  }, [enabled])

  const applyState = useCallback((state: ShowState) => {
    setPayload((cur) => {
      if (!cur || Date.parse(state.updatedAt) <= Date.parse(cur.state.updatedAt)) return cur
      return hasDataFor(cur.stages, state) ? { ...cur, state } : cur
    })
  }, [])

  const navigate = useCallback(
    (call: () => Promise<{ state: ShowState }>) => {
      if (!isAdmin) return
      call().then(
        (res) => applyState(res.state),
        (err: unknown) => console.warn('[show] navigation failed', err instanceof ApiError ? err.code : err),
      )
    },
    [isAdmin, applyState],
  )

  const next = useCallback(() => navigate(api.next), [navigate])
  const prev = useCallback(() => navigate(api.prev), [navigate])

  const position = useMemo(() => (payload ? clampPosition(payload.stages, payload.state) : ORIGIN), [payload])

  return { payload, position, canControl: isAdmin, next, prev }
}

function usePreviewSource(enabled: boolean, query: PreviewQuery): SourceResult {
  const [payload, setPayload] = useState<ShowPayload | null>(null)
  const [requested, setRequested] = useState<Position>({ stageIndex: query.stage, step: query.step })
  const hasPayload = useRef(false)
  const stagesRef = useRef(payload?.stages ?? [])
  stagesRef.current = payload?.stages ?? []

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let retry: number | undefined
    let debounce: number | undefined
    const load = () => {
      api.adminShow().then(
        (p) => {
          if (cancelled) return
          hasPayload.current = true
          setPayload(p)
        },
        (err: unknown) => {
          // 401 clears the token, which flips this screen back to live mode on its own.
          if (cancelled || hasPayload.current || (err instanceof ApiError && err.status === 401)) return
          retry = window.setTimeout(load, 3000)
        },
      )
    }
    load()
    // Ignore the live state in preview, but refetch so edits made in the admin appear here.
    const off = onShowUpdate(() => {
      window.clearTimeout(debounce)
      debounce = window.setTimeout(load, 150)
    })
    return () => {
      cancelled = true
      window.clearTimeout(retry)
      window.clearTimeout(debounce)
      off()
    }
  }, [enabled])

  const position = useMemo(() => (payload ? clampPosition(payload.stages, requested) : requested), [payload, requested])

  useEffect(() => {
    if (!enabled || !hasPayload.current) return
    const url = new URL(window.location.href)
    url.searchParams.set('stage', String(position.stageIndex))
    url.searchParams.set('step', String(position.step))
    window.history.replaceState(window.history.state, '', url)
  }, [enabled, position.stageIndex, position.step, payload])

  const next = useCallback(() => setRequested((p) => nextPosition(stagesRef.current, p)), [])
  const prev = useCallback(() => setRequested((p) => prevPosition(stagesRef.current, p)), [])

  return { payload, position, canControl: true, next, prev }
}

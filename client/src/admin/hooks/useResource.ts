import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

export interface Resource<T> {
  data: T | null
  error: unknown
  loading: boolean
  /** Refetch. `silent` keeps the current data on screen (background refresh). */
  reload: (opts?: { silent?: boolean }) => Promise<void>
  setData: (update: (prev: T | null) => T | null) => void
}

/**
 * Loads async data and re-runs when `deps` change. Out-of-order responses are ignored,
 * so a slow earlier request can never overwrite a newer one (e.g. while typing a search).
 */
export function useResource<T>(load: () => Promise<T>, deps: DependencyList = []): Resource<T> {
  const [data, setDataState] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load
  const seq = useRef(0)

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const id = ++seq.current
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const result = await loadRef.current()
      if (id !== seq.current) return
      setDataState(result)
      setError(null)
    } catch (err) {
      if (id === seq.current) setError(err)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // The caller controls when to refetch through `deps`.
  }, deps)

  const setData = useCallback((update: (prev: T | null) => T | null) => setDataState(update), [])

  return { data, error, loading, reload, setData }
}

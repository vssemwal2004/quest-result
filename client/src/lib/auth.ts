import { useSyncExternalStore } from 'react'

const KEY = 'aiquest.token'
const listeners = new Set<() => void>()

function read(): string | null {
  try {
    const token = localStorage.getItem(KEY)
    if (!token) return null
    // Drop expired tokens eagerly so the UI never shows admin controls that will 401.
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(KEY)
      return null
    }
    return token
  } catch {
    return null
  }
}

let current = read()

export function getToken(): string | null {
  return current
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable — token lives in memory only */
  }
  current = token
  listeners.forEach((l) => l())
}

export function getTokenEmail(): string | null {
  if (!current) return null
  try {
    return JSON.parse(atob(current.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null
  } catch {
    return null
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = read()
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

/** Reactive JWT token (null when logged out). Syncs across tabs. */
export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken, getToken)
}

export function useIsAdmin(): boolean {
  return useToken() !== null
}

import { io, type Socket } from 'socket.io-client'
import { useEffect, useState } from 'react'
import type { ShowPayload } from '@/types'

let socket: Socket | null = null

/** Single shared Socket.IO connection (same origin; Vite proxies /socket.io in dev). */
export function getSocket(): Socket {
  if (!socket) {
    // WebSocket first; `tryAllTransports` falls back to long-polling when a venue proxy/firewall blocks WS
    // (without it engine.io keeps retrying WebSocket only and the screen would never get live updates).
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0.5,
    })
  }
  return socket
}

export function onShowUpdate(cb: (payload: ShowPayload) => void): () => void {
  const s = getSocket()
  s.on('show:update', cb)
  return () => {
    s.off('show:update', cb)
  }
}

export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected)
  useEffect(() => {
    const s = getSocket()
    const on = () => setConnected(true)
    const off = () => setConnected(false)
    s.on('connect', on)
    s.on('disconnect', off)
    setConnected(s.connected)
    return () => {
      s.off('connect', on)
      s.off('disconnect', off)
    }
  }, [])
  return connected
}

export function useViewerCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    const s = getSocket()
    const cb = (p: { count: number }) => setCount(p.count)
    s.on('viewers', cb)
    return () => {
      s.off('viewers', cb)
    }
  }, [])
  return count
}

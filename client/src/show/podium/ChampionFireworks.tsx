import { useEffect, useRef } from 'react'
import type { Quality } from '@/types'

type Shot = { delay: number; from: number; to: number; height: number; tint: string }

const FLIGHT_MS = 780
const SHOTS: Shot[] = [
  { delay: 120, from: 0.04, to: 0.13, height: 0.40, tint: '#ffe169' },
  { delay: 650, from: 0.96, to: 0.84, height: 0.19, tint: '#fff2b8' },
  { delay: 1300, from: 0.30, to: 0.23, height: 0.60, tint: '#ffc849' },
  { delay: 3000, from: 0.02, to: 0.10, height: 0.22, tint: '#fff4c7' },
  { delay: 3800, from: 0.98, to: 0.91, height: 0.30, tint: '#ffe169' },
]

function drawShot(ctx: CanvasRenderingContext2D, shot: Shot, age: number, index: number, width: number, height: number, count: number) {
  const startX = shot.from * width
  const targetX = shot.to * width
  const targetY = shot.height * height

  if (age < FLIGHT_MS) {
    const progress = 1 - (1 - age / FLIGHT_MS) ** 2
    const tail = Math.max(0, progress - 0.21)
    const x = startX + (targetX - startX) * progress
    const y = height * 1.02 + (targetY - height * 1.02) * progress
    const tailX = startX + (targetX - startX) * tail
    const tailY = height * 1.02 + (targetY - height * 1.02) * tail
    const trail = ctx.createLinearGradient(tailX, tailY, x, y)
    trail.addColorStop(0, '#ffd23f00')
    trail.addColorStop(0.65, shot.tint + 'bb')
    trail.addColorStop(1, '#ffffff')
    ctx.strokeStyle = trail
    ctx.lineWidth = 5
    ctx.shadowColor = shot.tint
    ctx.shadowBlur = 30
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.fillStyle = '#fffce8'
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const seconds = (age - FLIGHT_MS) / 1000
  if (seconds > 1.7) return
  const fade = Math.max(0, 1 - seconds / 1.7)
  const size = Math.min(width, height) / 800
  const flash = Math.max(0, 1 - seconds / 0.35)
  if (flash > 0) {
    const glow = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, 64 * size)
    glow.addColorStop(0, `rgba(255,255,245,${0.8 * flash})`)
    glow.addColorStop(0.25, `rgba(255,215,96,${0.5 * flash})`)
    glow.addColorStop(1, 'rgba(255,210,63,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(targetX, targetY, 64 * size, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowColor = shot.tint
  ctx.shadowBlur = 21 * size
  for (let particle = 0; particle < count; particle += 1) {
    const angle = particle * 2.399963 + index * 0.43
    const speed = (85 + ((particle * 97 + index * 29) % 170)) * size
    const previous = Math.max(0, seconds - 0.11)
    const x = targetX + Math.cos(angle) * speed * seconds
    const y = targetY + Math.sin(angle) * speed * seconds + 68 * size * seconds ** 2
    const px = targetX + Math.cos(angle) * speed * previous
    const py = targetY + Math.sin(angle) * speed * previous + 68 * size * previous ** 2
    ctx.globalAlpha = fade * (particle % 3 === 0 ? 1 : 0.85)
    ctx.strokeStyle = particle % 5 === 0 ? '#ffffff' : particle % 3 === 0 ? '#ffc849' : shot.tint
    ctx.lineWidth = (particle % 7 === 0 ? 3.8 : 2.4) * size
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.fillStyle = ctx.strokeStyle
    ctx.beginPath()
    ctx.arc(x, y, (particle % 4 === 0 ? 2.8 : 1.7) * size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** A short skyshot sequence behind first place; the canvas sleeps after the last burst. */
export function ChampionFireworks({ quality, reducedMotion }: { quality: Quality; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (reducedMotion) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let width = 0
    let height = 0
    const shots = quality === 'low' ? SHOTS.slice(0, 3) : SHOTS
    const duration = quality === 'low' ? 4200 : 6400
    const count = quality === 'low' ? 18 : quality === 'medium' ? 48 : 72
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const ratio = Math.min(1, 1280 / Math.max(bounds.width, 1), 720 / Math.max(bounds.height, 1))
      width = bounds.width
      height = bounds.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const started = performance.now()
    const draw = (now: number) => {
      const elapsed = now - started
      if (elapsed > duration) {
        ctx.clearRect(0, 0, width, height)
        window.clearInterval(interval)
        return
      }
      if (document.hidden) return
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      shots.forEach((shot, index) => {
        if (elapsed >= shot.delay) drawShot(ctx, shot, elapsed - shot.delay, index, width, height, count)
      })
      ctx.restore()
    }
    const interval = window.setInterval(() => draw(performance.now()), 1000 / 24)
    return () => {
      window.clearInterval(interval)
      observer.disconnect()
    }
  }, [quality, reducedMotion])

  return <canvas ref={canvasRef} className="bot-stage__fireworks" aria-hidden />
}

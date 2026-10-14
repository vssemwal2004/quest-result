import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

/** Procedural textures (no network / no image files), created once per mount and disposed on unmount. */
function makeTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, srgb = true): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, size)
  const tex = new CanvasTexture(canvas)
  if (srgb) tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function useTexture(factory: () => CanvasTexture): CanvasTexture {
  const tex = useMemo(factory, [factory])
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

/** White center fading to black: floor alpha map so the stage melts into the shared background. */
function drawFloorAlpha(ctx: CanvasRenderingContext2D, s: number) {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, '#fff')
  g.addColorStop(0.45, '#fff')
  g.addColorStop(0.8, '#555')
  g.addColorStop(1, '#000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
}

/** Concentric HUD/circuit ring with traces and pads (cyan on transparent) for the stage floor. */
function drawCircuitRing(ctx: CanvasRenderingContext2D, s: number) {
  const c = s / 2
  ctx.translate(c, c)
  ctx.strokeStyle = '#38e1ff'
  ctx.fillStyle = '#38e1ff'
  ctx.lineCap = 'round'
  const ring = (r: number, w: number, alpha: number, dash?: number[]) => {
    ctx.globalAlpha = alpha
    ctx.lineWidth = w
    ctx.setLineDash(dash ?? [])
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ring(s * 0.47, s * 0.006, 0.9)
  ring(s * 0.445, s * 0.002, 0.6, [s * 0.02, s * 0.012])
  ring(s * 0.4, s * 0.003, 0.45)
  ring(s * 0.3, s * 0.0025, 0.35, [s * 0.004, s * 0.01])
  ctx.setLineDash([])
  // radial traces with a 45° jog and a pad at the end
  const traces = 36
  for (let i = 0; i < traces; i++) {
    const a = (i / traces) * Math.PI * 2
    const r0 = s * 0.4
    const r1 = s * (0.425 + (i % 3) * 0.008)
    const jog = (i % 2 === 0 ? 1 : -1) * 0.03
    ctx.globalAlpha = 0.65
    ctx.lineWidth = s * 0.0022
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
    ctx.lineTo(Math.cos(a + jog) * r1, Math.sin(a + jog) * r1)
    ctx.stroke()
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(Math.cos(a + jog) * r1, Math.sin(a + jog) * r1, s * 0.004, 0, Math.PI * 2)
    ctx.fill()
  }
  // tick marks
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2
    const long = i % 10 === 0
    ctx.globalAlpha = long ? 0.8 : 0.35
    ctx.lineWidth = s * (long ? 0.003 : 0.0015)
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * s * 0.475, Math.sin(a) * s * 0.475)
    ctx.lineTo(Math.cos(a) * s * (long ? 0.495 : 0.488), Math.sin(a) * s * (long ? 0.495 : 0.488))
    ctx.stroke()
  }
}

/** Soft round glow (white → transparent), tinted by the material color. */
function drawGlow(ctx: CanvasRenderingContext2D, s: number) {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,.55)')
  g.addColorStop(0.6, 'rgba(255,255,255,.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
}

/** God-ray fan for the champion reveal. */
function drawRays(ctx: CanvasRenderingContext2D, s: number) {
  const c = s / 2
  ctx.translate(c, c)
  const rays = 18
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2
    const w = (i % 2 === 0 ? 0.07 : 0.035) * Math.PI
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c)
    g.addColorStop(0, 'rgba(255,255,255,.9)')
    g.addColorStop(0.5, 'rgba(255,255,255,.25)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, c, a - w / 2, a + w / 2)
    ctx.closePath()
    ctx.fill()
  }
}

const floorAlpha = () => makeTexture(256, drawFloorAlpha, false)
const circuitRing = () => makeTexture(1024, drawCircuitRing)
const glow = () => makeTexture(128, drawGlow)
const rays = () => makeTexture(512, drawRays)

export const useFloorAlphaTexture = () => useTexture(floorAlpha)
export const useCircuitRingTexture = () => useTexture(circuitRing)
export const useGlowTexture = () => useTexture(glow)
export const useRaysTexture = () => useTexture(rays)

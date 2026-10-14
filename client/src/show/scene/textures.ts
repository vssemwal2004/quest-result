import { CanvasTexture, SRGBColorSpace } from 'three'

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [canvas, ctx]
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Holographic "AI" microchip like the poster's corner badges. Redraws once Orbitron has loaded. */
export function createChipTexture(size = 512): CanvasTexture {
  const [canvas, ctx] = makeCanvas(size)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace

  const draw = () => {
    const s = size / 512
    ctx.clearRect(0, 0, size, size)
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(190,245,255,0.95)'
    ctx.fillStyle = 'rgba(190,245,255,0.95)'
    ctx.shadowColor = 'rgba(56,225,255,0.9)'
    ctx.shadowBlur = 18 * s

    // Pins + short traces with pads on all four sides.
    const pins = 6
    for (let side = 0; side < 4; side++) {
      ctx.save()
      ctx.translate(size / 2, size / 2)
      ctx.rotate((side * Math.PI) / 2)
      for (let i = 0; i < pins; i++) {
        const x = (-150 + (i * 300) / (pins - 1)) * s
        ctx.lineWidth = 9 * s
        ctx.beginPath()
        ctx.moveTo(x, -150 * s)
        ctx.lineTo(x, -186 * s)
        const len = (i % 2 === 0 ? 46 : 26) * s
        ctx.lineTo(x + (i < pins / 2 ? -len : len) * 0.4, -186 * s - len)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x + (i < pins / 2 ? -len : len) * 0.4, -186 * s - len, 7 * s, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // Package body.
    ctx.lineWidth = 12 * s
    roundRect(ctx, 106 * s, 106 * s, 300 * s, 300 * s, 34 * s)
    ctx.stroke()
    ctx.fillStyle = 'rgba(56,225,255,0.14)'
    ctx.fill()
    ctx.lineWidth = 4 * s
    roundRect(ctx, 136 * s, 136 * s, 240 * s, 240 * s, 22 * s)
    ctx.stroke()

    ctx.fillStyle = 'rgba(235,252,255,1)'
    ctx.font = `900 ${150 * s}px Orbitron, Montserrat, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowBlur = 26 * s
    ctx.fillText('AI', size / 2, size / 2 + 8 * s)
    tex.needsUpdate = true
  }

  draw()
  document.fonts?.load(`900 ${150 * (size / 512)}px Orbitron`).then(draw, () => undefined)
  return tex
}

import { BufferAttribute, BufferGeometry } from 'three'
import { createRandom, type Random } from './random'

export interface TraceLayerSpec {
  seed: number
  /** Extent of the layer in world units (should overscan the visible frustum). */
  width: number
  height: number
  /** Grid pitch; traces run on this grid with 45° jogs like a PCB. */
  pitch: number
  traces: number
  lineWidth: number
  /** Fraction of the central area kept calmer so stage text stays legible (0..1). */
  quietCenter: number
}

type Point = [number, number]

// 8 compass directions, index 0 = east, counter-clockwise in 45° steps.
const DIRS: Point[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
]

/**
 * Generates non-overlapping PCB-style polylines on a grid: straight runs joined by short 45°
 * diagonals, sometimes cloned into parallel "bus" bundles.
 */
function generatePaths(spec: TraceLayerSpec, rnd: Random): Point[][] {
  const cols = Math.floor(spec.width / spec.pitch)
  const rows = Math.floor(spec.height / spec.pitch)
  const occupied = new Set<number>()
  const key = (c: number, r: number) => r * (cols + 1) + c
  const inBounds = (c: number, r: number) => c >= 0 && c <= cols && r >= 0 && r <= rows

  const isQuiet = (c: number, r: number) => {
    const nx = Math.abs(c / cols - 0.5) * 2
    const ny = Math.abs(r / rows - 0.5) * 2
    return nx < spec.quietCenter && ny < spec.quietCenter
  }

  /** Walks a path in grid space; returns grid nodes (corners only) or null when too short. */
  const walk = (start: Point, axisDir: number): Point[] | null => {
    let [c, r] = start
    if (!inBounds(c, r) || occupied.has(key(c, r))) return null
    const visited: number[] = [key(c, r)]
    const corners: Point[] = [[c, r]]
    let dir = axisDir
    const runs = rnd.int(2, 5)
    for (let i = 0; i < runs; i++) {
      const diagonal = dir % 2 === 1
      const length = diagonal ? rnd.int(1, 3) : rnd.int(3, 9)
      let moved = 0
      for (let s = 0; s < length; s++) {
        const nc = c + DIRS[dir][0]
        const nr = r + DIRS[dir][1]
        const k = key(nc, nr)
        if (!inBounds(nc, nr) || occupied.has(k) || visited.includes(k)) break
        c = nc
        r = nr
        visited.push(key(c, r))
        moved++
      }
      if (moved === 0) break
      corners.push([c, r])
      // Alternate axis runs with diagonal jogs; a jog mostly returns to the original heading.
      dir = diagonal ? (rnd.chance(0.7) ? axisDir : (dir + (rnd.chance(0.5) ? 1 : 7)) % 8) : (dir + (rnd.chance(0.5) ? 1 : 7)) % 8
    }
    if (visited.length < 4) return null
    visited.forEach((k) => occupied.add(k))
    return corners
  }

  /** Marks every grid node along a polyline as used; fails (claiming nothing) on any collision. */
  const claim = (corners: Point[]): boolean => {
    const nodes: number[] = []
    for (let i = 1; i < corners.length; i++) {
      const [c0, r0] = corners[i - 1]
      const [c1, r1] = corners[i]
      const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0))
      for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
        const c = c0 + Math.sign(c1 - c0) * s
        const r = r0 + Math.sign(r1 - r0) * s
        if (!inBounds(c, r) || occupied.has(key(c, r))) return false
        nodes.push(key(c, r))
      }
    }
    nodes.forEach((k) => occupied.add(k))
    return true
  }

  const paths: Point[][] = []
  let attempts = 0
  while (paths.length < spec.traces && attempts < spec.traces * 12) {
    attempts++
    const start: Point = [rnd.int(0, cols), rnd.int(0, rows)]
    if (isQuiet(start[0], start[1]) && rnd.chance(0.85)) continue
    const axisDir = rnd.chance(0.72) ? rnd.pick([0, 4]) : rnd.pick([2, 6])
    const path = walk(start, axisDir)
    if (!path) continue
    paths.push(path)

    // Parallel bundle: translate the whole path perpendicular to its heading.
    if (rnd.chance(0.38)) {
      const [px, py] = DIRS[(axisDir + 2) % 8]
      const side = rnd.chance(0.5) ? 1 : -1
      const copies = rnd.int(1, 3)
      for (let k = 1; k <= copies && paths.length < spec.traces; k++) {
        const shifted = path.map(([x, y]) => [x + px * side * k, y + py * side * k] as Point)
        if (!claim(shifted)) break
        paths.push(shifted)
      }
    }
  }

  const ox = -spec.width / 2
  const oy = -spec.height / 2
  return paths.map((p) => p.map(([c, r]) => [ox + c * spec.pitch, oy + r * spec.pitch] as Point))
}

export interface TraceGeometry {
  ribbons: BufferGeometry
  pads: BufferGeometry
}

/** A layer placed in the scene: its depth, brightness and pad size are baked into the vertices. */
export interface PlacedTraceLayer extends TraceLayerSpec {
  z: number
  opacity: number
  padSize: number
}

/**
 * Builds mitered ribbon strips (so line width is real, not 1px GL lines) with per-vertex
 * `aDist` (distance along the trace) for travelling light pulses, plus end-point pads.
 * All layers are merged into one ribbon buffer and one pad buffer → two draw calls in total.
 */
export function buildTraceGeometry(layers: PlacedTraceLayer[]): TraceGeometry {
  const positions: number[] = []
  const side: number[] = []
  const dist: number[] = []
  const length: number[] = []
  const seed: number[] = []
  const opacity: number[] = []
  const index: number[] = []

  const padPos: number[] = []
  const padSeed: number[] = []
  const padSize: number[] = []
  const padOpacity: number[] = []

  for (const spec of layers) {
    const rnd = createRandom(spec.seed)
    const half = spec.lineWidth / 2
    for (const path of generatePaths(spec, rnd)) {
      appendPath(path, spec, half, rnd)
    }
  }

  function appendPath(path: Point[], spec: PlacedTraceLayer, half: number, rnd: Random) {
    const cumulative = [0]
    for (let i = 1; i < path.length; i++) {
      cumulative.push(cumulative[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
    }
    const total = cumulative[cumulative.length - 1]
    const s = rnd.next()
    const base = positions.length / 3

    for (let i = 0; i < path.length; i++) {
      const prev = path[Math.max(0, i - 1)]
      const next = path[Math.min(path.length - 1, i + 1)]
      // Average of adjacent segment normals → miter direction.
      const n0 = segmentNormal(prev, path[i] === prev ? next : path[i])
      const n1 = segmentNormal(path[i] === next ? prev : path[i], next)
      let mx = n0[0] + n1[0]
      let my = n0[1] + n1[1]
      const ml = Math.hypot(mx, my) || 1
      mx /= ml
      my /= ml
      const miter = half / Math.max(0.5, mx * n1[0] + my * n1[1])
      for (const sgn of [-1, 1]) {
        positions.push(path[i][0] + mx * miter * sgn, path[i][1] + my * miter * sgn, spec.z)
        side.push(sgn)
        dist.push(cumulative[i])
        length.push(total)
        seed.push(s)
        opacity.push(spec.opacity)
      }
      if (i > 0) {
        const a = base + (i - 1) * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }

    // Pads only on some ends: a pad on every end reads as noisy dots rather than circuitry.
    for (const end of [path[0], path[path.length - 1]]) {
      if (!rnd.chance(0.55)) continue
      padPos.push(end[0], end[1], spec.z)
      padSeed.push(rnd.next())
      padSize.push(spec.padSize * rnd.range(0.8, 1.2))
      padOpacity.push(spec.opacity)
    }
  }

  const ribbons = new BufferGeometry()
  ribbons.setAttribute('aOpacity', new BufferAttribute(new Float32Array(opacity), 1))
  ribbons.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  ribbons.setAttribute('aSide', new BufferAttribute(new Float32Array(side), 1))
  ribbons.setAttribute('aDist', new BufferAttribute(new Float32Array(dist), 1))
  ribbons.setAttribute('aLen', new BufferAttribute(new Float32Array(length), 1))
  ribbons.setAttribute('aSeed', new BufferAttribute(new Float32Array(seed), 1))
  ribbons.setIndex(index)
  ribbons.computeBoundingSphere()

  const pads = new BufferGeometry()
  pads.setAttribute('position', new BufferAttribute(new Float32Array(padPos), 3))
  pads.setAttribute('aSeed', new BufferAttribute(new Float32Array(padSeed), 1))
  pads.setAttribute('aSize', new BufferAttribute(new Float32Array(padSize), 1))
  pads.setAttribute('aOpacity', new BufferAttribute(new Float32Array(padOpacity), 1))
  pads.computeBoundingSphere()

  return { ribbons, pads }
}

function segmentNormal(a: Point, b: Point): Point {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  return [-dy / l, dx / l]
}

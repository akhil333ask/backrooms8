import * as THREE from 'three'
import { mulberry32 } from '@/lib/backrooms/rng'

export type Draw = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void

/** Procedural tiling texture drawn on a canvas. Deterministic per seed. */
export function canvasTexture(size: number, draw: Draw, opts: { seed?: number; color?: boolean; anisotropy?: number } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size, mulberry32(opts.seed ?? 1))
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = opts.anisotropy ?? 4
  if (opts.color !== false) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Fine per-pixel grain, multiplied over whatever is already drawn. */
export function grain(ctx: CanvasRenderingContext2D, size: number, rand: () => number, amount: number) {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
  }
  ctx.putImageData(img, 0, 0)
}

/** Soft blotches (stains, damp) drawn with wrap-around so the tile stays seamless. */
export function blotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  count: number,
  color: (a: number) => string,
  minR: number,
  maxR: number,
  alpha: number,
) {
  for (let i = 0; i < count; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = minR + rand() * (maxR - minR)
    const a = alpha * (0.4 + rand() * 0.6)
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
        g.addColorStop(0, color(a))
        g.addColorStop(1, color(0))
        ctx.fillStyle = g
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2)
      }
    }
  }
}

/** Tileable height noise turned into a tangent-space normal map (used for water). */
export function noiseNormalMap(size: number, seed: number, cells: number, strength: number) {
  const rand = mulberry32(seed)
  const grid: number[] = []
  for (let i = 0; i < cells * cells; i++) grid.push(rand())
  const h = (x: number, y: number) => {
    const gx = (x / size) * cells
    const gy = (y / size) * cells
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const at = (a: number, b: number) => grid[(((b % cells) + cells) % cells) * cells + (((a % cells) + cells) % cells)]
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx
    const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx
    return top * (1 - sy) + bot * sy
  }
  return canvasTexture(
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size)
      const heights = new Float32Array(size * size)
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) heights[y * size + x] = h(x, y) + h(x * 2.1, y * 2.1) * 0.5
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const l = heights[y * size + ((x - 1 + size) % size)]
          const r = heights[y * size + ((x + 1) % size)]
          const u = heights[((y - 1 + size) % size) * size + x]
          const dn = heights[((y + 1) % size) * size + x]
          const nx = (l - r) * strength
          const ny = (u - dn) * strength
          const len = Math.hypot(nx, ny, 1)
          const i = (y * size + x) * 4
          img.data[i] = ((nx / len) * 0.5 + 0.5) * 255
          img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
          img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
          img.data[i + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
    },
    { color: false },
  )
}

/** Bright web-like caustic lines on black (Voronoi cell borders), tileable. */
export function causticsTexture(size: number, seed: number) {
  return canvasTexture(
    size,
    (ctx, s, rand) => {
      const pts: [number, number][] = []
      for (let i = 0; i < 26; i++) pts.push([rand() * s, rand() * s])
      const img = ctx.createImageData(s, s)
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          let d1 = Infinity
          let d2 = Infinity
          for (const [px, py] of pts) {
            for (const ox of [-s, 0, s]) {
              for (const oy of [-s, 0, s]) {
                const d = (x - px - ox) ** 2 + (y - py - oy) ** 2
                if (d < d1) {
                  d2 = d1
                  d1 = d
                } else if (d < d2) d2 = d
              }
            }
          }
          const edge = Math.sqrt(d2) - Math.sqrt(d1)
          const v = Math.max(0, 1 - edge / 7) ** 2.2 * 255
          const i = (y * s + x) * 4
          img.data[i] = v
          img.data[i + 1] = v
          img.data[i + 2] = v
          img.data[i + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
    },
    { seed },
  )
}

/** Grid of labels (numbers etc.) on one texture; returns UV rects per label. */
export function labelAtlas(labels: string[], opts: { cols: number; cell: number; draw: (ctx: CanvasRenderingContext2D, label: string, x: number, y: number, cell: number) => void }) {
  const rows = Math.ceil(labels.length / opts.cols)
  const canvas = document.createElement('canvas')
  canvas.width = opts.cols * opts.cell
  canvas.height = rows * opts.cell
  const ctx = canvas.getContext('2d')!
  const rects: [number, number, number, number][] = []
  labels.forEach((l, i) => {
    const c = i % opts.cols
    const r = Math.floor(i / opts.cols)
    opts.draw(ctx, l, c * opts.cell, r * opts.cell, opts.cell)
    rects.push([c / opts.cols, 1 - (r + 1) / rows, (c + 1) / opts.cols, 1 - r / rows])
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { tex, rects }
}

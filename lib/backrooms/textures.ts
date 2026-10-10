import * as THREE from 'three'
import { FLOOR_LABELS } from './constants'
import { mulberry32, type Rng } from './rng'

type Ctx = CanvasRenderingContext2D

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
  }
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  return t
}

/** Per-pixel multiplicative grain. */
function grain(ctx: Ctx, w: number, h: number, rng: Rng, amount: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = 1 + (rng() - 0.5) * amount
    d[i] = Math.min(255, d[i] * n)
    d[i + 1] = Math.min(255, d[i + 1] * n)
    d[i + 2] = Math.min(255, d[i + 2] * n)
  }
  ctx.putImageData(img, 0, 0)
}

/** Soft irregular blotches (wraps on both axes so tiling stays seamless). */
function blotches(ctx: Ctx, w: number, h: number, rng: Rng, count: number, color: string, alpha: number, minR: number, maxR: number) {
  ctx.save()
  for (let i = 0; i < count; i++) {
    const x = rng() * w
    const y = rng() * h
    const r = minR + rng() * (maxR - minR)
    const a = alpha * (0.5 + rng() * 0.5)
    const sy = 0.6 + rng() * 0.8
    const rot = rng() * Math.PI
    for (const ox of [-w, 0, w])
      for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
        g.addColorStop(0, color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = a
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(x + ox, y + oy, r, r * sy, rot, 0, Math.PI * 2)
        ctx.fill()
      }
  }
  ctx.restore()
}

/** Gentle shading toward floor and ceiling, standing in for ambient occlusion. */
function edgeShade(ctx: Ctx, w: number, h: number, top: number, bottom: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, `rgba(70,60,20,${top})`)
  g.addColorStop(0.12, 'rgba(70,60,20,0)')
  g.addColorStop(0.88, 'rgba(70,60,20,0)')
  g.addColorStop(1, `rgba(60,50,20,${bottom})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** Faint tide-line stain near the ceiling, used sparingly. */
function faintStain(ctx: Ctx, w: number, rng: Rng) {
  const x = rng() * w
  const r = 120 + rng() * 140
  const g = ctx.createRadialGradient(x, 0, r * 0.3, x, 0, r)
  g.addColorStop(0, 'rgba(150,130,60,0)')
  g.addColorStop(0.8, 'rgba(150,130,60,0.08)')
  g.addColorStop(1, 'rgba(150,130,60,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, 0, r * 2, r)
}

/** Zone A: smooth mono-yellow wall with very soft mottling. */
function wallpaperA(): THREE.CanvasTexture {
  const W = 2048
  const H = 1024
  const rng = mulberry32(11)
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = '#d9d28a'
  ctx.fillRect(0, 0, W, H)
  blotches(ctx, W, H, rng, 30, 'rgba(240,236,170,1)', 0.1, 160, 400)
  blotches(ctx, W, H, rng, 18, 'rgba(170,160,90,1)', 0.04, 160, 380)
  // Hairline vertical seams between wallpaper strips
  const strips = 8
  for (let i = 0; i < strips; i++) {
    ctx.fillStyle = 'rgba(160,150,80,0.10)'
    ctx.fillRect((i * W) / strips, 0, 2, H)
  }
  // Very faint dotted diamond print
  ctx.fillStyle = 'rgba(175,165,95,0.16)'
  const px = W / 64
  for (let y = 0; y < H; y += px) {
    const off = (Math.round(y / px) % 2) * (px / 2)
    for (let x = 0; x < W; x += px) {
      ctx.beginPath()
      ctx.arc(x + off, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  faintStain(ctx, W, rng)
  edgeShade(ctx, W, H, 0.12, 0.16)
  grain(ctx, W, H, rng, 0.025)
  return toTexture(c)
}

/** Zone B: pale yellow wallpaper with columns of pointed-arch motifs. */
function wallpaperB(): THREE.CanvasTexture {
  const W = 2048
  const H = 1024
  const rng = mulberry32(23)
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = '#e3dc9c'
  ctx.fillRect(0, 0, W, H)
  blotches(ctx, W, H, rng, 30, 'rgba(248,244,196,1)', 0.18, 120, 340)
  const bands = 16
  const bw = W / bands
  const rows = 8
  const rh = H / rows
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let b = 0; b < bands; b++) {
    const cx = b * bw + bw / 2
    const hw = bw * 0.3
    for (let r = -1; r <= rows; r++) {
      const y = r * rh + (b % 2) * (rh / 2)
      const arch = (inset: number) => {
        ctx.beginPath()
        ctx.moveTo(cx - hw + inset, y + rh * 0.9)
        ctx.bezierCurveTo(cx - hw + inset, y + rh * 0.35, cx - hw * 0.25, y + rh * 0.2 + inset, cx, y + inset * 1.4)
        ctx.bezierCurveTo(cx + hw * 0.25, y + rh * 0.2 + inset, cx + hw - inset, y + rh * 0.35, cx + hw - inset, y + rh * 0.9)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(150,160,175,0.55)'
      ctx.lineWidth = 7
      arch(0)
      ctx.strokeStyle = 'rgba(255,253,235,0.75)'
      ctx.lineWidth = 3
      arch(12)
    }
    ctx.fillStyle = 'rgba(175,165,110,0.12)'
    ctx.fillRect(b * bw, 0, 2, H)
  }
  faintStain(ctx, W, rng)
  edgeShade(ctx, W, H, 0.1, 0.16)
  grain(ctx, W, H, rng, 0.025)
  return toTexture(c)
}

/** Low-pile office carpet: dense fibre speckle over soft tonal variation. */
function carpet(base: string, light: string, dark: string, seed: number): THREE.CanvasTexture {
  const S = 1024
  const rng = mulberry32(seed)
  const [c, ctx] = canvas(S, S)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  blotches(ctx, S, S, rng, 24, light, 0.06, 120, 320)
  blotches(ctx, S, S, rng, 16, dark, 0.04, 120, 320)
  for (let i = 0; i < 60000; i++) {
    ctx.fillStyle = rng() > 0.5 ? light : dark
    ctx.globalAlpha = 0.18 + rng() * 0.2
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 1.5, 1 + rng() * 1.5)
  }
  ctx.globalAlpha = 1
  grain(ctx, S, S, rng, 0.12)
  return toTexture(c)
}

/** Acoustic drop-ceiling tile: fissured speckle with a recessed grid. */
function ceiling(base: string, grid: string, speck: string, seed: number): THREE.CanvasTexture {
  const S = 1024
  const rng = mulberry32(seed)
  const [c, ctx] = canvas(S, S)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  blotches(ctx, S, S, rng, 10, 'rgba(255,252,225,1)', 0.15, 80, 200)
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = speck
    ctx.globalAlpha = 0.35 * rng()
    const len = 1 + rng() * 4
    if (rng() < 0.5) ctx.fillRect(rng() * S, rng() * S, len, 1.4)
    else ctx.fillRect(rng() * S, rng() * S, 1.4, len)
  }
  ctx.globalAlpha = 1
  const half = S / 2
  for (const p of [0, half]) {
    ctx.fillStyle = grid
    ctx.fillRect(p - 5, 0, 10, S)
    ctx.fillRect(0, p - 5, S, 10)
    ctx.fillStyle = 'rgba(120,110,70,0.25)'
    ctx.fillRect(p + 5, 0, 3, S)
    ctx.fillRect(0, p + 5, S, 3)
  }
  grain(ctx, S, S, rng, 0.05)
  return toTexture(c)
}

function brushedMetal(): THREE.CanvasTexture {
  const W = 256
  const H = 256
  const rng = mulberry32(5)
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = '#9ea2a3'
  ctx.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y++) {
    const v = 140 + rng() * 50
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 5},0.5)`
    ctx.fillRect(0, y, W, 1)
  }
  grain(ctx, W, H, rng, 0.06)
  return toTexture(c)
}

function concrete(): THREE.CanvasTexture {
  const S = 512
  const rng = mulberry32(9)
  const [c, ctx] = canvas(S, S)
  ctx.fillStyle = '#8f8c82'
  ctx.fillRect(0, 0, S, S)
  blotches(ctx, S, S, rng, 30, 'rgba(70,68,60,1)', 0.15, 20, 100)
  blotches(ctx, S, S, rng, 20, 'rgba(180,176,165,1)', 0.15, 20, 100)
  grain(ctx, S, S, rng, 0.2)
  return toTexture(c)
}

function exitSign(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 96)
  ctx.fillStyle = '#0d6b2c'
  ctx.fillRect(0, 0, 256, 96)
  ctx.fillStyle = '#e9ffe9'
  ctx.font = 'bold 64px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('EXIT', 128, 52)
  return toTexture(c, false)
}

function digit(n: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128)
  ctx.fillStyle = '#120a05'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#ff9a2e'
  ctx.font = `bold ${n.length > 1 ? 64 : 92}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(n, 64, 70)
  return toTexture(c, false)
}

function floorLabel(n: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64)
  ctx.fillStyle = '#d9d6cc'
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#222'
  ctx.font = `bold ${n.length > 1 ? 30 : 44}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(n, 32, 35)
  return toTexture(c, false)
}

export interface TextureSet {
  wallA: THREE.Texture
  wallB: THREE.Texture
  carpetA: THREE.Texture
  carpetB: THREE.Texture
  ceilA: THREE.Texture
  ceilB: THREE.Texture
  metal: THREE.Texture
  concrete: THREE.Texture
  exit: THREE.Texture
  digits: THREE.Texture[]
  labels: THREE.Texture[]
}

let cache: TextureSet | null = null

export function getTextures(): TextureSet {
  if (cache) return cache
  cache = {
    wallA: wallpaperA(),
    wallB: wallpaperB(),
    carpetA: carpet('#a39a62', '#bdb47a', '#857c4a', 31),
    carpetB: carpet('#8a7f50', '#a49868', '#6c623c', 37),
    ceilA: ceiling('#e0dbb6', '#cfc9a0', '#a49e7c', 41),
    ceilB: ceiling('#dcd8bc', '#c9c4a6', '#9d9a82', 43),
    metal: brushedMetal(),
    concrete: concrete(),
    exit: exitSign(),
    digits: FLOOR_LABELS.map(digit),
    labels: FLOOR_LABELS.map(floorLabel),
  }
  return cache
}

export function disposeTextures() {
  if (!cache) return
  const { digits, labels, ...single } = cache
  for (const t of [...digits, ...labels, ...Object.values(single)]) t.dispose()
  cache = null
}

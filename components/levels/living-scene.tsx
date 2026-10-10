'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CHAIRS, FOOT, lbox, LV, toWorld, type Frame, type Item, type LivingLayout } from '@/levels/living-layout'
import { MeshBuilder } from '@/lib/levels-kit/builder'
import { blotches, canvasTexture, grain } from '@/lib/levels-kit/canvas'
import { glow, lazyResources, std } from '@/lib/levels-kit/resources'
import { BuiltMeshes } from './built-meshes'
import { LightPool } from './light-pool'

function wallpaper(base: string, stripe: string, motif: string, seed: number, round: boolean) {
  return canvasTexture(
    256,
    (ctx, s, r) => {
      ctx.fillStyle = base
      ctx.fillRect(0, 0, s, s)
      ctx.fillStyle = stripe
      for (let x = 0; x < s; x += 64) ctx.fillRect(x + 4, 0, 14, s)
      ctx.fillStyle = motif
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const cx = x * 64 + 42 + (y % 2) * 0
          const cy = y * 64 + (x % 2 ? 48 : 16)
          ctx.beginPath()
          if (round) {
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2
              ctx.moveTo(cx, cy)
              ctx.ellipse(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 5, 3, a, 0, Math.PI * 2)
            }
          } else {
            ctx.moveTo(cx, cy - 10)
            ctx.lineTo(cx + 6, cy)
            ctx.lineTo(cx, cy + 10)
            ctx.lineTo(cx - 6, cy)
            ctx.closePath()
          }
          ctx.fill()
        }
      }
      blotches(ctx, s, r, 6, (a) => `rgba(60,40,20,${a})`, 20, 70, 0.22)
      grain(ctx, s, r, 12)
    },
    { seed },
  )
}

function plain(color: string, seed: number, amount: number, draw?: (ctx: CanvasRenderingContext2D, s: number, r: () => number) => void) {
  return canvasTexture(
    256,
    (ctx, s, r) => {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, s, s)
      draw?.(ctx, s, r)
      grain(ctx, s, r, amount)
    },
    { seed },
  )
}

const assets = lazyResources(() => {
  const paper = wallpaper('#6c6744', '#77714b', '#9a8d5a', 51, false)
  const paper2 = wallpaper('#7a5a4e', '#835f53', '#a77e68', 52, true)
  const carpet = plain('#b19d7a', 53, 34, (ctx, s, r) => blotches(ctx, s, r, 12, (a) => `rgba(90,70,45,${a})`, 10, 60, 0.3))
  const ceil = plain('#d6cdb9', 54, 26, (ctx, s, r) => blotches(ctx, s, r, 6, (a) => `rgba(140,110,60,${a})`, 20, 80, 0.25))
  const wood = plain('#6a4429', 55, 10, (ctx, s, r) => {
    for (let y = 0; y < s; y += 3) {
      ctx.fillStyle = `rgba(30,15,5,${0.05 + r() * 0.12})`
      ctx.fillRect(0, y + Math.sin(y * 0.2) * 2, s, 1 + r() * 2)
    }
  })
  const weave = (c: string, seed: number) =>
    plain(c, seed, 22, (ctx, s) => {
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      for (let i = 0; i < s; i += 4) {
        ctx.fillRect(i, 0, 1, s)
        ctx.fillRect(0, i, s, 1)
      }
    })
  const fabric = weave('#6b5040', 56)
  const fabric2 = weave('#56604a', 57)
  const bedding = plain('#74778f', 58, 14, (ctx, s) => {
    ctx.fillStyle = 'rgba(230,220,190,0.25)'
    for (let y = 0; y < s; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < s; x += 32) ctx.fillRect(x, y, 16, 16)
  })
  const curtain = plain('#5b2421', 59, 12, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, 0)
    for (let k = 0; k <= 8; k++) g.addColorStop(k / 8, k % 2 ? 'rgba(0,0,0,0.35)' : 'rgba(255,200,170,0.08)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
  const books = plain('#3a2a20', 60, 10, (ctx, s, r) => {
    const cols = ['#6d2a22', '#2f4a3a', '#7a6a3a', '#2a3550', '#5a4a3c', '#8a7d6a', '#40302a']
    let x = 0
    while (x < s) {
      const w = 6 + r() * 12
      ctx.fillStyle = cols[Math.floor(r() * cols.length)]
      ctx.fillRect(x, 0, w - 1, s)
      ctx.fillStyle = 'rgba(220,190,120,0.35)'
      ctx.fillRect(x + 1, s * 0.2, w - 3, 2)
      x += w
    }
  })
  const door = plain('#5c3a22', 61, 10, (ctx, s) => {
    ctx.strokeStyle = 'rgba(20,10,4,0.6)'
    ctx.lineWidth = 6
    ctx.strokeRect(28, 20, s - 56, s * 0.38)
    ctx.strokeRect(28, s * 0.5, s - 56, s * 0.42)
  })
  const picture = plain('#2b2a24', 62, 18, (ctx, s, r) => {
    const g = ctx.createLinearGradient(0, 0, 0, s)
    g.addColorStop(0, '#4a5560')
    g.addColorStop(0.55, '#6a6250')
    g.addColorStop(1, '#2e3a26')
    ctx.fillStyle = g
    ctx.fillRect(16, 16, s - 32, s - 32)
    blotches(ctx, s, r, 5, (a) => `rgba(20,20,10,${a})`, 20, 60, 0.4)
  })

  const staticCanvas = document.createElement('canvas')
  staticCanvas.width = 96
  staticCanvas.height = 72
  const screen = new THREE.CanvasTexture(staticCanvas)
  screen.colorSpace = THREE.SRGBColorSpace
  screen.magFilter = THREE.NearestFilter
  screen.minFilter = THREE.NearestFilter

  const mat: Record<string, THREE.Material> = {
    paper: std({ map: paper, roughness: 0.9 }),
    paper2: std({ map: paper2, roughness: 0.9 }),
    carpet: std({ map: carpet, roughness: 1 }),
    runner: std({ color: '#6e2f26', map: carpet, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    ceil: std({ map: ceil, roughness: 1 }),
    trim: std({ map: wood, roughness: 0.6 }),
    wood: std({ map: wood, roughness: 0.55 }),
    fabric: std({ map: fabric, roughness: 1 }),
    fabric2: std({ map: fabric2, roughness: 1 }),
    cushion: std({ color: '#8a6b55', map: fabric, roughness: 1 }),
    bedding: std({ map: bedding, roughness: 1 }),
    sheet: std({ color: '#d8d0bc', roughness: 1 }),
    curtain: std({ map: curtain, roughness: 1, side: THREE.DoubleSide }),
    books: std({ map: books, roughness: 0.8 }),
    door: std({ map: door, roughness: 0.6 }),
    picture: std({ map: picture, roughness: 0.7 }),
    plastic: std({ color: '#8f8775', roughness: 0.5 }),
    plasticDark: std({ color: '#2a2724', roughness: 0.5 }),
    cavity: std({ color: '#0d0b09', roughness: 1 }),
    brass: std({ color: '#a08040', metalness: 0.8, roughness: 0.35 }),
    shade: glow('#ffb36a', 1.8),
    shadeOff: std({ color: '#d8c6a0', roughness: 0.9 }),
    sconce: glow('#ffc27a', 0.8),
    window: glow('#1c2a44', 0.25),
    screen: new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: screen, emissiveIntensity: 1.5, roughness: 0.2 }),
  }
  return { mat, tex: { paper, paper2, carpet, ceil, wood, fabric, fabric2, bedding, curtain, books, door, picture, screen }, staticCanvas }
})

export const disposeLiving = assets.dispose
export const livingMaterials = () => assets.get().mat

/** Box in a furniture frame's local coordinates. */
function fb(mb: MeshBuilder, key: string, f: Frame, u0: number, v0: number, y0: number, u1: number, v1: number, y1: number, tex = 1) {
  const b = lbox(f, u0, v0, u1, v1, y0, y1)
  mb.box(key, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, tex)
}

function couch(mb: MeshBuilder, f: Frame, hu: number, g: number, fabric: string) {
  const d = 0.9
  fb(mb, fabric, f, -hu, g + 0.05, 0.1, hu, g + d, 0.45)
  fb(mb, fabric, f, -hu, g, 0.1, hu, g + 0.25, 0.9)
  fb(mb, fabric, f, -hu, g + 0.25, 0.45, -hu + 0.18, g + d, 0.66)
  fb(mb, fabric, f, hu - 0.18, g + 0.25, 0.45, hu, g + d, 0.66)
  const inner = hu - 0.2
  if (hu > 0.6) {
    fb(mb, 'cushion', f, -inner, g + 0.25, 0.45, -0.01, g + d - 0.02, 0.56)
    fb(mb, 'cushion', f, 0.01, g + 0.25, 0.45, inner, g + d - 0.02, 0.56)
  } else fb(mb, 'cushion', f, -inner, g + 0.25, 0.45, inner, g + d - 0.02, 0.56)
  for (const u of [-hu + 0.05, hu - 0.1]) for (const v of [g + 0.07, g + d - 0.08]) fb(mb, 'wood', f, u, v, 0, u + 0.05, v + 0.05, 0.1)
}

function addItem(mb: MeshBuilder, it: Item, idx: number) {
  const f = it.f
  const ft = FOOT[it.kind]
  switch (it.kind) {
    case 'sofa':
      couch(mb, f, ft.u, ft.v0, 'fabric')
      break
    case 'armchair':
      couch(mb, f, ft.u, ft.v0, 'fabric2')
      break
    case 'tv': {
      fb(mb, 'wood', f, -0.55, 0.02, 0, 0.55, 0.5, 0.55)
      fb(mb, 'cavity', f, -0.47, 0.49, 0.06, 0.47, 0.505, 0.47)
      fb(mb, 'plasticDark', f, -0.24, 0.12, 0.27, 0.24, 0.5, 0.36)
      fb(mb, 'plastic', f, -0.38, 0.08, 0.55, 0.38, 0.5, 1.1)
      fb(mb, 'plastic', f, -0.24, 0.02, 0.62, 0.24, 0.08, 1.02)
      const p = toWorld(f, 0, 0.502)
      mb.wallQuad('screen', p.x, 0.83, p.z, 0.6, 0.44, Math.atan2(f.nx, f.nz), [0, 0, 1, 1])
      fb(mb, 'plasticDark', f, 0.2, 0.5, 0.58, 0.34, 0.51, 0.62)
      break
    }
    case 'bookshelf': {
      fb(mb, 'wood', f, -0.5, 0.02, 0, -0.47, 0.37, 1.9)
      fb(mb, 'wood', f, 0.47, 0.02, 0, 0.5, 0.37, 1.9)
      fb(mb, 'wood', f, -0.5, 0.02, 0, 0.5, 0.04, 1.9)
      for (let k = 0; k < 5; k++) {
        const y = k * 0.45
        fb(mb, 'wood', f, -0.47, 0.04, y, 0.47, 0.37, y + 0.03)
        if (k === 4) continue
        const n = (idx * 7 + k * 13) % 5
        const right = n === 0 ? 0.1 : 0.45
        fb(mb, 'books', f, -0.45, 0.06, y + 0.03, right, 0.33, y + 0.26 + (n % 3) * 0.04, 0.9)
      }
      break
    }
    case 'wardrobe':
      fb(mb, 'wood', f, -0.6, 0.02, 0, 0.6, 0.62, 2.0)
      fb(mb, 'trim', f, -0.64, 0.02, 2.0, 0.64, 0.66, 2.06)
      fb(mb, 'cavity', f, -0.006, 0.62, 0.05, 0.006, 0.625, 1.95)
      for (const u of [-0.07, 0.04]) fb(mb, 'brass', f, u, 0.62, 1.0, u + 0.03, 0.65, 1.1)
      break
    case 'bed':
      fb(mb, 'wood', f, -0.8, 0.02, 0, 0.8, 0.1, 1.05)
      fb(mb, 'wood', f, -0.78, 0.1, 0.25, 0.78, 2.1, 0.42)
      for (const u of [-0.78, 0.72]) for (const v of [0.1, 2.04]) fb(mb, 'wood', f, u, v, 0, u + 0.06, v + 0.06, 0.25)
      fb(mb, 'sheet', f, -0.74, 0.12, 0.42, 0.74, 2.06, 0.6)
      fb(mb, 'bedding', f, -0.77, 0.75, 0.5, 0.77, 2.09, 0.66)
      fb(mb, 'sheet', f, -0.55, 0.15, 0.6, 0.55, 0.5, 0.72)
      break
    case 'curtain': {
      const p = toWorld(f, 0, 0.006)
      mb.wallQuad('window', p.x, 1.5, p.z, 1.1, 1.2, Math.atan2(f.nx, f.nz), [0, 0, 1, 1])
      for (let k = 0; k < 9; k++) {
        const u0 = -0.9 + k * 0.2
        const v = k % 2 ? 0.33 : 0.29
        fb(mb, 'curtain', f, u0, v, 0.05, u0 + 0.2, v + 0.04, 2.4, 2.4)
      }
      fb(mb, 'brass', f, -1.0, 0.33, 2.4, 1.0, 0.36, 2.44)
      break
    }
    case 'coffee':
      fb(mb, 'wood', f, -0.5, -0.28, 0.4, 0.5, 0.28, 0.45)
      fb(mb, 'wood', f, -0.45, -0.24, 0.12, 0.45, 0.24, 0.14)
      for (const u of [-0.47, 0.43]) for (const v of [-0.25, 0.21]) fb(mb, 'wood', f, u, v, 0, u + 0.04, v + 0.04, 0.4)
      break
    case 'dining':
      fb(mb, 'wood', f, -0.8, -0.45, 0.72, 0.8, 0.45, 0.77)
      for (const u of [-0.74, 0.7]) for (const v of [-0.4, 0.36]) fb(mb, 'wood', f, u, v, 0, u + 0.04, v + 0.04, 0.72)
      for (const c of CHAIRS) {
        fb(mb, 'wood', f, c.u - 0.2, c.v - 0.2, 0.43, c.u + 0.2, c.v + 0.2, 0.47)
        fb(mb, 'cushion', f, c.u - 0.17, c.v - 0.17, 0.47, c.u + 0.17, c.v + 0.17, 0.5)
        const bu = c.u - c.fu * 0.19
        const bv = c.v - c.fv * 0.19
        const hu = c.fu ? 0.02 : 0.2
        const hv = c.fv ? 0.02 : 0.2
        fb(mb, 'wood', f, bu - hu, bv - hv, 0.47, bu + hu, bv + hv, 0.95)
        for (const du of [-0.18, 0.15]) for (const dv of [-0.18, 0.15]) fb(mb, 'wood', f, c.u + du, c.v + dv, 0, c.u + du + 0.03, c.v + dv + 0.03, 0.43)
      }
      break
    case 'lamp':
      mb.cyl('brass', f.ox, 0.015, f.oz, 0.15, 0.03, 'y', 12)
      mb.cyl('brass', f.ox, 0.75, f.oz, 0.018, 1.45, 'y', 6)
      mb.cyl(it.on ? 'shade' : 'shadeOff', f.ox, 1.55, f.oz, 0.2, 0.32, 'y', 14)
      break
  }
}

function buildLiving(L: LivingLayout) {
  const mb = new MeshBuilder()
  const { H, T, DOOR_H } = LV

  for (const r of L.floors) {
    mb.box('carpet', r.x0, -0.1, r.z0, r.x1, 0, r.z1, 1.5)
    mb.box('ceil', r.x0, H, r.z0, r.x1, H + 0.1, r.z1, 2)
  }
  mb.box('runner', LV.HALL_X0 + 0.3, 0, LV.HALL_Z - 0.4, LV.HALL_X1 - 0.3, 0.004, LV.HALL_Z + 0.4, 1.5)

  for (const w of L.walls) {
    mb.box(w.mat, w.minX, w.minY, w.minZ, w.maxX, w.maxY, w.maxZ, 1.3)
    const thinX = w.maxX - w.minX < w.maxZ - w.minZ
    const ex = thinX ? 0.03 : 0
    const ez = thinX ? 0 : 0.03
    if (w.minY === 0) mb.box('trim', w.minX - ex, 0, w.minZ - ez, w.maxX + ex, 0.1, w.maxZ + ez, 1)
    if (w.maxY >= H - 0.001) mb.box('trim', w.minX - ex * 1.6, H - 0.16, w.minZ - ez * 1.6, w.maxX + ex * 1.6, H, w.maxZ + ez * 1.6, 1)
  }

  for (const d of L.doors) {
    const h = d.w / 2
    const t = T / 2 + 0.03
    if (d.axis === 'x') {
      mb.box('trim', d.at - h - 0.07, 0, d.fixed - t, d.at - h, DOOR_H + 0.07, d.fixed + t)
      mb.box('trim', d.at + h, 0, d.fixed - t, d.at + h + 0.07, DOOR_H + 0.07, d.fixed + t)
      mb.box('trim', d.at - h - 0.07, DOOR_H, d.fixed - t, d.at + h + 0.07, DOOR_H + 0.07, d.fixed + t)
    } else {
      mb.box('trim', d.fixed - t, 0, d.at - h - 0.07, d.fixed + t, DOOR_H + 0.07, d.at - h)
      mb.box('trim', d.fixed - t, 0, d.at + h, d.fixed + t, DOOR_H + 0.07, d.at + h + 0.07)
      mb.box('trim', d.fixed - t, DOOR_H, d.at - h - 0.07, d.fixed + t, DOOR_H + 0.07, d.at + h + 0.07)
    }
  }

  for (const d of L.fakeDoors) {
    mb.wallQuad('door', d.x, DOOR_H / 2, d.z + d.nz * 0.012, 0.9, DOOR_H, d.nz > 0 ? 0 : Math.PI, [0, 0, 1, 1])
    mb.box('trim', d.x - 0.52, 0, d.z - 0.03, d.x - 0.45, DOOR_H + 0.07, d.z + 0.03)
    mb.box('trim', d.x + 0.45, 0, d.z - 0.03, d.x + 0.52, DOOR_H + 0.07, d.z + 0.03)
    mb.box('trim', d.x - 0.52, DOOR_H, d.z - 0.03, d.x + 0.52, DOOR_H + 0.07, d.z + 0.03)
    mb.boxC('brass', d.x + 0.33, 1.0, d.z + d.nz * 0.05, 0.06, 0.06, 0.06)
  }
  for (const p of L.pictures) {
    mb.boxC('trim', p.x, 1.55, p.z + p.nz * 0.015, p.w + 0.06, p.h + 0.06, 0.03)
    mb.wallQuad('picture', p.x, 1.55, p.z + p.nz * 0.032, p.w, p.h, p.nz > 0 ? 0 : Math.PI, [0, 0, 1, 1])
  }
  for (const s of L.sconces) {
    mb.boxC('brass', s.x, 1.85, s.z + s.nz * 0.03, 0.12, 0.16, 0.06)
    mb.boxC(s.on ? 'sconce' : 'shadeOff', s.x, 1.9, s.z + s.nz * 0.12, 0.22, 0.16, 0.16)
  }

  L.items.forEach((it, i) => addItem(mb, it, i))
  return mb.build()
}

function drawStatic(canvas: HTMLCanvasElement, t: number) {
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(canvas.width, canvas.height)
  const roll = Math.floor((t * 18) % canvas.height)
  for (let y = 0; y < canvas.height; y++) {
    const band = Math.abs(y - roll) < 4 ? 50 : 0
    const scan = y % 2 ? 0.75 : 1
    for (let x = 0; x < canvas.width; x++) {
      const v = (Math.random() * 190 + band) * scan
      const i = (y * canvas.width + x) * 4
      img.data[i] = v * 0.9
      img.data[i + 1] = v * 0.95
      img.data[i + 2] = Math.min(255, v * 1.1)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** `lights={false}`: the world's always-mounted WingLights owns the point lights instead. */
export function LivingScene({ extra, lights = true }: { extra: unknown; lights?: boolean }) {
  const layout = extra as LivingLayout
  const { tex, staticCanvas } = assets.get()
  const { mat } = assets.get()
  const geos = useMemo(() => buildLiving(layout), [layout])
  const acc = useRef(0)

  useFrame(({ clock }, dt) => {
    acc.current += dt
    if (acc.current < 1 / 20) return
    acc.current = 0
    drawStatic(staticCanvas, clock.elapsedTime)
    tex.screen.needsUpdate = true
  })

  return (
    <>
      <BuiltMeshes geos={geos} materials={mat} />
      {lights && (
        <>
          <LightPool lights={layout.lamps} count={6} color="#ff9d55" intensity={5.2} distance={7} decay={1.7} />
          <LightPool lights={layout.tvs} count={2} color="#a9b9ff" intensity={1.4} distance={4.5} decay={1.6} />
        </>
      )}
    </>
  )
}

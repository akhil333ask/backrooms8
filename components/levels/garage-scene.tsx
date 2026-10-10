'use client'

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { bayCenter, bayX0, ceilAt, G, ROWS, type GarageCar, type GarageLayout } from '@/levels/garage-layout'
import { MeshBuilder } from '@/lib/levels-kit/builder'
import { game } from '@/lib/backrooms/store'
import { GARAGE_ORIGIN, inRamp, type GarageZoneData } from '@/lib/world/garage-zone'
import { zoneEnv } from '@/lib/world/zone-manager'
import { blotches, canvasTexture, grain, labelAtlas } from '@/lib/levels-kit/canvas'
import { glow, lazyResources, std } from '@/lib/levels-kit/resources'
import { BuiltMeshes } from './built-meshes'
import { LightPool } from './light-pool'

const CAR_COLORS = ['#6f6b62', '#4a5157', '#7b6f5a', '#5b4a40', '#3e4a43', '#8b8577', '#2e3135']
const BARREL_COLORS = ['#3f5868', '#7a3a22', '#4f5a3a']
const LABELS = [...ROWS.flatMap((r) => Array.from({ length: G.BAYS }, (_, i) => `${r.l}${String(i + 1).padStart(2, '0')}`)), 'P1', 'P2']

function cracks(ctx: CanvasRenderingContext2D, size: number, rand: () => number, n: number) {
  ctx.strokeStyle = 'rgba(20,19,17,0.55)'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    let x = rand() * size
    let y = rand() * size
    let a = rand() * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let s = 0; s < 14; s++) {
      a += (rand() - 0.5) * 0.9
      x += Math.cos(a) * 9
      y += Math.sin(a) * 9
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

const assets = lazyResources(() => {
  const floor = canvasTexture(
    512,
    (ctx, s, r) => {
      ctx.fillStyle = '#625d54'
      ctx.fillRect(0, 0, s, s)
      blotches(ctx, s, r, 10, (a) => `rgba(128,120,104,${a})`, 40, 130, 0.35)
      blotches(ctx, s, r, 16, (a) => `rgba(32,30,26,${a})`, 20, 90, 0.4)
      blotches(ctx, s, r, 6, (a) => `rgba(10,9,8,${a})`, 12, 46, 0.8)
      cracks(ctx, s, r, 5)
      grain(ctx, s, r, 26)
    },
    { seed: 11 },
  )
  const wall = canvasTexture(
    512,
    (ctx, s, r) => {
      ctx.fillStyle = '#77726a'
      ctx.fillRect(0, 0, s, s)
      for (let i = 0; i < 46; i++) {
        const x = r() * s
        const len = 40 + r() * 220
        const g = ctx.createLinearGradient(0, 0, 0, len)
        g.addColorStop(0, 'rgba(40,36,30,0.18)')
        g.addColorStop(1, 'rgba(40,36,30,0)')
        ctx.fillStyle = g
        ctx.fillRect(x, 0, 2 + r() * 5, len)
      }
      ctx.fillStyle = 'rgba(0,0,0,0.09)'
      for (let y = 0; y < s; y += 128) ctx.fillRect(0, y, s, 2)
      ctx.fillStyle = 'rgba(28,27,25,0.65)'
      for (let y = 64; y < s; y += 128) {
        for (let x = 64; x < s; x += 128) {
          ctx.beginPath()
          ctx.arc(x, y, 3.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      blotches(ctx, s, r, 14, (a) => `rgba(45,48,40,${a})`, 30, 110, 0.3)
      grain(ctx, s, r, 20)
    },
    { seed: 12 },
  )
  const ceiling = canvasTexture(
    256,
    (ctx, s, r) => {
      ctx.fillStyle = '#56524b'
      ctx.fillRect(0, 0, s, s)
      blotches(ctx, s, r, 8, (a) => `rgba(78,62,40,${a})`, 20, 70, 0.4)
      grain(ctx, s, r, 18)
    },
    { seed: 13 },
  )
  const paint = canvasTexture(
    128,
    (ctx, s, r) => {
      ctx.fillStyle = '#c9a62e'
      ctx.fillRect(0, 0, s, s)
      blotches(ctx, s, r, 26, (a) => `rgba(92,88,78,${a})`, 3, 18, 0.85)
      grain(ctx, s, r, 30)
    },
    { seed: 14 },
  )
  const hazard = canvasTexture(
    128,
    (ctx, s, r) => {
      ctx.fillStyle = '#c3a133'
      ctx.fillRect(0, 0, s, s)
      ctx.fillStyle = '#1d1c1a'
      for (let i = -2; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo(i * 64, 0)
        ctx.lineTo(i * 64 + 32, 0)
        ctx.lineTo(i * 64 + 32 + s, s)
        ctx.lineTo(i * 64 + s, s)
        ctx.fill()
      }
      blotches(ctx, s, r, 10, (a) => `rgba(60,55,45,${a})`, 6, 24, 0.6)
      grain(ctx, s, r, 24)
    },
    { seed: 15 },
  )
  const dust = canvasTexture(
    256,
    (ctx, s, r) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, s, s)
      blotches(ctx, s, r, 22, (a) => `rgba(150,140,120,${a})`, 10, 60, 0.3)
      ctx.strokeStyle = 'rgba(90,90,90,0.25)'
      for (let i = 0; i < 30; i++) {
        const x = r() * s
        const y = r() * s
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 12)
        ctx.stroke()
      }
      grain(ctx, s, r, 14)
    },
    { seed: 16 },
  )
  const barrel = canvasTexture(
    256,
    (ctx, s, r) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, s, s)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      for (const y of [0.18, 0.5, 0.82]) ctx.fillRect(0, y * s - 4, s, 8)
      blotches(ctx, s, r, 14, (a) => `rgba(110,62,30,${a})`, 8, 40, 0.6)
      grain(ctx, s, r, 18)
    },
    { seed: 17 },
  )
  const atlas = labelAtlas(LABELS, {
    cols: 12,
    cell: 64,
    draw(ctx, label, x, y, cell) {
      ctx.fillStyle = '#d9b63c'
      ctx.font = `bold ${label.startsWith('P') ? 44 : 26}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + cell / 2, y + cell / 2)
    },
  })
  {
    const cv = atlas.tex.image as HTMLCanvasElement
    const ctx = cv.getContext('2d')!
    ctx.globalCompositeOperation = 'destination-out'
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`
      ctx.fillRect(rnd() * cv.width, rnd() * cv.height, 1 + rnd() * 3, 1 + rnd() * 2)
    }
    atlas.tex.needsUpdate = true
  }

  const mat: Record<string, THREE.MeshStandardMaterial> = {
    floor: std({ map: floor, roughness: 0.92 }),
    wall: std({ map: wall, roughness: 0.95 }),
    ceil: std({ map: ceiling, roughness: 1 }),
    paint: std({ map: paint, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    label: std({ map: atlas.tex, alphaTest: 0.35, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    hazard: std({ map: hazard, roughness: 0.85 }),
    glass: std({ color: '#141a1c', roughness: 0.15, metalness: 0.6 }),
    trim: std({ color: '#262626', roughness: 0.7 }),
    tire: std({ color: '#151515', roughness: 0.95 }),
    tail: std({ color: '#3a0806', emissive: '#3a0806', emissiveIntensity: 0.5, roughness: 0.4 }),
    lens: std({ color: '#b9b9a8', roughness: 0.3 }),
    cavity: std({ color: '#121110', roughness: 1 }),
    metal: std({ color: '#5d605b', metalness: 0.55, roughness: 0.5 }),
    pipe: std({ color: '#4d5a52', metalness: 0.4, roughness: 0.6 }),
    pipeRust: std({ color: '#6e4a33', metalness: 0.3, roughness: 0.75 }),
    fixture: std({ color: '#3c3f3b', metalness: 0.4, roughness: 0.6 }),
    tube: glow('#e8f4dc', 3.2),
    tubeFlicker: glow('#e8f4dc', 3.2),
    tubeDead: std({ color: '#8e928a', roughness: 0.5 }),
    cardboard: std({ color: '#6e5a3e', roughness: 1 }),
  }
  CAR_COLORS.forEach((c, i) => (mat[`car${i}`] = std({ color: c, map: dust, roughness: 0.55, metalness: 0.25 })))
  BARREL_COLORS.forEach((c, i) => (mat[`barrel${i}`] = std({ color: c, map: barrel, roughness: 0.7, metalness: 0.3 })))
  return { mat, tex: { floor, wall, ceiling, paint, hazard, dust, barrel, atlas: atlas.tex }, rects: atlas.rects }
})

export const disposeGarage = assets.dispose

function addCar(mb: MeshBuilder, c: GarageCar) {
  const { x, z, base, rear } = c
  const k = `car${c.color}`
  const half = G.CAR_L / 2
  const nose = z - rear * half
  const rearZ = z + rear * half
  const lo = (a: number, b: number) => Math.min(a, b)
  const hi = (a: number, b: number) => Math.max(a, b)

  if (!c.trunk) {
    mb.box(k, x - 0.9, base + 0.3, z - half, x + 0.9, base + 0.95, z + half, 2)
  } else {
    const hinge = rearZ - rear * 1.05
    mb.box(k, x - 0.9, base + 0.3, z - half, x + 0.9, base + 0.6, z + half, 2)
    mb.box(k, x - 0.9, base + 0.6, lo(nose, hinge), x + 0.9, base + 0.95, hi(nose, hinge), 2)
    const t0 = lo(hinge, rearZ)
    const t1 = hi(hinge, rearZ)
    mb.box(k, x - 0.9, base + 0.6, t0, x - 0.82, base + 0.95, t1, 2)
    mb.box(k, x + 0.82, base + 0.6, t0, x + 0.9, base + 0.95, t1, 2)
    mb.box(k, x - 0.82, base + 0.6, lo(rearZ, rearZ - rear * 0.08), x + 0.82, base + 0.92, hi(rearZ, rearZ - rear * 0.08), 2)
    mb.box('cavity', x - 0.82, base + 0.6, t0, x + 0.82, base + 0.62, t1)
    const a = 1.2
    const vy = Math.sin(a)
    const vz = rear * Math.cos(a)
    mb.boxR(k, x, base + 0.97 + vy / 2, hinge + vz / 2, 1.72, 0.05, 1.0, Math.atan2(-vy, vz), 0, 0, 2)
  }
  const cz = z + rear * 0.1
  mb.box('glass', x - 0.8, base + 0.95, cz - 1.0, x + 0.8, base + 1.38, cz + 1.0)
  mb.box(k, x - 0.81, base + 1.38, cz - 0.95, x + 0.81, base + 1.45, cz + 0.95, 2)
  mb.boxC('trim', x, base + 0.4, nose - rear * 0.03, 1.84, 0.2, 0.12)
  mb.boxC('trim', x, base + 0.4, rearZ + rear * 0.03, 1.84, 0.2, 0.12)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) mb.cyl('tire', x + sx * 0.82, base + 0.32, z + sz * 1.35, 0.32, 0.24, 'x', 12)
    mb.boxC('tail', x + sx * 0.62, base + 0.8, rearZ + rear * 0.01, 0.36, 0.1, 0.03)
    mb.boxC('lens', x + sx * 0.62, base + 0.78, nose - rear * 0.01, 0.32, 0.12, 0.03)
  }
  if (c.doorSide) {
    const s = c.doorSide
    const hx = x + s * 0.9
    const hz = z - rear * 0.6
    const a = 1.05
    const vx = s * Math.sin(a)
    const vz = rear * Math.cos(a)
    const ry = Math.atan2(vx, vz)
    mb.boxR(k, hx + vx / 2, base + 0.68, hz + vz / 2, 0.06, 0.66, 1.0, 0, ry, 0, 2)
    mb.boxR('glass', hx + vx / 2, base + 1.17, hz + vz / 2, 0.03, 0.34, 0.95, 0, ry, 0)
    mb.box('cavity', s > 0 ? x + 0.9 : x - 0.905, base + 0.35, lo(hz, hz + rear), s > 0 ? x + 0.905 : x - 0.9, base + 1.35, hi(hz, hz + rear))
  }
}

function buildGarage(L: GarageLayout) {
  const mb = new MeshBuilder()
  const { DECK, CEIL } = G
  const rampLen = Math.hypot(G.BAND1 - G.BAND0, DECK)
  const rampAng = Math.atan2(DECK, G.BAND1 - G.BAND0)
  const rampX = (G.BAND0 + G.BAND1) / 2

  mb.box('floor', 0, -0.3, 0, G.BAND0, 0, G.Z, 5)
  mb.box('floor', G.BAND1, DECK - 0.3, 0, G.X, DECK, G.Z, 5)
  mb.box('ceil', 0, CEIL, 0, G.BAND0, CEIL + 0.3, G.Z, 4)
  mb.box('ceil', G.BAND1, DECK + CEIL, 0, G.X, DECK + CEIL + 0.3, G.Z, 4)
  for (const [z0, z1] of G.RAMPS) {
    const zc = (z0 + z1) / 2
    mb.boxR('floor', rampX, DECK / 2 - 0.15 / Math.cos(rampAng), zc, rampLen, 0.3, z1 - z0, 0, 0, rampAng, 5)
    for (const ez of [z0 + 0.35, z1 - 0.35]) mb.boxR('paint', rampX, DECK / 2 + 0.006, ez, rampLen, 0.004, 0.12, 0, 0, rampAng)
    mb.box('ceil', G.BAND0, DECK + CEIL, z0, G.BAND1, DECK + CEIL + 0.3, z1, 4)
    mb.box('wall', G.BAND0 - 0.3, CEIL, z0, G.BAND0, DECK + CEIL, z1, 3)
  }
  for (const w of L.walls) mb.box('wall', w.minX, w.minY, w.minZ, w.maxX, w.maxY, w.maxZ, 3)

  for (const d of [0, 1]) {
    const base = d ? DECK : 0
    const top = ceilAt(d)
    const x0 = d ? G.BAND1 : 0
    const x1 = d ? G.X : G.BAND0
    for (const k of G.PILLAR_K) {
      const x = bayX0(d) + G.BAY_W * k
      mb.box('ceil', x - 0.3, top - 0.42, 0, x + 0.3, top, G.Z, 4)
      for (const [pz0, pz1] of [
        [0, 0.35],
        [G.Z - 0.35, G.Z],
      ]) {
        mb.box('wall', x - 0.3, base, pz0, x + 0.3, top, pz1, 3)
        mb.box('hazard', x - 0.31, base, pz0 - 0.01, x + 0.31, base + 0.7, pz1 + 0.01, 0.6)
      }
    }
    for (const z of G.PILLAR_LINES) mb.box('ceil', x0, top - 0.42, z - 0.3, x1, top, z + 0.3, 4)
    for (const pz of [6.0, 12.0, 24.0, 30.0, 42.0, 48.0]) {
      const big = pz % 12 === 0
      mb.cyl(big ? 'pipe' : 'pipeRust', (x0 + x1) / 2, top - (big ? 0.2 : 0.14), pz, big ? 0.1 : 0.06, x1 - x0, 'x', 8)
    }
    for (const az of G.AISLES) {
      mb.cyl('metal', (x0 + x1) / 2, top - 0.03, az, 0.022, x1 - x0, 'x', 5)
      for (let x = x0 + 1.5; x < x1 - 1; x += 3) mb.floorQuad('paint', x, base + 0.004, az, 1.5, 0.12)
    }
    mb.cyl('pipeRust', d ? G.X - 0.6 : 0.6, top - 0.32, G.Z / 2, 0.12, G.Z, 'z', 8)
  }

  L.pillars.forEach((p, i) => {
    const top = p.base + CEIL
    mb.box('wall', p.x - 0.3, p.base, p.z - 0.45, p.x + 0.3, top, p.z + 0.45, 3)
    mb.box('hazard', p.x - 0.31, p.base, p.z - 0.46, p.x + 0.31, p.base + 0.7, p.z + 0.46, 0.6)
    if (i % 3 === 0) mb.cyl('pipe', p.x + 0.36, p.base + CEIL / 2, p.z, 0.055, CEIL, 'y', 6)
  })

  const { rects } = assets.get()
  for (const b of L.bays) {
    const base = b.d ? DECK : 0
    const { zc, rear } = ROWS[b.row]
    const x = bayCenter(b.d, b.i)
    const left = x - G.BAY_W / 2
    mb.floorQuad('paint', left, base + 0.005, zc, 0.12, 4.9)
    const next = L.bays.some((o) => o.d === b.d && o.row === b.row && o.i === b.i + 1)
    if (!next) mb.floorQuad('paint', left + G.BAY_W, base + 0.005, zc, 0.12, 4.9)
    mb.floorQuad('label', x, base + 0.007, zc + rear * 1.75, 1.1, 1.1, rear > 0 ? 0 : Math.PI, rects[b.row * G.BAYS + b.i])
    mb.box('wall', x - 0.7, base, zc - rear * 1.85 - 0.08, x + 0.7, base + 0.12, zc - rear * 1.85 + 0.08, 2)
  }
  const pRect = rects.length - 2
  mb.wallQuad('label', 0.01, 1.5, 27, 1.4, 1.4, Math.PI / 2, rects[pRect])
  mb.wallQuad('label', G.X - 0.01, DECK + 1.5, 27, 1.4, 1.4, -Math.PI / 2, rects[pRect + 1])

  for (const c of L.cars) addCar(mb, c)
  for (const b of L.barrels) {
    const k = `barrel${Math.abs(Math.floor(b.x * 7 + b.z * 3)) % BARREL_COLORS.length}`
    mb.cyl(k, b.x, b.y + 0.45, b.z, 0.29, 0.9, 'y', 14)
    mb.cyl('metal', b.x, b.y + 0.905, b.z, 0.27, 0.012, 'y', 14)
  }

  for (const l of L.lights) {
    mb.boxC('fixture', l.x, l.y + 0.05, l.z, 1.3, 0.05, 0.16)
    mb.cyl(l.on ? (l.flicker ? 'tubeFlicker' : 'tube') : 'tubeDead', l.x, l.y, l.z, 0.026, 1.2, 'x', 6)
  }

  L.rooms.forEach((r) => {
    const top = r.base + CEIL
    const fz = r.frontZ
    mb.box('fixture', r.doorX - 0.62, r.base, fz - 0.14, r.doorX - 0.55, r.base + 2.15, fz + 0.14)
    mb.box('fixture', r.doorX + 0.55, r.base, fz - 0.14, r.doorX + 0.62, r.base + 2.15, fz + 0.14)
    mb.box('fixture', r.doorX - 0.62, r.base + 2.1, fz - 0.14, r.doorX + 0.62, r.base + 2.17, fz + 0.14)
    mb.box('hazard', r.doorX - 0.62, top - 0.35, fz - r.inward * 0.11, r.doorX + 0.62, top - 0.15, fz - r.inward * 0.12, 0.6)
  })
  L.shelves.forEach((s, si) => {
    for (const px of [s.minX, s.maxX - 0.05]) {
      for (const pz of [s.minZ, s.maxZ - 0.05]) mb.box('metal', px, s.minY, pz, px + 0.05, s.maxY, pz + 0.05)
    }
    for (let k = 0; k < 4; k++) {
      const y = s.minY + 0.15 + k * 0.6
      mb.box('metal', s.minX, y, s.minZ, s.maxX, y + 0.03, s.maxZ)
      let x = s.minX + 0.1
      let n = si * 31 + k * 7
      while (x < s.maxX - 0.5) {
        n = (n * 1103515245 + 12345) & 0x7fffffff
        const w = 0.3 + (n % 40) / 100
        const h = 0.2 + (n % 25) / 100
        if (n % 5 !== 0) mb.box('cardboard', x, y + 0.03, s.minZ + 0.06, x + w, y + 0.03 + h, s.maxZ - 0.06)
        x += w + 0.08
      }
    }
  })
  return mb.build()
}

export function GarageScene({ extra }: { extra: unknown }) {
  const layout = extra as GarageLayout
  const { mat } = assets.get()
  const geos = useMemo(() => buildGarage(layout), [layout])
  const live = useMemo(
    () => layout.lights.filter((l) => l.on).map((l) => ({ x: l.x, y: l.y - 0.15, z: l.z, flicker: l.flicker, phase: l.phase })),
    [layout],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mat.tubeFlicker.emissiveIntensity = Math.sin(t * 23) * Math.sin(t * 3.1) > 0.75 ? 0.3 : 3.2
  })

  return (
    <>
      <BuiltMeshes geos={geos} materials={mat} />
      <LightPool lights={live} count={6} color="#d6e6cc" intensity={6} distance={10} decay={1.7} />
    </>
  )
}

const TEX: Record<string, number> = { floor: 5, wall: 3, ceil: 4, hazard: 0.6 }

/** B1 lobby + vehicle ramp, built in world space with the garage material set. */
function buildConnectors(zone: GarageZoneData) {
  const mb = new MeshBuilder()
  for (const { m, b, rx } of zone.boxes) {
    if (rx === undefined) {
      mb.box(m, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, TEX[m] ?? 1)
      continue
    }
    const len = (b.maxZ - b.minZ) / Math.cos(rx)
    mb.boxR(m, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, b.maxY - b.minY, len, -rx, 0, 0, TEX[m] ?? 1)
  }
  for (const t of zone.tubes) {
    mb.boxC('fixture', t.x, t.y + 0.05, t.z, 1.3, 0.05, 0.16)
    mb.cyl(t.on ? 'tube' : 'tubeDead', t.x, t.y, t.z, 0.026, 1.2, 'x', 6)
  }
  return mb.build()
}

/**
 * Zone version of the garage: same geometry as Level 1, placed at GARAGE_ORIGIN, plus the B1 lobby and ramp.
 * Lights are owned by the always-mounted GarageLights so the shader light count never changes.
 */
export function GarageZoneScene({ zone }: { zone: GarageZoneData }) {
  const { mat } = assets.get()
  const geos = useMemo(() => buildGarage(zone.layout), [zone])
  const connectors = useMemo(() => buildConnectors(zone), [zone])
  useEffect(() => () => disposeGarage(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mat.tubeFlicker.emissiveIntensity = Math.sin(t * 23) * Math.sin(t * 3.1) > 0.75 ? 0.3 : 3.2
  })

  return (
    <>
      <group position={[GARAGE_ORIGIN.x, GARAGE_ORIGIN.y, GARAGE_ORIGIN.z]}>
        <BuiltMeshes geos={geos} materials={mat} />
      </group>
      <BuiltMeshes geos={connectors} materials={mat} />
    </>
  )
}

export function GarageLights({ zone }: { zone: GarageZoneData }) {
  const scale = () => Math.max(1 - zoneEnv.officeLights, inRamp(game.player.x, game.player.z) ? 0.6 : 0)
  return <LightPool lights={zone.lights} count={6} color="#d6e6cc" intensity={6} distance={10} decay={1.7} scale={scale} />
}

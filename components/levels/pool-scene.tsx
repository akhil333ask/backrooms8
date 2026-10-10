'use client'

import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { P, type PoolLayout } from '@/levels/pool-layout'
import { MeshBuilder } from '@/lib/levels-kit/builder'
import { blotches, canvasTexture, causticsTexture, grain, noiseNormalMap } from '@/lib/levels-kit/canvas'
import { glow, lazyResources, std } from '@/lib/levels-kit/resources'
import { BuiltMeshes } from './built-meshes'
import { LightPool } from './light-pool'

function tiles(base: string, grout: string, count: number, seed: number, stain: string, jitter = 6) {
  return canvasTexture(
    512,
    (ctx, s, r) => {
      ctx.fillStyle = grout
      ctx.fillRect(0, 0, s, s)
      const t = s / count
      const g = Math.max(2, t * 0.06)
      const c = new THREE.Color(base)
      for (let y = 0; y < count; y++) {
        for (let x = 0; x < count; x++) {
          const k = 1 + (r() - 0.5) * (jitter / 100)
          ctx.fillStyle = `rgb(${Math.min(255, c.r * 255 * k)},${Math.min(255, c.g * 255 * k)},${Math.min(255, c.b * 255 * k)})`
          ctx.fillRect(x * t + g / 2, y * t + g / 2, t - g, t - g)
          // Glaze sheen along the top edge of each tile
          ctx.fillStyle = 'rgba(255,255,255,0.18)'
          ctx.fillRect(x * t + g / 2, y * t + g / 2, t - g, 1.5)
        }
      }
      blotches(ctx, s, r, 9, (a) => stain.replace('A', String(a)), 20, 90, 0.18)
      grain(ctx, s, r, 8)
    },
    { seed },
  )
}

const assets = lazyResources(() => {
  const wallTex = tiles('#eef3f0', '#b6c2bf', 8, 21, 'rgba(150,140,110,A)')
  const floorTex = tiles('#d3ebe8', '#9fb5b2', 16, 22, 'rgba(120,140,130,A)', 8)
  const poolTex = tiles('#86cbd4', '#5f9ca5', 8, 23, 'rgba(40,90,100,A)', 10)
  const ceilTex = tiles('#f2f5f2', '#cdd3d0', 6, 24, 'rgba(160,150,120,A)', 4)
  const waterNormal = noiseNormalMap(256, 31, 8, 7)
  waterNormal.repeat.set(1, 1)
  const caustA = causticsTexture(256, 41)
  const caustB = caustA.clone()
  caustB.needsUpdate = true
  const lockerTex = canvasTexture(
    128,
    (ctx, s, r) => {
      ctx.fillStyle = '#9db4b8'
      ctx.fillRect(0, 0, s, s)
      ctx.fillStyle = 'rgba(30,45,48,0.55)'
      for (const y0 of [10, 96]) for (let k = 0; k < 5; k++) ctx.fillRect(28, y0 + k * 4, s - 56, 2)
      ctx.fillStyle = '#4c5a5c'
      ctx.fillRect(s - 22, 58, 8, 16)
      ctx.strokeStyle = 'rgba(20,30,32,0.6)'
      ctx.lineWidth = 3
      ctx.strokeRect(3, 3, s - 6, s - 6)
      blotches(ctx, s, r, 6, (a) => `rgba(120,80,50,${a})`, 3, 12, 0.5)
      grain(ctx, s, r, 14)
    },
    { seed: 25 },
  )

  const mat: Record<string, THREE.Material> = {
    wall: std({ map: wallTex, roughness: 0.35 }),
    floor: std({ map: floorTex, roughness: 0.45 }),
    pool: std({ map: poolTex, roughness: 0.3 }),
    ceil: std({ map: ceilTex, roughness: 0.6 }),
    stripe: std({ color: '#1f4f6b', roughness: 0.4 }),
    coping: std({ color: '#e7ece6', roughness: 0.6 }),
    water: new THREE.MeshStandardMaterial({
      color: '#7ccfd6',
      transparent: true,
      opacity: 0.5,
      roughness: 0.05,
      metalness: 0.2,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    caustA: new THREE.MeshBasicMaterial({ map: caustA, color: '#9ff2f5', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
    caustB: new THREE.MeshBasicMaterial({ map: caustB, color: '#bff7ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
    panel: glow('#f1fdff', 2.4),
    panelFrame: std({ color: '#c9d2d0', roughness: 0.5 }),
    steel: std({ color: '#c7cfd1', metalness: 0.85, roughness: 0.25 }),
    locker: std({ color: '#93aaae', roughness: 0.55, metalness: 0.35 }),
    lockerDoor: std({ map: lockerTex, roughness: 0.5, metalness: 0.3 }),
    wood: std({ color: '#a7865f', roughness: 0.7 }),
  }
  return { mat, tex: { wallTex, floorTex, poolTex, ceilTex, waterNormal, caustA, caustB, lockerTex } }
})

export const disposePools = assets.dispose
export const poolMaterials = () => assets.get().mat

function buildPools(L: PoolLayout) {
  const mb = new MeshBuilder()
  const { H, SURF } = P
  const W = P.COLS * P.ROOM
  const D = P.ROWS * P.ROOM

  mb.box('ceil', 0, H, 0, W, H + 0.3, D, 1.8)
  for (const w of L.walls) mb.box('wall', w.minX, w.minY, w.minZ, w.maxX, w.maxY, w.maxZ, 1.2)

  for (const room of L.rooms) {
    const p = room.pool
    if (!p) {
      mb.box('floor', room.x0, -0.3, room.z0, room.x1, 0, room.z1, 1.6)
      continue
    }
    // Deck around the hole
    mb.box('floor', room.x0, -0.3, room.z0, room.x1, 0, p.z0, 1.6)
    mb.box('floor', room.x0, -0.3, p.z1, room.x1, 0, room.z1, 1.6)
    mb.box('floor', room.x0, -0.3, p.z0, p.x0, 0, p.z1, 1.6)
    mb.box('floor', p.x1, -0.3, p.z0, room.x1, 0, p.z1, 1.6)
    const bottom = -p.maxDepth - 0.2
    mb.box('pool', p.x0 - 0.1, bottom, p.z0 - 0.1, p.x1 + 0.1, 0, p.z0, 1.2)
    mb.box('pool', p.x0 - 0.1, bottom, p.z1, p.x1 + 0.1, 0, p.z1 + 0.1, 1.2)
    mb.box('pool', p.x0 - 0.1, bottom, p.z0, p.x0, 0, p.z1, 1.2)
    mb.box('pool', p.x1, bottom, p.z0, p.x1 + 0.1, 0, p.z1, 1.2)
    if (room.kind !== 'wade') {
      mb.box('coping', p.x0 - 0.25, 0, p.z0 - 0.25, p.x1 + 0.25, 0.02, p.z0, 1)
      mb.box('coping', p.x0 - 0.25, 0, p.z1, p.x1 + 0.25, 0.02, p.z1 + 0.25, 1)
      mb.box('coping', p.x0 - 0.25, 0, p.z0, p.x0, 0.02, p.z1, 1)
      mb.box('coping', p.x1, 0, p.z0, p.x1 + 0.25, 0.02, p.z1, 1)
    }
    for (const part of p.parts) {
      mb.box('pool', part.x0, bottom, part.z0, part.x1, -part.depth, part.z1, 1.2)
      mb.box('caustA', part.x0, -part.depth + 0.004, part.z0, part.x1, -part.depth + 0.006, part.z1, 2.2)
      mb.box('caustB', part.x0, -part.depth + 0.008, part.z0, part.x1, -part.depth + 0.01, part.z1, 3.1)
      if (part.kind === 'deep') {
        const alongX = part.x1 - part.x0 > part.z1 - part.z0
        const cx = (part.x0 + part.x1) / 2
        const cz = (part.z0 + part.z1) / 2
        if (alongX) mb.box('stripe', part.x0 + 0.6, -part.depth, cz - 0.12, part.x1 - 0.6, -part.depth + 0.003, cz + 0.12)
        else mb.box('stripe', cx - 0.12, -part.depth, part.z0 + 0.6, cx + 0.12, -part.depth + 0.003, part.z1 - 0.6)
      }
    }
    mb.box('water', p.x0, SURF - 0.004, p.z0, p.x1, SURF, p.z1, 3)
    // Reflected caustics dancing on the ceiling above the water
    mb.box('caustA', p.x0 - 0.6, H - 0.012, p.z0 - 0.6, p.x1 + 0.6, H - 0.01, p.z1 + 0.6, 2.6)
    mb.box('caustB', p.x0 - 0.3, H - 0.008, p.z0 - 0.3, p.x1 + 0.3, H - 0.006, p.z1 + 0.3, 3.6)
  }

  for (const l of L.lights) {
    mb.boxC('panelFrame', l.x, l.y, l.z, 1.3, 0.06, 1.3)
    mb.boxC('panel', l.x, l.y - 0.035, l.z, 1.15, 0.02, 1.15)
  }

  for (const l of L.ladders) {
    const tx = l.nz ? 1 : 0
    const tz = l.nx ? 1 : 0
    for (const s of [-0.32, 0.32]) {
      const px = l.x - l.nx * 0.1 + tx * s
      const pz = l.z - l.nz * 0.1 + tz * s
      mb.cyl('steel', px, -0.55, pz, 0.025, 2.1, 'y', 8)
      const ox = l.x + l.nx * 0.4 + tx * s
      const oz = l.z + l.nz * 0.4 + tz * s
      mb.cyl('steel', ox, 0.45, oz, 0.025, 0.9, 'y', 8)
      mb.cyl('steel', (px + ox) / 2, 0.9, (pz + oz) / 2, 0.025, 0.5, l.nx ? 'x' : 'z', 8)
    }
    for (let y = -1.45; y < -0.1; y += 0.3) {
      mb.cyl('steel', l.x - l.nx * 0.1, y, l.z - l.nz * 0.1, 0.018, 0.64, l.nz ? 'x' : 'z', 6)
    }
  }

  for (const k of L.lockers) {
    const along = k.nx ? 'z' : 'x'
    const hw = along === 'x' ? k.w / 2 - 0.01 : 0.25
    const hd = along === 'x' ? 0.25 : k.w / 2 - 0.01
    mb.box('locker', k.x - hw, 0, k.z - hd, k.x + hw, 1.95, k.z + hd, 1)
    mb.wallQuad('lockerDoor', k.x + k.nx * 0.252, 1.0, k.z + k.nz * 0.252, k.w - 0.06, 1.8, Math.atan2(k.nx, k.nz), [0, 0, 1, 1])
  }

  for (const b of L.benches) {
    mb.box('wood', b.minX, 0.38, b.minZ, b.maxX, 0.45, b.maxZ, 1)
    const legs = b.alongX ? [b.minX + 0.15, b.maxX - 0.2] : [b.minZ + 0.15, b.maxZ - 0.2]
    for (const t of legs) {
      if (b.alongX) mb.box('steel', t, 0, b.minZ + 0.05, t + 0.05, 0.38, b.maxZ - 0.05)
      else mb.box('steel', b.minX + 0.05, 0, t, b.maxX - 0.05, 0.38, t + 0.05)
    }
  }
  return mb.build()
}

/** `lights={false}`: the world's always-mounted WingLights owns the point lights instead. */
export function PoolScene({ extra, lights = true }: { extra: unknown; lights?: boolean }) {
  const layout = extra as PoolLayout
  const { mat, tex } = assets.get()
  const geos = useMemo(() => buildPools(layout), [layout])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    tex.waterNormal.offset.set(t * 0.018, t * 0.011)
    tex.caustA.offset.set(t * 0.021, -t * 0.013)
    tex.caustB.offset.set(-t * 0.016, t * 0.019)
    ;(mat.caustA as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(t * 0.9) * 0.05
  })

  return (
    <>
      <BuiltMeshes geos={geos} materials={mat} />
      {lights && <LightPool lights={layout.lights} count={8} color="#e9fbff" intensity={5} distance={13} decay={1.4} />}
    </>
  )
}

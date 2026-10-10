import * as THREE from 'three'
import { generateLiving, LV, type LivingLayout } from '@/levels/living-layout'
import { generatePools, P, type PoolLayout } from '@/levels/pool-layout'
import type { AABB } from '@/lib/backrooms/collision'
import { CELL, DOOR_H, FLOOR_H, STAIR } from '@/lib/backrooms/constants'
import type { HideSpot } from '@/lib/backrooms/hide-spot'
import { box } from '@/lib/levels-kit/level-helpers'

/**
 * Pool Rooms (Floor 2, west) and Living Room (Floor 1, north) wings.
 * The unchanged Level 2 / Level 3 generators are placed at an origin offset, plus hand-built connector corridors.
 * Colliders and hide spots are floor-local in y (like the yellow floors) and world space in x/z.
 * Connector boxes are world space in x/z and floor-local in y; they are rendered inside a group at y = floor * FLOOR_H.
 */

export const POOL_FLOOR = 2
export const LIVING_FLOOR = 1

export const POOL_ORIGIN = { x: -66, y: POOL_FLOOR * FLOOR_H, z: 4 } as const
export const LIVING_ORIGIN = { x: 1.5, y: LIVING_FLOOR * FLOOR_H, z: -50 } as const

const POOL_W = P.COLS * P.ROOM
const POOL_D = P.ROWS * P.ROOM

/** Yellow Floor 2 west-wall doorways (cell rows) and their world z. */
export const POOL_DOOR_ROWS = [3, 12] as const
const poolDoorZ = POOL_DOOR_ROWS.map((r) => (r + 0.5) * CELL)
/** Yellow Floor 1 north-wall doorways (cell columns) and their world x. */
export const LIVING_DOOR_COLS = [3, 11] as const
const livingDoorX = LIVING_DOOR_COLS.map((c) => (c + 0.5) * CELL)

export const POOL_BOUNDS = {
  x0: POOL_ORIGIN.x,
  x1: POOL_ORIGIN.x + POOL_W,
  z0: POOL_ORIGIN.z,
  z1: POOL_ORIGIN.z + POOL_D,
} as const

/** Pool corridors: from the pool's east wall to the yellow west wall. */
export const POOL_CORRIDORS = poolDoorZ.map((z, i) => ({
  z,
  x0: POOL_BOUNDS.x1 + P.WALL / 2,
  x1: -0.1,
  half: P.ARCH_W / 2,
  ceil: 3,
  arch: i === 0,
}))

const hz0 = LV.HALL_Z - LV.HALL_W / 2
const hz1 = LV.HALL_Z + LV.HALL_W / 2

/** Living hallways: from the yellow north wall (z = 0) north into the wing. */
export const LIVING_HALLS = [
  // A: ordinary doorway -> 38m hallway -> cluster south wall. One flickering lamp.
  { x: livingDoorX[0], z0: LIVING_ORIGIN.z + LV.ROWS * LV.R + LV.T / 2, z1: -0.1, half: LV.HALL_W / 2 },
  // B: second door -> service hallway -> the long internal hallway's south wall.
  { x: livingDoorX[1], z0: LIVING_ORIGIN.z + hz1 + LV.T / 2, z1: -0.1, half: LV.HALL_W / 2 },
]

export interface WingBox {
  m: string
  b: AABB
  tex?: number
}

export interface WingLight {
  x: number
  y: number
  z: number
  flicker?: number
  phase?: number
  power?: number
  color: THREE.Color
  distance: number
}

export interface WingData {
  id: 'pool' | 'living'
  floor: number
  origin: { x: number; y: number; z: number }
  layout: PoolLayout | LivingLayout
  colliders: AABB[]
  hideSpots: HideSpot[]
  lights: WingLight[]
  /** Connector geometry (world x/z, floor-local y), keyed by the wing's own material set. */
  boxes: WingBox[]
}

const offBox = (b: AABB, o: { x: number; z: number }): AABB => ({
  ...b,
  minX: b.minX + o.x,
  maxX: b.maxX + o.x,
  minZ: b.minZ + o.z,
  maxZ: b.maxZ + o.z,
})

function offsetSpot(s: HideSpot, prefix: string, floor: number, o: { x: number; z: number }): HideSpot {
  return {
    ...s,
    id: `${prefix}-${s.id}`,
    floor,
    position: { ...s.position, x: s.position.x + o.x, z: s.position.z + o.z },
    cameraPose: { ...s.cameraPose, x: s.cameraPose.x + o.x, z: s.cameraPose.z + o.z },
    exitPoint: { x: s.exitPoint.x + o.x, z: s.exitPoint.z + o.z },
    bounds: offBox(s.bounds, o),
  }
}

const POOL_LIGHT = new THREE.Color('#e9fbff')
const ARCH_LIGHT = new THREE.Color('#cfefff')
const LAMP_LIGHT = new THREE.Color('#ff9d55')
const TV_LIGHT = new THREE.Color('#a9b9ff')

export function buildPoolWing(seed: number): WingData {
  const o = POOL_ORIGIN
  const data = generatePools(seed, { eastOpenings: poolDoorZ.map((z) => z - o.z) })
  const layout = data.extra as PoolLayout
  const colliders = data.floors[0].colliders.map((b) => offBox(b, o))
  const boxes: WingBox[] = []
  const lights: WingLight[] = layout.lights.map((l, i) => ({
    x: l.x + o.x,
    y: l.y - 0.15,
    z: l.z + o.z,
    color: POOL_LIGHT,
    distance: 13,
    power: 5 / 5.2,
    phase: i,
  }))
  const solid = (m: string, b: AABB, tex?: number) => {
    boxes.push({ m, b, tex })
    colliders.push(b)
  }
  const deco = (m: string, b: AABB, tex?: number) => boxes.push({ m, b, tex })

  for (const c of POOL_CORRIDORS) {
    const za = c.z - c.half
    const zb = c.z + c.half
    deco('floor', box(c.x0, -0.3, za, c.x1 + 0.1, 0, zb), 1.6)
    deco('ceil', box(c.x0, c.ceil, za - 0.15, c.x1 + 0.1, c.ceil + 0.2, zb + 0.15), 1.8)
    solid('wall', box(c.x0, 0, za - 0.15, c.x1, c.ceil, za), 1.2)
    solid('wall', box(c.x0, 0, zb, c.x1, c.ceil, zb + 0.15), 1.2)
    // Fill above the pool archway (2.9) up to the corridor ceiling.
    deco('wall', box(c.x0 - 0.15, P.ARCH_H, za, c.x0, c.ceil, zb), 1.2)
    // Wall closing the corridor against the yellow building, with a doorway the size of the yellow door.
    const dh = 0.65
    solid('wall', box(c.x1 - 0.12, 0, za, c.x1, c.ceil, c.z - dh), 1.2)
    solid('wall', box(c.x1 - 0.12, 0, c.z + dh, c.x1, c.ceil, zb), 1.2)
    deco('wall', box(c.x1 - 0.12, DOOR_H, c.z - dh, c.x1, c.ceil, c.z + dh), 1.2)
    // Wet floor: still puddles along the corridor.
    for (let x = c.x0 + 2; x < c.x1 - 1.5; x += 3.1) {
      const w = 0.6 + ((x * 7.3) % 1) * 0.9
      const dz = (((x * 3.7) % 1) - 0.5) * 1.2
      deco('water', box(x - w, 0.002, c.z + dz - 0.45, x + w, 0.006, c.z + dz + 0.45), 3)
    }
    for (let x = c.x0 + 3; x < c.x1 - 1; x += 5) {
      deco('panelFrame', box(x - 0.55, c.ceil - 0.06, c.z - 0.55, x + 0.55, c.ceil, c.z + 0.55))
      deco('panel', box(x - 0.48, c.ceil - 0.08, c.z - 0.48, x + 0.48, c.ceil - 0.06, c.z + 0.48))
      lights.push({ x, y: c.ceil - 0.25, z: c.z, color: POOL_LIGHT, distance: 9, power: 0.55, flicker: x % 2 < 0.3 ? 0.12 : 0, phase: x })
    }
    if (c.arch) {
      // Tiled archway just past the yellow door with a faint blue-white glow.
      const ax0 = c.x1 - 1.4
      const ax1 = c.x1 - 0.12
      solid('coping', box(ax0, 0, za, ax1, P.ARCH_H, c.z - 0.75), 1)
      solid('coping', box(ax0, 0, c.z + 0.75, ax1, P.ARCH_H, zb), 1)
      deco('coping', box(ax0, 2.3, c.z - 0.75, ax1, P.ARCH_H, c.z + 0.75), 1)
      deco('panel', box(ax0 + 0.2, 2.28, c.z - 0.6, ax1 - 0.2, 2.3, c.z + 0.6))
      lights.push({ x: c.x1 - 0.9, y: 2.1, z: c.z, color: ARCH_LIGHT, distance: 6, power: 0.4 })
    }
  }

  return {
    id: 'pool',
    floor: POOL_FLOOR,
    origin: o,
    layout,
    colliders,
    hideSpots: data.hideSpots.map((s) => offsetSpot(s, 'pool', POOL_FLOOR, o)),
    lights,
    boxes,
  }
}

export function buildLivingWing(seed: number): WingData {
  const o = LIVING_ORIGIN
  const data = generateLiving(seed, {
    southOpenings: [LIVING_HALLS[0].x - o.x],
    hallSouthOpenings: [LIVING_HALLS[1].x - o.x],
  })
  const layout = data.extra as LivingLayout
  const colliders = data.floors[0].colliders.map((b) => offBox(b, o))
  const boxes: WingBox[] = []
  const lights: WingLight[] = [
    ...layout.lamps.map((l) => ({ ...l, x: l.x + o.x, z: l.z + o.z, color: LAMP_LIGHT, distance: 8, power: 1.4 })),
    ...layout.tvs.map((l) => ({ ...l, x: l.x + o.x, z: l.z + o.z, color: TV_LIGHT, distance: 4.5, power: 1.4 / 5.2 })),
  ]
  const solid = (m: string, b: AABB, tex?: number) => {
    boxes.push({ m, b, tex })
    colliders.push(b)
  }
  const deco = (m: string, b: AABB, tex?: number) => boxes.push({ m, b, tex })
  const { H, T } = LV

  LIVING_HALLS.forEach((h, i) => {
    const xa = h.x - h.half
    const xb = h.x + h.half
    deco('carpet', box(xa, -0.1, h.z0, xb, 0, h.z1 + 0.1), 1.5)
    deco('ceil', box(xa - T, H, h.z0, xb + T, H + 0.1, h.z1 + 0.1), 2)
    deco('runner', box(h.x - 0.4, 0, h.z0 + 0.3, h.x + 0.4, 0.004, h.z1 - 0.3), 1.5)
    for (const [x0, x1] of [
      [xa - T, xa],
      [xb, xb + T],
    ]) {
      solid('paper2', box(x0, 0, h.z0, x1, H, h.z1), 1.3)
      deco('trim', box(x0 - 0.03, 0, h.z0, x1 + 0.03, 0.1, h.z1))
      deco('trim', box(x0 - 0.05, H - 0.16, h.z0, x1 + 0.05, H, h.z1))
    }
    // Header between the 2.6m hallway ceiling and the yellow 3m ceiling at the doorway.
    deco('paper2', box(xa - T, H, h.z1 - 0.05, xb + T, 3, h.z1 + 0.1), 1.3)
    const lamps = i === 0 ? [(h.z0 + h.z1) / 2] : [h.z1 - 14, h.z0 + 12]
    lamps.forEach((z, k) => {
      const dir = k % 2 ? -1 : 1
      const wx = dir > 0 ? xa : xb
      const span = (a: number, b: number) => [Math.min(wx + dir * a, wx + dir * b), Math.max(wx + dir * a, wx + dir * b)]
      const [bx0, bx1] = span(0, 0.06)
      const [sx0, sx1] = span(0.06, 0.3)
      deco('brass', box(bx0, 1.77, z - 0.06, bx1, 1.93, z + 0.06))
      deco('sconce', box(sx0, 1.82, z - 0.11, sx1, 1.98, z + 0.11))
      lights.push({
        x: wx + dir * 0.2,
        y: 1.85,
        z,
        color: LAMP_LIGHT,
        distance: 8,
        power: i === 0 ? 0.9 : 0.55,
        flicker: i === 0 ? 0.35 : 0,
        phase: z,
      })
    })
  })

  return {
    id: 'living',
    floor: LIVING_FLOOR,
    origin: o,
    layout,
    colliders,
    hideSpots: data.hideSpots.map((s) => offsetSpot(s, 'living', LIVING_FLOOR, o)),
    lights,
    boxes,
  }
}

/** Pool wing including its corridors (x < 0 on Floor 2, outside the stairwell). */
export const inPoolWing = (x: number, z: number) =>
  x < -0.05 && x > POOL_BOUNDS.x0 - 0.5 && z > POOL_BOUNDS.z0 - 0.5 && z < POOL_BOUNDS.z1 + 0.5 && !(x > STAIR.x0 - 0.3 && z > STAIR.z0 - 0.3 && z < STAIR.z1 + 0.3)

/** Living wing including its hallways (z < 0 on Floor 1). */
export const inLivingWing = (x: number, z: number) => z < -0.05 && z > LIVING_ORIGIN.z - 3 && x > LIVING_ORIGIN.x - 1 && x < LIVING_ORIGIN.x + 58

export const inPoolRooms = (x: number, z: number) =>
  x > POOL_BOUNDS.x0 && x < POOL_BOUNDS.x1 && z > POOL_BOUNDS.z0 && z < POOL_BOUNDS.z1

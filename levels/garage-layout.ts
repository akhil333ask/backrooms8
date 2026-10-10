import type { AABB } from '@/lib/backrooms/collision'
import type { HideSpot } from '@/lib/backrooms/hide-spot'
import { mulberry32 } from '@/lib/backrooms/rng'
import { wallWithOpenings } from '@/lib/levels-kit/builder'
import { box, customFloor, makeSpot } from '@/lib/levels-kit/level-helpers'
import type { LevelData } from './types'

export const G = {
  X: 68,
  Z: 54,
  DECK: 1.3,
  CEIL: 2.6,
  BAND0: 30,
  BAND1: 38,
  CAR_L: 4.3,
  CAR_W: 1.8,
  BAYS: 11,
  BAY_W: 2.5,
  /** z ranges of the two ramps (they line up with the outer aisles). */
  RAMPS: [
    [5.5, 12.5],
    [41.5, 48.5],
  ] as [number, number][],
  AISLES: [9, 27, 45],
  PILLAR_LINES: [18, 36],
  PILLAR_K: [3, 6, 9],
} as const

export const ROWS = [
  { l: 'A', zc: 2.75, rear: 1 },
  { l: 'B', zc: 14.95, rear: -1 },
  { l: 'C', zc: 21.05, rear: 1 },
  { l: 'D', zc: 32.95, rear: -1 },
  { l: 'E', zc: 39.05, rear: 1 },
  { l: 'F', zc: 50.95, rear: -1 },
] as const

export const deckBase = (d: number) => (d ? G.DECK : 0)
export const bayX0 = (d: number) => (d ? 39.25 : 1.25)
export const bayCenter = (d: number, i: number) => bayX0(d) + G.BAY_W / 2 + G.BAY_W * i
export const ceilAt = (d: number) => deckBase(d) + G.CEIL

export interface GarageCar {
  x: number
  z: number
  base: number
  rear: number
  color: number
  /** 0 closed, otherwise which side (+x / -x) has the open driver door. */
  doorSide: number
  trunk: boolean
}

export interface GarageRoom {
  x0: number
  x1: number
  z0: number
  z1: number
  base: number
  frontZ: number
  /** +1 when the room lies on the +z side of its front wall. */
  inward: number
  sideX: number
  doorX: number
}

export interface GarageLight {
  x: number
  y: number
  z: number
  on: boolean
  flicker: number
  phase: number
}

export interface GarageLayout {
  cars: GarageCar[]
  barrels: { x: number; y: number; z: number }[]
  lights: GarageLight[]
  pillars: { x: number; z: number; base: number }[]
  bays: { d: number; row: number; i: number }[]
  rooms: GarageRoom[]
  /** Concrete wall pieces (rendered + collided). */
  walls: AABB[]
  shelves: AABB[]
}

const ROOMS_AT = [
  { d: 0, row: 5, from: 0, to: 2 },
  { d: 1, row: 0, from: 8, to: 10 },
]
const inRoomBay = (d: number, row: number, i: number) => ROOMS_AT.some((r) => r.d === d && r.row === row && i >= r.from && i <= r.to)

export interface GarageOptions {
  /** Local-space rects whose bays stay empty (no cars or barrels), e.g. in front of a doorway. */
  keepClear?: { x0: number; z0: number; x1: number; z1: number }[]
  /** Doorways in the south (z = G.Z) or east (x = G.X) perimeter wall, opening from the upper deck. */
  openings?: { wall: 's' | 'e'; at: number; width: number; height: number }[]
}

export function generateGarage(levelSeed: number, opts: GarageOptions = {}): LevelData {
  const rand = mulberry32(levelSeed)
  const colliders: AABB[] = []
  const hideSpots: HideSpot[] = []
  const walls: AABB[] = []
  const shelves: AABB[] = []
  const wall = (b: AABB) => {
    walls.push(b)
    colliders.push(b)
  }

  // Perimeter + the solid band between the two decks (open only at the ramps)
  wall(box(-0.4, 0, -0.4, 0, 4.3, G.Z + 0.4))
  const perimeter = (side: 's' | 'e', fixed: number, from: number, to: number) => {
    const ops = (opts.openings ?? []).filter((o) => o.wall === side)
    const axis = side === 's' ? 'x' : 'z'
    const openings = ops.map((o) => ({ at: o.at, width: o.width, height: G.DECK + o.height }))
    for (const sg of wallWithOpenings(axis, fixed, from, to, openings, 0.4, 4.3, 0)) wall(box(sg.x0, sg.y0, sg.z0, sg.x1, sg.y1, sg.z1))
    for (const o of ops) {
      const a = o.at - o.width / 2
      const b = o.at + o.width / 2
      wall(axis === 'x' ? box(a, 0, fixed - 0.2, b, G.DECK, fixed + 0.2) : box(fixed - 0.2, 0, a, fixed + 0.2, G.DECK, b))
    }
  }
  perimeter('e', G.X + 0.2, -0.4, G.Z + 0.4)
  wall(box(0, 0, -0.4, G.X, 4.3, 0))
  perimeter('s', G.Z + 0.2, 0, G.X)
  wall(box(G.BAND0, 0, 0, G.BAND1, 4.3, G.RAMPS[0][0]))
  wall(box(G.BAND0, 0, G.RAMPS[0][1], G.BAND1, 4.3, G.RAMPS[1][0]))
  wall(box(G.BAND0, 0, G.RAMPS[1][1], G.BAND1, 4.3, G.Z))

  const pillars: GarageLayout['pillars'] = []
  for (const d of [0, 1]) {
    const base = deckBase(d)
    for (const k of G.PILLAR_K) {
      const x = bayX0(d) + G.BAY_W * k
      for (const z of G.PILLAR_LINES) {
        pillars.push({ x, z, base })
        colliders.push(box(x - 0.3, base, z - 0.45, x + 0.3, base + G.CEIL, z + 0.45))
      }
      // Pilasters on the perimeter walls
      colliders.push(box(x - 0.3, base, 0, x + 0.3, base + G.CEIL, 0.35))
      colliders.push(box(x - 0.3, base, G.Z - 0.35, x + 0.3, base + G.CEIL, G.Z))
    }
  }

  // Maintenance rooms
  const rooms: GarageRoom[] = []
  for (const r of ROOMS_AT) {
    const base = deckBase(r.d)
    const x0 = r.d ? bayX0(1) + G.BAY_W * r.from : 0
    const x1 = r.d ? G.X : bayX0(0) + G.BAY_W * (r.to + 1)
    const inward = r.row === 0 ? -1 : 1
    const frontZ = r.row === 0 ? 5.5 : 48.5
    const z0 = inward > 0 ? frontZ : 0
    const z1 = inward > 0 ? G.Z : frontZ
    const sideX = r.d ? x0 : x1
    const doorX = (x0 + x1) / 2 + (r.d ? 1 : -1)
    const room: GarageRoom = { x0, x1, z0, z1, base, frontZ, inward, sideX, doorX }
    rooms.push(room)
    for (const s of wallWithOpenings('x', frontZ, x0, x1, [{ at: doorX, width: 1.1, height: 2.1 }], 0.2, G.CEIL, base)) {
      wall(box(s.x0, s.y0, s.z0, s.x1, s.y1, s.z1))
    }
    wall(box(sideX - 0.1, base, z0, sideX + 0.1, base + G.CEIL, z1))

    // Shelving along the back wall, a corner hide spot on each side of it
    const backZ = inward > 0 ? z1 : z0
    const sx0 = (x0 + x1) / 2 - 1.8
    const sx1 = (x0 + x1) / 2 + 1.8
    const shelf = inward > 0 ? box(sx0, base, backZ - 0.6, sx1, base + 2.1, backZ) : box(sx0, base, backZ, sx1, base + 2.1, backZ + 0.6)
    shelves.push(shelf)
    colliders.push(shelf)
    for (const [n, sx] of [
      [0, x0 + 1.1],
      [1, x1 - 1.1],
    ] as const) {
      const sz = backZ - inward * 0.75
      hideSpots.push(
        makeSpot({
          id: `g-room-${r.d}-${n}`,
          type: 'closet',
          label: 'in maintenance room',
          x: sx,
          y: base + 1.1,
          z: sz,
          dir: { x: 0, z: -inward },
          camX: sx,
          camZ: backZ - inward * 0.35,
          camY: base + 1.55,
          bounds: box(sx - 0.55, base, Math.min(sz, backZ) - 0.2, sx + 0.55, base + 2.1, Math.max(sz, backZ) + 0.2),
          exitDist: 1.1,
        }),
      )
    }
  }

  // Parking bays: occupancy first so doors only swing into empty neighbours
  const bays: GarageLayout['bays'] = []
  const occupied = new Set<string>()
  const isClear = (d: number, row: number, i: number) =>
    (opts.keepClear ?? []).some((r) => {
      const x = bayCenter(d, i)
      const z = ROWS[row].zc
      return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
    })
  const key = (d: number, row: number, i: number) => `${d}-${row}-${i}`
  for (const d of [0, 1]) {
    for (let row = 0; row < ROWS.length; row++) {
      for (let i = 0; i < G.BAYS; i++) {
        if (inRoomBay(d, row, i)) continue
        bays.push({ d, row, i })
        if (rand() < 0.58 && !isClear(d, row, i)) occupied.add(key(d, row, i))
      }
    }
  }
  const isEmptyBay = (d: number, row: number, i: number) =>
    i >= 0 && i < G.BAYS && !inRoomBay(d, row, i) && !occupied.has(key(d, row, i))

  const cars: GarageCar[] = []
  const barrels: GarageLayout['barrels'] = []
  for (const { d, row, i } of bays) {
    const base = deckBase(d)
    const x = bayCenter(d, i)
    const { zc: z, rear } = ROWS[row]
    const rearZ = z + rear * (G.CAR_L / 2)
    if (!occupied.has(key(d, row, i))) {
      if (rand() < 0.16 && !isClear(d, row, i)) {
        const n = 2 + Math.floor(rand() * 3)
        for (let b = 0; b < n; b++) {
          barrels.push({ x: x + (b % 2 ? 0.34 : -0.34), y: base + (b >= 2 ? 0.9 : 0), z: z + (b % 2 ? -0.2 : 0.25) })
        }
        colliders.push(box(x - 0.7, base, z - 0.6, x + 0.7, base + (n > 2 ? 1.8 : 0.9), z + 0.6))
      }
      continue
    }
    const freeSides = [-1, 1].filter((s) => isEmptyBay(d, row, i + s))
    const doorSide = freeSides.length && rand() < 0.22 ? freeSides[Math.floor(rand() * freeSides.length)] : 0
    const trunk = rand() < 0.2
    cars.push({ x, z, base, rear, color: Math.floor(rand() * 7), doorSide, trunk })
    colliders.push(box(x - 0.92, base, z - G.CAR_L / 2 - 0.05, x + 0.92, base + 1.45, z + G.CAR_L / 2 + 0.05))
    if (doorSide) {
      const hz = z - rear * 0.6
      const a = 1.05
      const vx = doorSide * Math.sin(a)
      const vz = rear * Math.cos(a)
      const hx = x + doorSide * 0.9
      colliders.push(
        box(Math.min(hx, hx + vx) - 0.05, base + 0.3, Math.min(hz, hz + vz) - 0.05, Math.max(hx, hx + vx) + 0.05, base + 1.3, Math.max(hz, hz + vz) + 0.05),
      )
    }
    const carBounds = box(x - 0.92, base, z - G.CAR_L / 2, x + 0.92, base + 1.45, z + G.CAR_L / 2)
    hideSpots.push(
      makeSpot({
        id: `g-under-${d}-${row}-${i}`,
        type: 'desk',
        label: 'under car',
        x,
        y: base + 0.45,
        z: rearZ,
        dir: { x: 0, z: rear },
        camX: x,
        camZ: rearZ - rear * 1.1,
        camY: base + 0.2,
        bounds: carBounds,
        crouch: true,
        concealment: 0.6,
        exitDist: 1.1,
      }),
    )
    if (trunk) {
      hideSpots.push(
        makeSpot({
          id: `g-trunk-${d}-${row}-${i}`,
          type: 'closet',
          label: 'in car trunk',
          x,
          y: base + 1.0,
          z: rearZ - rear * 0.45,
          dir: { x: 0, z: rear },
          camX: x,
          camZ: rearZ - rear * 0.75,
          camY: base + 0.95,
          bounds: box(x - 0.85, base + 0.55, Math.min(rearZ, rearZ - rear * 1.05), x + 0.85, base + 1.05, Math.max(rearZ, rearZ - rear * 1.05)),
          crouch: true,
          concealment: 0.85,
          exitDist: 1.3,
        }),
      )
    }
    const side = freeSides.find((s) => s !== doorSide)
    if (side && rand() < 0.5) {
      hideSpots.push(
        makeSpot({
          id: `g-behind-${d}-${row}-${i}`,
          type: 'partition',
          label: 'behind car',
          x: x + side * 1.05,
          y: base + 0.7,
          z,
          dir: { x: side, z: 0 },
          camX: x + side * 1.12,
          camZ: z + rear * 1.4,
          camY: base + 0.95,
          bounds: carBounds,
          crouch: true,
          exitDist: 0.6,
        }),
      )
    }
  }

  // Behind pillars that have an empty bay next to them
  for (const p of pillars) {
    const d = p.base > 0 ? 1 : 0
    const k = Math.round((p.x - bayX0(d)) / G.BAY_W)
    const rowBehind = p.z === 18 ? 1 : 3
    for (const s of [-1, 1]) {
      const i = s < 0 ? k - 1 : k
      if (!isEmptyBay(d, rowBehind, i) || !isEmptyBay(d, rowBehind + 1, i)) continue
      hideSpots.push(
        makeSpot({
          id: `g-pillar-${d}-${p.x}-${p.z}-${s}`,
          type: 'pillar',
          label: 'behind pillar',
          x: p.x + s * 0.55,
          y: p.base + 1,
          z: p.z,
          dir: { x: s, z: 0 },
          camX: p.x + s * 0.42,
          camZ: p.z + 0.62,
          camY: p.base + 1.0,
          bounds: box(p.x - 0.3, p.base, p.z - 0.45, p.x + 0.3, p.base + G.CEIL, p.z + 0.45),
          exitDist: 0.7,
        }),
      )
      break
    }
  }

  // Tube lights: most are dead
  const lights: GarageLight[] = []
  const addLight = (x: number, y: number, z: number, force = false) => {
    const on = force || rand() < 0.38
    lights.push({ x, y, z, on, flicker: on && !force && rand() < 0.4 ? 0.12 + rand() * 0.3 : 0, phase: rand() * 10 })
  }
  for (const d of [0, 1]) {
    const y = ceilAt(d) - 0.1
    const xs = d ? [42.5, 50.5, 58, 65] : [4.5, 12.5, 20, 27]
    for (const az of G.AISLES) for (const x of xs) addLight(x, y, az, d === 0 && az === 27 && x === 4.5)
    for (const pz of G.PILLAR_LINES) for (const x of [xs[1], xs[2]]) addLight(x, y, pz)
  }
  for (const [z0, z1] of G.RAMPS) addLight((G.BAND0 + G.BAND1) / 2, G.DECK + G.CEIL - 0.1, (z0 + z1) / 2)
  for (const r of rooms) {
    lights.push({ x: (r.x0 + r.x1) / 2, y: r.base + G.CEIL - 0.1, z: (r.z0 + r.z1) / 2, on: true, flicker: 0.35, phase: rand() * 10 })
  }

  const extra: GarageLayout = { cars, barrels, lights, pillars, bays, rooms, walls, shelves }
  return { floors: [customFloor(colliders)], hideSpots, extra }
}

export function garageGroundAt(_extra: unknown, x: number) {
  if (x <= G.BAND0) return 0
  if (x >= G.BAND1) return G.DECK
  return ((x - G.BAND0) / (G.BAND1 - G.BAND0)) * G.DECK
}

import type { AABB } from '@/lib/backrooms/collision'
import type { HideSpot } from '@/lib/backrooms/hide-spot'
import { mulberry32 } from '@/lib/backrooms/rng'
import { wallWithOpenings } from '@/lib/levels-kit/builder'
import { box, customFloor, makeSpot, pick, shuffle, type Rect } from '@/lib/levels-kit/level-helpers'
import type { LevelData } from './types'

export const LV = {
  R: 6,
  COLS: 3,
  ROWS: 2,
  H: 2.6,
  T: 0.15,
  DOOR_W: 0.95,
  DOOR_H: 2.05,
  HALL_X0: 18,
  HALL_X1: 48,
  HALL_Z: 3,
  HALL_W: 1.6,
  /** The room at the end of the hallway whose doors lead back into itself. */
  LOOP: { x0: 48, z0: 0, x1: 54, z1: 6 },
  VEST: 1.6,
} as const

export type Side = 'n' | 's' | 'w' | 'e'
export type RoomKind = 'living' | 'den' | 'dining' | 'bedroom'
export type ItemKind = 'sofa' | 'armchair' | 'tv' | 'bookshelf' | 'wardrobe' | 'bed' | 'curtain' | 'coffee' | 'dining' | 'lamp'

/** Local furniture frame: u runs along the wall, v points into the room. */
export interface Frame {
  ox: number
  oz: number
  ux: number
  uz: number
  nx: number
  nz: number
}

export interface Item {
  kind: ItemKind
  f: Frame
  on?: boolean
}

export interface Wall extends AABB {
  mat: 'paper' | 'paper2'
}

export interface DoorOpening {
  axis: 'x' | 'z'
  fixed: number
  at: number
  w: number
}

export interface LivingLayout {
  walls: Wall[]
  doors: DoorOpening[]
  floors: Rect[]
  rooms: (Rect & { kind: RoomKind })[]
  items: Item[]
  lamps: { x: number; y: number; z: number; flicker: number; phase: number }[]
  tvs: { x: number; y: number; z: number; flicker: number; phase: number }[]
  fakeDoors: { x: number; z: number; nz: number }[]
  pictures: { x: number; z: number; nz: number; w: number; h: number }[]
  sconces: { x: number; z: number; nz: number; on: boolean }[]
}

const SOFA_GAP = 0.7

/** Footprint per item in the local frame: half length along u, v range, height. */
export const FOOT: Record<ItemKind, { u: number; v0: number; v1: number; h: number }> = {
  sofa: { u: 1.0, v0: SOFA_GAP, v1: SOFA_GAP + 0.9, h: 0.9 },
  armchair: { u: 0.45, v0: 0.15, v1: 1.05, h: 0.9 },
  tv: { u: 0.55, v0: 0.02, v1: 0.52, h: 1.1 },
  bookshelf: { u: 0.5, v0: 0.02, v1: 0.37, h: 1.9 },
  wardrobe: { u: 0.6, v0: 0.02, v1: 0.62, h: 2.0 },
  bed: { u: 0.78, v0: 0.02, v1: 2.1, h: 0.65 },
  curtain: { u: 0.9, v0: 0.28, v1: 0.4, h: 2.4 },
  coffee: { u: 0.5, v0: -0.28, v1: 0.28, h: 0.45 },
  dining: { u: 0.8, v0: -0.45, v1: 0.45, h: 0.77 },
  lamp: { u: 0.2, v0: -0.2, v1: 0.2, h: 1.7 },
}

export const toWorld = (f: Frame, u: number, v: number) => ({ x: f.ox + u * f.ux + v * f.nx, z: f.oz + u * f.uz + v * f.nz })

/** World AABB of a local rect (frames are axis-aligned, so this is exact). */
export function lbox(f: Frame, u0: number, v0: number, u1: number, v1: number, y0: number, y1: number): AABB {
  const a = toWorld(f, u0, v0)
  const b = toWorld(f, u1, v1)
  return box(Math.min(a.x, b.x), y0, Math.min(a.z, b.z), Math.max(a.x, b.x), y1, Math.max(a.z, b.z))
}

export const footBox = (it: Item) => {
  const ft = FOOT[it.kind]
  return lbox(it.f, -ft.u, ft.v0, ft.u, ft.v1, 0, ft.h)
}

/** Chair positions around a dining table, in the table's local frame. */
export const CHAIRS: { u: number; v: number; fu: number; fv: number }[] = [
  { u: -0.4, v: -0.78, fu: 0, fv: 1 },
  { u: 0.4, v: -0.78, fu: 0, fv: 1 },
  { u: -0.4, v: 0.78, fu: 0, fv: -1 },
  { u: 0.4, v: 0.78, fu: 0, fv: -1 },
  { u: -1.1, v: 0, fu: 1, fv: 0 },
  { u: 1.1, v: 0, fu: -1, fv: 0 },
]

const overlaps = (a: AABB, b: AABB, pad = 0.08) =>
  a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad

function wallFrame(r: Rect, side: Side, t: number): Frame {
  const h = LV.T / 2
  if (side === 'n') return { ox: t, oz: r.z0 + h, ux: 1, uz: 0, nx: 0, nz: 1 }
  if (side === 's') return { ox: t, oz: r.z1 - h, ux: -1, uz: 0, nx: 0, nz: -1 }
  if (side === 'w') return { ox: r.x0 + h, oz: t, ux: 0, uz: -1, nx: 1, nz: 0 }
  return { ox: r.x1 - h, oz: t, ux: 0, uz: 1, nx: -1, nz: 0 }
}

const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', w: 'e', e: 'w' }

export interface LivingOptions {
  /** Extra doorways (local x) in the cluster's south outer wall, used when the Living Room is a wing of the world. */
  southOpenings?: number[]
  /** Extra doorways (local x) in the long hallway's south wall. */
  hallSouthOpenings?: number[]
}

export function generateLiving(levelSeed: number, opts: LivingOptions = {}): LevelData {
  const rand = mulberry32(levelSeed)
  const colliders: AABB[] = []
  const hideSpots: HideSpot[] = []
  const walls: Wall[] = []
  const doors: DoorOpening[] = []
  const items: Item[] = []
  const lamps: LivingLayout['lamps'] = []
  const tvs: LivingLayout['tvs'] = []
  const { R, COLS, ROWS, H, T, DOOR_W, DOOR_H, LOOP, VEST } = LV

  const addWall = (
    axis: 'x' | 'z',
    fixed: number,
    from: number,
    to: number,
    openings: { at: number; w: number }[],
    mat: Wall['mat'],
  ) => {
    for (const o of openings) doors.push({ axis, fixed, at: o.at, w: o.w })
    for (const s of wallWithOpenings(axis, fixed, from, to, openings.map((o) => ({ at: o.at, width: o.w, height: DOOR_H })), T, H)) {
      const b = box(s.x0, s.y0, s.z0, s.x1, s.y1, s.z1)
      walls.push({ ...b, mat })
      colliders.push(b)
    }
  }

  // Cluster of rooms: every neighbour pair gets a door at a random offset
  const rooms: LivingLayout['rooms'] = []
  const kinds = shuffle(rand, ['living', 'den', 'dining', 'bedroom', 'bedroom', pick(rand, ['living', 'dining'] as const)] as RoomKind[])
  const roomDoors: Record<Side, { at: number; w: number }[]>[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      rooms.push({ x0: c * R, z0: r * R, x1: (c + 1) * R, z1: (r + 1) * R, kind: kinds[r * COLS + c] })
      roomDoors.push({ n: [], s: [], w: [], e: [] })
    }
  }
  const at = () => 1.3 + rand() * (R - 2.6)
  for (let c = 0; c <= COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const ops: { at: number; w: number }[] = []
      if (c > 0 && c < COLS) ops.push({ at: r * R + at(), w: DOOR_W })
      if (c === COLS && r === 0) ops.push({ at: LV.HALL_Z, w: 1.2 })
      for (const o of ops) {
        if (c > 0) roomDoors[r * COLS + c - 1].e.push(o)
        if (c < COLS) roomDoors[r * COLS + c].w.push(o)
      }
      addWall('z', c * R, r * R, (r + 1) * R, ops, 'paper')
    }
  }
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ops: { at: number; w: number }[] = r > 0 && r < ROWS ? [{ at: c * R + at(), w: DOOR_W }] : []
      for (const o of ops) {
        roomDoors[(r - 1) * COLS + c].s.push(o)
        roomDoors[r * COLS + c].n.push(o)
      }
      if (r === ROWS) {
        for (const x of opts.southOpenings ?? []) {
          if (x <= c * R + 0.8 || x >= (c + 1) * R - 0.8) continue
          const o = { at: x, w: 1.2 }
          ops.push(o)
          roomDoors[(r - 1) * COLS + c].s.push(o)
        }
      }
      addWall('x', r * R, c * R, (c + 1) * R, ops, 'paper')
    }
  }

  // The hallway that is far too long
  const { HALL_X0, HALL_X1, HALL_Z, HALL_W } = LV
  const hz0 = HALL_Z - HALL_W / 2
  const hz1 = HALL_Z + HALL_W / 2
  addWall('x', hz0, HALL_X0, HALL_X1, [], 'paper2')
  const hallOpenings = opts.hallSouthOpenings ?? []
  addWall('x', hz1, HALL_X0, HALL_X1, hallOpenings.map((x) => ({ at: x, w: 1.2 })), 'paper2')
  const fakeDoors: LivingLayout['fakeDoors'] = []
  const pictures: LivingLayout['pictures'] = []
  const sconces: LivingLayout['sconces'] = []
  for (let x = HALL_X0 + 3; x < HALL_X1 - 2; x += 2.5 + rand() * 2) {
    const nz = rand() < 0.5 ? 1 : -1
    const z = nz > 0 ? hz0 + T / 2 : hz1 - T / 2
    const blocked = nz < 0 && hallOpenings.some((o) => Math.abs(o - x) < 1.4)
    if (rand() < 0.45) {
      if (!blocked) fakeDoors.push({ x, z, nz })
    } else {
      const w = 0.4 + rand() * 0.4
      const h = 0.35 + rand() * 0.3
      if (!blocked) pictures.push({ x, z, nz, w, h })
    }
  }
  for (let x = HALL_X0 + 2; x < HALL_X1; x += 5) {
    const nz = Math.round(x) % 2 ? 1 : -1
    sconces.push({ x, z: nz > 0 ? hz0 + T / 2 : hz1 - T / 2, nz, on: rand() < 0.45 || x === HALL_X0 + 2 })
  }

  // Loop room at the end of the hallway plus its two dead vestibules
  const mid = (LOOP.x0 + LOOP.x1) / 2
  addWall('z', LOOP.x0, LOOP.z0, LOOP.z1, [{ at: HALL_Z, w: 1.2 }], 'paper')
  addWall('z', LOOP.x1, LOOP.z0, LOOP.z1, [{ at: HALL_Z, w: DOOR_W }], 'paper')
  addWall('x', LOOP.z0, LOOP.x0, LOOP.x1, [{ at: mid, w: DOOR_W }], 'paper')
  addWall('x', LOOP.z1, LOOP.x0, LOOP.x1, [{ at: mid, w: DOOR_W }], 'paper')
  const vh = DOOR_W / 2 + T
  addWall('x', HALL_Z - vh, LOOP.x1, LOOP.x1 + VEST, [], 'paper2')
  addWall('x', HALL_Z + vh, LOOP.x1, LOOP.x1 + VEST, [], 'paper2')
  addWall('z', LOOP.x1 + VEST, HALL_Z - vh, HALL_Z + vh, [], 'paper2')
  for (const [z0, z1, back] of [
    [LOOP.z0 - VEST, LOOP.z0, LOOP.z0 - VEST],
    [LOOP.z1, LOOP.z1 + VEST, LOOP.z1 + VEST],
  ]) {
    addWall('z', mid - vh, z0, z1, [], 'paper2')
    addWall('z', mid + vh, z0, z1, [], 'paper2')
    addWall('x', back, mid - vh, mid + vh, [], 'paper2')
  }

  const floors: Rect[] = [
    { x0: 0, z0: 0, x1: COLS * R, z1: ROWS * R },
    { x0: HALL_X0, z0: hz0, x1: HALL_X1, z1: hz1 },
    LOOP,
    { x0: LOOP.x1, z0: HALL_Z - vh, x1: LOOP.x1 + VEST, z1: HALL_Z + vh },
    { x0: mid - vh, z0: LOOP.z0 - VEST, x1: mid + vh, z1: LOOP.z0 },
    { x0: mid - vh, z0: LOOP.z1, x1: mid + vh, z1: LOOP.z1 + VEST },
  ]

  // Furniture
  const addItem = (it: Item, id: string) => {
    items.push(it)
    const f = it.f
    const fb = footBox(it)
    if (it.kind !== 'dining' && it.kind !== 'lamp') colliders.push(fb)
    if (it.kind === 'lamp') {
      colliders.push(lbox(f, -0.17, -0.17, 0.17, 0.17, 0, 1.7))
      if (it.on) lamps.push({ x: f.ox, y: 1.5, z: f.oz, flicker: rand() < 0.25 ? 0.08 : 0, phase: rand() * 10 })
    }
    if (it.kind === 'dining') {
      colliders.push(lbox(f, -0.8, -0.45, 0.8, 0.45, 0.6, 0.77))
      for (const sx of [-0.74, 0.7]) for (const sz of [-0.4, 0.36]) colliders.push(lbox(f, sx, sz, sx + 0.04, sz + 0.04, 0, 0.77))
      for (const c of CHAIRS) colliders.push(lbox(f, c.u - 0.21, c.v - 0.21, c.u + 0.21, c.v + 0.21, 0, 0.95))
      const p = toWorld(f, 0, 0)
      hideSpots.push(
        makeSpot({
          id,
          type: 'desk',
          label: 'under dining table',
          x: p.x,
          y: 0.35,
          z: p.z,
          dir: { x: f.ux, z: f.uz },
          camY: 0.32,
          bounds: lbox(f, -0.8, -0.45, 0.8, 0.45, 0, 0.77),
          crouch: true,
          concealment: 0.5,
          exitDist: 1.5,
        }),
      )
    }
    if (it.kind === 'tv') {
      const p = toWorld(f, 0, 1.1)
      tvs.push({ x: p.x, y: 0.9, z: p.z, flicker: 0.35, phase: rand() * 10 })
    }
    if (it.kind === 'sofa') {
      const p = toWorld(f, 0, SOFA_GAP / 2)
      hideSpots.push(
        makeSpot({
          id,
          type: 'partition',
          label: 'behind sofa',
          x: p.x,
          y: 0.5,
          z: p.z,
          dir: { x: f.nx, z: f.nz },
          camY: 0.85,
          bounds: fb,
          crouch: true,
          concealment: 0.55,
          exitDist: SOFA_GAP / 2 + 1.35,
        }),
      )
    }
    if (it.kind === 'wardrobe') {
      const p = toWorld(f, 0, FOOT.wardrobe.v1)
      const c = toWorld(f, 0, 0.3)
      hideSpots.push(
        makeSpot({ id, type: 'closet', label: 'in wardrobe', x: p.x, y: 1.1, z: p.z, dir: { x: f.nx, z: f.nz }, camX: c.x, camZ: c.z, camY: 1.55, bounds: fb, exitDist: 0.65 }),
      )
    }
    if (it.kind === 'bed') {
      const c = toWorld(f, 0, 1.05)
      hideSpots.push(
        makeSpot({
          id,
          type: 'desk',
          label: 'under bed',
          x: c.x,
          y: 0.2,
          z: c.z,
          dir: { x: f.ux, z: f.uz },
          camY: 0.16,
          bounds: fb,
          crouch: true,
          concealment: 0.7,
          exitDist: 1.25,
        }),
      )
    }
    if (it.kind === 'curtain') {
      const p = toWorld(f, 0, 0.42)
      const c = toWorld(f, 0, 0.14)
      hideSpots.push(
        makeSpot({
          id,
          type: 'closet',
          label: 'behind curtains',
          x: p.x,
          y: 1.2,
          z: p.z,
          dir: { x: f.nx, z: f.nz },
          camX: c.x,
          camZ: c.z,
          camY: 1.6,
          bounds: lbox(f, -0.9, 0, 0.9, 0.4, 0, 2.4),
          concealment: 0.65,
          exitDist: 0.55,
        }),
      )
    }
  }

  rooms.forEach((room, ri) => {
    const rd = roomDoors[ri]
    const taken: AABB[] = []
    // Keep a clear path in front of every door
    for (const side of ['n', 's', 'w', 'e'] as Side[]) {
      for (const d of rd[side]) {
        const f = wallFrame(room, side, d.at)
        taken.push(lbox(f, -d.w / 2 - 0.15, -0.2, d.w / 2 + 0.15, 1.3, 0, 1))
      }
    }
    const exterior = (s: Side) => (s === 'n' && room.z0 === 0) || (s === 'w' && room.x0 === 0) || (s === 's' && room.z1 === ROWS * R) || (s === 'e' && room.x1 === COLS * R)
    const cx = (room.x0 + room.x1) / 2
    const cz = (room.z0 + room.z1) / 2

    const tryWall = (kind: ItemKind, prefer: Side[] = []) => {
      const ft = FOOT[kind]
      const order = [...prefer, ...shuffle(rand, ['n', 's', 'w', 'e'] as Side[]).filter((s) => !prefer.includes(s))]
      for (const side of order) {
        if (kind === 'curtain' && !exterior(side)) continue
        for (let k = 0; k < 6; k++) {
          const lo = (side === 'n' || side === 's' ? room.x0 : room.z0) + T / 2 + ft.u + 0.1
          const hi = (side === 'n' || side === 's' ? room.x1 : room.z1) - T / 2 - ft.u - 0.1
          const t = lo + rand() * (hi - lo)
          const it: Item = { kind, f: wallFrame(room, side, t) }
          const clear = lbox(it.f, -ft.u, 0, ft.u, ft.v1, 0, 1)
          if (taken.some((b) => overlaps(b, clear))) continue
          taken.push(clear)
          addItem(it, `l-${kind}-${ri}-${items.length}`)
          return side
        }
      }
      return null
    }
    const center = (kind: ItemKind, rot: boolean, half: [number, number]) => {
      const f: Frame = rot ? { ox: cx, oz: cz, ux: 0, uz: 1, nx: 1, nz: 0 } : { ox: cx, oz: cz, ux: 1, uz: 0, nx: 0, nz: 1 }
      taken.push(lbox(f, -half[0], -half[1], half[0], half[1], 0, 1))
      addItem({ kind, f }, `l-${kind}-${ri}-${items.length}`)
    }

    if (room.kind === 'living') {
      center('coffee', rand() < 0.5, [0.6, 0.4])
      const tv = tryWall('tv')
      tryWall('sofa', tv ? [OPPOSITE[tv]] : [])
      tryWall('armchair')
      tryWall('bookshelf')
      tryWall('curtain')
    } else if (room.kind === 'den') {
      const tv = tryWall('tv')
      tryWall('armchair', tv ? [OPPOSITE[tv]] : [])
      tryWall('bookshelf')
      tryWall('bookshelf')
      tryWall('curtain')
    } else if (room.kind === 'dining') {
      center('dining', rand() < 0.5, [1.45, 1.05])
      tryWall('bookshelf')
      tryWall('curtain')
      tryWall('curtain')
    } else {
      tryWall('bed')
      tryWall('wardrobe')
      tryWall('curtain')
      tryWall('bookshelf')
    }

    // A lamp in a random corner, usually switched on
    const corners = shuffle(rand, [
      [room.x0, room.z0, 1, 1],
      [room.x1, room.z0, -1, 1],
      [room.x0, room.z1, 1, -1],
      [room.x1, room.z1, -1, -1],
    ])
    for (const corner of corners) {
      const lx = corner[0] + corner[2] * (T / 2 + 0.32)
      const lz = corner[1] + corner[3] * (T / 2 + 0.32)
      if (taken.some((b) => overlaps(b, box(lx - 0.2, 0, lz - 0.2, lx + 0.2, 1, lz + 0.2), 0.02))) continue
      addItem({ kind: 'lamp', f: { ox: lx, oz: lz, ux: 1, uz: 0, nx: 0, nz: 1 }, on: rand() < 0.8 }, `l-lamp-${ri}`)
      break
    }
  })

  // Loop room: hand-placed, it should feel like a living room you've already been in
  const L = LOOP
  const lr = { ...L }
  addItem({ kind: 'tv', f: wallFrame(lr, 'e', 1.25) }, 'l-loop-tv')
  addItem({ kind: 'armchair', f: wallFrame(lr, 'e', 4.9) }, 'l-loop-arm')
  addItem({ kind: 'sofa', f: wallFrame(lr, 's', 49.25) }, 'l-loop-sofa')
  addItem({ kind: 'bookshelf', f: wallFrame(lr, 'n', 49.4) }, 'l-loop-shelf')
  addItem({ kind: 'coffee', f: { ox: 49.25, oz: 4.0, ux: 1, uz: 0, nx: 0, nz: 1 } }, 'l-loop-coffee')
  addItem({ kind: 'lamp', f: { ox: L.x0 + 0.4, oz: L.z0 + 0.4, ux: 1, uz: 0, nx: 0, nz: 1 }, on: true }, 'l-loop-lamp')
  addItem({ kind: 'lamp', f: { ox: L.x1 - 0.4, oz: L.z1 - 0.4, ux: 1, uz: 0, nx: 0, nz: 1 }, on: true }, 'l-loop-lamp2')
  for (const s of sconces) if (s.on) lamps.push({ x: s.x, y: 1.85, z: s.z + s.nz * 0.15, flicker: rand() < 0.4 ? 0.15 : 0, phase: rand() * 10 })

  const extra: LivingLayout = { walls, doors, floors, rooms, items, lamps, tvs, fakeDoors, pictures, sconces }
  return { floors: [customFloor(colliders)], hideSpots, extra }
}

/**
 * The loop room's east and north doors are wrong: stepping through either one
 * brings you back in through the opposite door of the same room.
 */
export function livingAfterMove(_extra: unknown, pos: { x: number; z: number }) {
  const { LOOP, HALL_Z, VEST } = LV
  const mid = (LOOP.x0 + LOOP.x1) / 2
  const shift = LOOP.x1 - LOOP.x0 + VEST
  if (pos.x > LOOP.x1 + 0.35 && pos.x < LOOP.x1 + VEST && Math.abs(pos.z - HALL_Z) < 0.7) pos.x -= shift
  else if (pos.z < LOOP.z0 - 0.35 && pos.z > LOOP.z0 - VEST && Math.abs(pos.x - mid) < 0.7) pos.z += LOOP.z1 - LOOP.z0 + VEST
}

export const livingSpawn = () => ({ floor: 0, x: LV.HALL_X0 + 1.2, z: LV.HALL_Z, yaw: -Math.PI / 2 })

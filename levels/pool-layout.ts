import type { AABB } from '@/lib/backrooms/collision'
import type { HideSpot } from '@/lib/backrooms/hide-spot'
import { mulberry32 } from '@/lib/backrooms/rng'
import { wallWithOpenings } from '@/lib/levels-kit/builder'
import { box, customFloor, makeSpot, pick, shuffle, type Rect } from '@/lib/levels-kit/level-helpers'
import type { LevelData, WaterMedium } from './types'

export const P = {
  ROOM: 12,
  COLS: 4,
  ROWS: 3,
  H: 3.6,
  WALL: 0.3,
  /** Water surface sits just below the deck. */
  SURF: -0.1,
  SHALLOW: 0.55,
  WADE: 0.35,
  DEEP: 2.6,
  ARCH_W: 2.4,
  ARCH_H: 2.9,
} as const

export type PoolRoomKind = 'changing' | 'pool' | 'split' | 'wade'
export type Side = 'n' | 's' | 'w' | 'e'

export interface PoolPart extends Rect {
  depth: number
  kind: 'shallow' | 'deep'
}

export interface Pool extends Rect {
  parts: PoolPart[]
  maxDepth: number
}

export interface PoolRoom extends Rect {
  kind: PoolRoomKind
  pool: Pool | null
  /** Archway centers per side (world coordinate along that wall). */
  doors: Record<Side, number[]>
}

export interface Ladder {
  x: number
  z: number
  /** Outward normal (pool -> deck). */
  nx: number
  nz: number
}

export interface Locker {
  x: number
  z: number
  /** Inward normal (wall -> room). */
  nx: number
  nz: number
  w: number
}

export interface Bench extends AABB {
  /** True when the bench runs along x. */
  alongX: boolean
}

export interface PoolLayout {
  rooms: PoolRoom[]
  walls: AABB[]
  ladders: Ladder[]
  lockers: Locker[]
  benches: Bench[]
  lights: { x: number; y: number; z: number }[]
}

const LOCKER_W = 0.62
const LOCKER_D = 0.5
const LOCKER_H = 1.95

const inR = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1

/** Free intervals along one wall of a room, avoiding archways and corners. */
function freeSpans(room: PoolRoom, side: Side, margin: number): [number, number][] {
  const horiz = side === 'n' || side === 's'
  const lo = (horiz ? room.x0 : room.z0) + P.WALL / 2 + margin
  const hi = (horiz ? room.x1 : room.z1) - P.WALL / 2 - margin
  const cuts = room.doors[side].map((d) => [d - P.ARCH_W / 2 - 0.4, d + P.ARCH_W / 2 + 0.4] as const).sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let cur = lo
  for (const [a, b] of cuts) {
    if (a > cur) out.push([cur, Math.min(a, hi)])
    cur = Math.max(cur, b)
  }
  if (cur < hi) out.push([cur, hi])
  return out.filter(([a, b]) => b - a > 0.3)
}

/** Point on the inner wall surface and the inward normal for a side. */
function wallFrame(room: PoolRoom, side: Side, t: number) {
  const h = P.WALL / 2
  if (side === 'n') return { x: t, z: room.z0 + h, nx: 0, nz: 1 }
  if (side === 's') return { x: t, z: room.z1 - h, nx: 0, nz: -1 }
  if (side === 'w') return { x: room.x0 + h, z: t, nx: 1, nz: 0 }
  return { x: room.x1 - h, z: t, nx: -1, nz: 0 }
}

export interface PoolOptions {
  /** Extra archways in the east outer wall (local z), used when the pools are a wing of the world. */
  eastOpenings?: number[]
}

export function generatePools(levelSeed: number, opts: PoolOptions = {}): LevelData {
  const rand = mulberry32(levelSeed)
  const colliders: AABB[] = []
  const hideSpots: HideSpot[] = []
  const walls: AABB[] = []
  const { ROOM, COLS, ROWS, H, WALL } = P
  const idx = (c: number, r: number) => r * COLS + c

  // Random spanning tree over the room grid, plus a few loops
  const edges = new Set<string>()
  const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const seen = new Set<number>([0])
  const stack = [0]
  while (stack.length) {
    const cur = stack[stack.length - 1]
    const c = cur % COLS
    const r = Math.floor(cur / COLS)
    const nbrs = shuffle(rand, [
      [c - 1, r],
      [c + 1, r],
      [c, r - 1],
      [c, r + 1],
    ]).filter(([nc, nr]) => nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && !seen.has(idx(nc, nr)))
    if (!nbrs.length) {
      stack.pop()
      continue
    }
    const n = idx(nbrs[0][0], nbrs[0][1])
    edges.add(ekey(cur, n))
    seen.add(n)
    stack.push(n)
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c < COLS - 1 && rand() < 0.35) edges.add(ekey(idx(c, r), idx(c + 1, r)))
      if (r < ROWS - 1 && rand() < 0.35) edges.add(ekey(idx(c, r), idx(c, r + 1)))
    }
  }

  // Room kinds: start in a changing room, one more somewhere else
  const kinds: PoolRoomKind[] = ['changing']
  const extraChanging = 1 + Math.floor(rand() * (COLS * ROWS - 1))
  for (let i = 1; i < COLS * ROWS; i++) kinds.push(i === extraChanging ? 'changing' : pick(rand, ['pool', 'split', 'split', 'wade', 'pool'] as const))

  const rooms: PoolRoom[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      rooms.push({ x0: c * ROOM, z0: r * ROOM, x1: (c + 1) * ROOM, z1: (r + 1) * ROOM, kind: kinds[idx(c, r)], pool: null, doors: { n: [], s: [], w: [], e: [] } })
    }
  }

  const wall = (b: AABB) => {
    walls.push(b)
    colliders.push(b)
  }
  const arch = () => 3 + rand() * (ROOM - 6)

  // Vertical grid lines (walls along z)
  for (let c = 0; c <= COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const open = c > 0 && c < COLS && edges.has(ekey(idx(c - 1, r), idx(c, r)))
      const at = r * ROOM + arch()
      if (open) {
        rooms[idx(c - 1, r)].doors.e.push(at)
        rooms[idx(c, r)].doors.w.push(at)
      }
      const ats = open ? [at] : []
      if (c === COLS) {
        for (const o of opts.eastOpenings ?? []) {
          if (o <= r * ROOM || o >= (r + 1) * ROOM) continue
          rooms[idx(c - 1, r)].doors.e.push(o)
          ats.push(o)
        }
      }
      const segs = wallWithOpenings('z', c * ROOM, r * ROOM, (r + 1) * ROOM, ats.map((a) => ({ at: a, width: P.ARCH_W, height: P.ARCH_H })), WALL, H)
      for (const s of segs) wall(box(s.x0, s.y0, s.z0, s.x1, s.y1, s.z1))
    }
  }
  // Horizontal grid lines (walls along x)
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const open = r > 0 && r < ROWS && edges.has(ekey(idx(c, r - 1), idx(c, r)))
      const at = c * ROOM + arch()
      if (open) {
        rooms[idx(c, r - 1)].doors.s.push(at)
        rooms[idx(c, r)].doors.n.push(at)
      }
      const segs = wallWithOpenings('x', r * ROOM, c * ROOM, (c + 1) * ROOM, open ? [{ at, width: P.ARCH_W, height: P.ARCH_H }] : [], WALL, H)
      for (const s of segs) wall(box(s.x0, s.y0, s.z0, s.x1, s.y1, s.z1))
    }
  }

  const ladders: Ladder[] = []
  const lockers: Locker[] = []
  const benches: Bench[] = []
  const lights: PoolLayout['lights'] = []

  const addBench = (id: string, x: number, z: number, alongX: boolean, dir: { x: number; z: number }) => {
    const hl = 1.1
    const hd = 0.22
    const b: Bench = { ...(alongX ? box(x - hl, 0, z - hd, x + hl, 0.45, z + hd) : box(x - hd, 0, z - hl, x + hd, 0.45, z + hl)), alongX }
    benches.push(b)
    colliders.push(b)
    hideSpots.push(
      makeSpot({
        id,
        type: 'desk',
        label: 'under bench',
        x,
        y: 0.25,
        z,
        dir,
        camY: 0.2,
        bounds: b,
        crouch: true,
        concealment: 0.5,
        exitDist: 0.85,
      }),
    )
  }

  rooms.forEach((room, ri) => {
    const cx = (room.x0 + room.x1) / 2
    const cz = (room.z0 + room.z1) / 2
    for (const ox of [-3, 3]) for (const oz of [-3, 3]) lights.push({ x: cx + ox, y: H - 0.05, z: cz + oz })

    if (room.kind === 'changing') {
      // Lockers lining the walls, every third one can be entered
      let n = 0
      for (const side of ['n', 's', 'w', 'e'] as Side[]) {
        for (const [a, b] of freeSpans(room, side, 0.45)) {
          const count = Math.floor((b - a) / LOCKER_W)
          const start = (a + b) / 2 - (count * LOCKER_W) / 2 + LOCKER_W / 2
          for (let k = 0; k < count; k++) {
            const f = wallFrame(room, side, start + k * LOCKER_W)
            const lx = f.x + f.nx * (LOCKER_D / 2)
            const lz = f.z + f.nz * (LOCKER_D / 2)
            const hw = f.nx ? LOCKER_D / 2 : LOCKER_W / 2
            const hd = f.nx ? LOCKER_W / 2 : LOCKER_D / 2
            const bounds = box(lx - hw, 0, lz - hd, lx + hw, LOCKER_H, lz + hd)
            lockers.push({ x: lx, z: lz, nx: f.nx, nz: f.nz, w: LOCKER_W })
            colliders.push(bounds)
            if (n++ % 3 === 1) {
              hideSpots.push(
                makeSpot({
                  id: `p-locker-${ri}-${side}-${k}-${a.toFixed(1)}`,
                  type: 'locker',
                  label: 'in changing-room locker',
                  x: lx + f.nx * (LOCKER_D / 2),
                  y: 1.1,
                  z: lz + f.nz * (LOCKER_D / 2),
                  dir: { x: f.nx, z: f.nz },
                  camX: lx,
                  camZ: lz,
                  camY: 1.55,
                  bounds,
                  exitDist: 0.65,
                }),
              )
            }
          }
        }
      }
      addBench(`p-bench-${ri}-a`, cx, cz - 1.7, true, { x: 0, z: 1 })
      addBench(`p-bench-${ri}-b`, cx, cz + 1.7, true, { x: 0, z: -1 })
      return
    }

    // Pool basin
    const inset = room.kind === 'wade' ? WALL / 2 : 2.4
    const ix = room.kind === 'wade' ? inset : inset + rand() * 1.2
    const iz = room.kind === 'wade' ? inset : inset + rand() * 1.2
    const rect: Rect = { x0: room.x0 + ix, z0: room.z0 + iz, x1: room.x1 - ix, z1: room.z1 - iz }
    const parts: PoolPart[] = []
    if (room.kind === 'wade') {
      parts.push({ ...rect, depth: P.WADE, kind: 'shallow' })
    } else if (room.kind === 'pool') {
      parts.push({ ...rect, depth: P.DEEP, kind: 'deep' })
    } else {
      const alongX = rect.x1 - rect.x0 >= rect.z1 - rect.z0
      const frac = 0.4 + rand() * 0.15
      const flip = rand() < 0.5
      if (alongX) {
        const at = flip ? rect.x1 - (rect.x1 - rect.x0) * frac : rect.x0 + (rect.x1 - rect.x0) * frac
        parts.push({ ...rect, x1: at, depth: flip ? P.DEEP : P.SHALLOW, kind: flip ? 'deep' : 'shallow' })
        parts.push({ ...rect, x0: at, depth: flip ? P.SHALLOW : P.DEEP, kind: flip ? 'shallow' : 'deep' })
      } else {
        const at = flip ? rect.z1 - (rect.z1 - rect.z0) * frac : rect.z0 + (rect.z1 - rect.z0) * frac
        parts.push({ ...rect, z1: at, depth: flip ? P.DEEP : P.SHALLOW, kind: flip ? 'deep' : 'shallow' })
        parts.push({ ...rect, z0: at, depth: flip ? P.SHALLOW : P.DEEP, kind: flip ? 'shallow' : 'deep' })
      }
    }
    room.pool = { ...rect, parts, maxDepth: Math.max(...parts.map((p) => p.depth)) }
    if (room.kind === 'wade') return

    // A ladder on an outer edge of each deep part, with a crouch spot beside it
    for (const part of parts) {
      if (part.kind !== 'deep') continue
      const opts: Ladder[] = []
      if (part.z0 === rect.z0) opts.push({ x: (part.x0 + part.x1) / 2, z: part.z0, nx: 0, nz: -1 })
      if (part.z1 === rect.z1) opts.push({ x: (part.x0 + part.x1) / 2, z: part.z1, nx: 0, nz: 1 })
      if (part.x0 === rect.x0) opts.push({ x: part.x0, z: (part.z0 + part.z1) / 2, nx: -1, nz: 0 })
      if (part.x1 === rect.x1) opts.push({ x: part.x1, z: (part.z0 + part.z1) / 2, nx: 1, nz: 0 })
      const l = pick(rand, opts)
      ladders.push(l)
      const tx = l.nz ? 1 : 0
      const tz = l.nx ? 1 : 0
      const lb = box(
        Math.min(l.x, l.x + l.nx * 0.45) - tx * 0.38 - tz * 0.02,
        0,
        Math.min(l.z, l.z + l.nz * 0.45) - tz * 0.38 - tx * 0.02,
        Math.max(l.x, l.x + l.nx * 0.45) + tx * 0.38 + tz * 0.02,
        1.0,
        Math.max(l.z, l.z + l.nz * 0.45) + tz * 0.38 + tx * 0.02,
      )
      colliders.push(lb)
      const side = rand() < 0.5 ? -1 : 1
      const sx = l.x + l.nx * 0.35 + tx * side * 0.75
      const sz = l.z + l.nz * 0.35 + tz * side * 0.75
      hideSpots.push(
        makeSpot({
          id: `p-ladder-${ri}-${parts.indexOf(part)}`,
          type: 'pillar',
          label: 'behind pool ladder',
          x: sx,
          y: 0.6,
          z: sz,
          dir: { x: l.nx, z: l.nz },
          camX: sx - tx * side * 0.2,
          camZ: sz - tz * side * 0.2,
          camY: 0.9,
          bounds: lb,
          crouch: true,
          concealment: 0.35,
          exitDist: 0.7,
        }),
      )
    }

    // A bench on the deck along a wall without an archway in the way
    for (const side of shuffle(rand, ['n', 's', 'w', 'e'] as Side[])) {
      const span = freeSpans(room, side, 0.6).find(([a, b]) => b - a > 2.4)
      if (!span) continue
      const t = (span[0] + span[1]) / 2
      const f = wallFrame(room, side, t)
      addBench(`p-bench-${ri}`, f.x + f.nx * 0.55, f.z + f.nz * 0.55, side === 'n' || side === 's', { x: f.nx, z: f.nz })
      break
    }
  })

  const extra: PoolLayout = { rooms, walls, ladders, lockers, benches, lights }
  return { floors: [customFloor(colliders)], hideSpots, extra }
}

function partAt(L: PoolLayout, x: number, z: number): PoolPart | null {
  const c = Math.floor(x / P.ROOM)
  const r = Math.floor(z / P.ROOM)
  const room = L.rooms[r * P.COLS + c]
  if (!room?.pool || !inR(room.pool, x, z)) return null
  return room.pool.parts.find((p) => inR(p, x, z)) ?? null
}

export function poolGroundAt(extra: unknown, x: number, z: number, _feet: number, crouching: boolean) {
  const part = partAt(extra as PoolLayout, x, z)
  if (!part) return 0
  if (part.kind === 'shallow') return -part.depth
  // Deep water: float with the head just above the surface, sink to the bottom while crouching
  return crouching ? -part.depth : P.SURF - 1.45
}

export function poolMedium(extra: unknown, x: number, z: number): WaterMedium {
  const part = partAt(extra as PoolLayout, x, z)
  if (!part) return { kind: 'dry', speed: 1, surface: P.SURF }
  return part.kind === 'deep' ? { kind: 'deep', speed: 0.5, surface: P.SURF } : { kind: 'shallow', speed: 0.62, surface: P.SURF }
}

export const poolSpawn = () => ({ floor: 0, x: P.ROOM / 2, z: P.ROOM / 2, yaw: -Math.PI / 2 })

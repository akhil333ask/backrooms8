import { CEIL_H, CELL, DOOR_GAP, DOOR_H, ELEV, GRID, LOBBY, SHAFT, STAIR, WALL_T } from './constants'
import { aabb, fromCenter, type AABB } from './collision'
import type { BoxSpec } from './geometry'
import {
  boxStack,
  chair,
  cubicleWall,
  doorLeaf,
  filingCabinet,
  footprint,
  lockers,
  placeProp,
  reception,
  serverRack,
  shelf,
  sinkCounter,
  toiletStalls,
  trashBin,
  waterCooler,
  workstation,
  type MatBox,
  type Prop,
} from './props'
import { hashSeed, int, mulberry32, pick, shuffle, type Rng } from './rng'

export const enum CellType {
  Normal = 0,
  Lobby = 1,
  Solid = 2,
  Hall = 3,
  Room = 4,
}

/** Edge values */
const OPEN = 0
const WALL = 1
const DOOR = 2
const PARTIAL = 3

export type Zone = 0 | 1
export type Side = 'n' | 's' | 'w' | 'e'
export type RoomType = 'office' | 'storage' | 'restroom' | 'server'

export interface ZonedBox {
  spec: BoxSpec
  zone: Zone
}

export interface LightPanel {
  x: number
  z: number
  rotated: boolean
  dim: number
  /** 0 normal, 1 flicker, 2 dead */
  state: 0 | 1 | 2
  phase: number
}

export interface FloorData {
  index: number
  cells: Uint8Array
  zones: Uint8Array
  walls: ZonedBox[]
  baseboards: ZonedBox[]
  pillars: { x: number; z: number; zone: Zone }[]
  hangingTiles: ZonedBox[]
  lights: LightPanel[]
  props: MatBox[]
  details: MatBox[]
  colliders: AABB[]
  lobbyZone: Zone
}

interface Rect {
  cx0: number
  cz0: number
  w: number
  h: number
}

interface Room extends Rect {
  type: RoomType
  door?: { side: Side; cx: number; cz: number }
}

const cellIdx = (cx: number, cz: number) => cz * GRID + cx
const hIdx = (cx: number, cz: number) => cz * GRID + cx
const vIdx = (cx: number, cz: number) => cz * (GRID + 1) + cx

const DIRS: { side: Side; dx: number; dz: number }[] = [
  { side: 'n', dx: 0, dz: -1 },
  { side: 's', dx: 0, dz: 1 },
  { side: 'w', dx: -1, dz: 0 },
  { side: 'e', dx: 1, dz: 0 },
]

class Edges {
  h = new Uint8Array((GRID + 1) * GRID).fill(WALL)
  v = new Uint8Array(GRID * (GRID + 1)).fill(WALL)
  partialEnd = new Map<string, number>()

  get(cx: number, cz: number, side: Side): number {
    if (side === 'n') return this.h[hIdx(cx, cz)]
    if (side === 's') return this.h[hIdx(cx, cz + 1)]
    if (side === 'w') return this.v[vIdx(cx, cz)]
    return this.v[vIdx(cx + 1, cz)]
  }

  set(cx: number, cz: number, side: Side, val: number) {
    if (side === 'n') this.h[hIdx(cx, cz)] = val
    else if (side === 's') this.h[hIdx(cx, cz + 1)] = val
    else if (side === 'w') this.v[vIdx(cx, cz)] = val
    else this.v[vIdx(cx + 1, cz)] = val
  }
}

function rectsOverlap(a: Rect, b: Rect, pad: number) {
  return a.cx0 - pad < b.cx0 + b.w && b.cx0 - pad < a.cx0 + a.w && a.cz0 - pad < b.cz0 + b.h && b.cz0 - pad < a.cz0 + a.h
}

const LOBBY_RECT: Rect = { cx0: LOBBY.cx0, cz0: LOBBY.cz0, w: LOBBY.cx1 - LOBBY.cx0 + 1, h: LOBBY.cz1 - LOBBY.cz0 + 2 }
const STAIR_RECT: Rect = { cx0: 0, cz0: STAIR.doorCell.cz - 1, w: 2, h: 3 }
/** Straight corridor from the stairwell door east into the lobby. */
const STAIR_CORRIDOR: Rect = { cx0: 0, cz0: STAIR.doorCell.cz, w: LOBBY.cx0, h: 1 }

export interface FloorOptions {
  /** Force every cell into one wallpaper zone (e.g. 1 = tan/dark Zone B). Applied after the RNG draws so the maze is unchanged. */
  zone?: Zone
  /** Extra doorways in the east outer wall (cell rows), e.g. the vehicle ramp on Floor 1. */
  eastDoors?: number[]
  /** Extra doorways in the west outer wall (cell rows), e.g. the Pool Rooms wing on Floor 2. */
  westDoors?: number[]
  /** Extra doorways in the north outer wall (cell columns), e.g. the Living Room wing on Floor 1. */
  northDoors?: number[]
}

export function generateFloor(seed: number, index: number, opts: FloorOptions = {}): FloorData {
  const rng = mulberry32(hashSeed(seed, index * 7919 + 13))
  const cells = new Uint8Array(GRID * GRID)
  const region = new Int32Array(GRID * GRID)
  for (let i = 0; i < region.length; i++) region[i] = i
  const edges = new Edges()

  // Zones on a 3x3 coarse grid
  const zoneGrid = Array.from({ length: 9 }, () => (rng() < 0.5 ? 1 : 0) as Zone)
  if (zoneGrid.every((z) => z === zoneGrid[0])) zoneGrid[int(rng, 0, 8)] = (1 - zoneGrid[0]) as Zone
  const dimGrid = Array.from({ length: 9 }, () => (rng() < 0.7 ? 1 : 0.45 + rng() * 0.25))
  const coarse = (cx: number, cz: number) => Math.floor(cz / 6) * 3 + Math.floor(cx / 6)
  const zones = new Uint8Array(GRID * GRID)
  for (let cz = 0; cz < GRID; cz++)
    for (let cx = 0; cx < GRID; cx++) zones[cellIdx(cx, cz)] = opts.zone ?? zoneGrid[coarse(cx, cz)]
  const zoneAt = (cx: number, cz: number): Zone =>
    zones[cellIdx(Math.min(GRID - 1, Math.max(0, cx)), Math.min(GRID - 1, Math.max(0, cz)))] as Zone

  const markRect = (r: Rect, type: CellType, id: number) => {
    for (let z = r.cz0; z < r.cz0 + r.h; z++)
      for (let x = r.cx0; x < r.cx0 + r.w; x++) {
        cells[cellIdx(x, z)] = type
        region[cellIdx(x, z)] = id
      }
  }
  const openInterior = (r: Rect) => {
    for (let z = r.cz0; z < r.cz0 + r.h; z++)
      for (let x = r.cx0; x < r.cx0 + r.w; x++) {
        if (x < r.cx0 + r.w - 1) edges.set(x, z, 'e', OPEN)
        if (z < r.cz0 + r.h - 1) edges.set(x, z, 's', OPEN)
      }
  }

  // Lobby + shaft
  const lobby: Rect = { cx0: LOBBY.cx0, cz0: LOBBY.cz0, w: LOBBY.cx1 - LOBBY.cx0 + 1, h: LOBBY.cz1 - LOBBY.cz0 + 1 }
  markRect(lobby, CellType.Lobby, -1)
  openInterior(lobby)
  const shaft: Rect = { cx0: SHAFT.cx0, cz0: SHAFT.cz0, w: SHAFT.cx1 - SHAFT.cx0 + 1, h: 1 }
  markRect(shaft, CellType.Solid, -2)
  edges.set(SHAFT.cx0, SHAFT.cz0, 'e', OPEN)
  edges.set(SHAFT.cx0, SHAFT.cz0, 'n', OPEN)
  edges.set(SHAFT.cx1, SHAFT.cz0, 'n', OPEN)

  // Big open pillar halls
  const reserved: Rect[] = [LOBBY_RECT, STAIR_RECT, STAIR_CORRIDOR]
  const halls: Rect[] = []
  for (let tries = 0; tries < 120 && halls.length < 4; tries++) {
    const r: Rect = { cx0: int(rng, 0, GRID - 5), cz0: int(rng, 0, GRID - 5), w: int(rng, 5, 8), h: int(rng, 5, 7) }
    if (r.cx0 + r.w > GRID || r.cz0 + r.h > GRID) continue
    if ([...reserved, ...halls].some((o) => rectsOverlap(r, o, 0))) continue
    halls.push(r)
  }
  halls.forEach((r, i) => {
    markRect(r, CellType.Hall, -10 - i)
    openInterior(r)
  })

  // Small rooms
  const roomTypes: RoomType[] = ['server', 'restroom', 'storage', 'office', 'office']
  const rooms: Room[] = []
  for (let tries = 0; tries < 200 && rooms.length < roomTypes.length; tries++) {
    const big = rng() < 0.4
    const r: Rect = { cx0: int(rng, 0, GRID - 2), cz0: int(rng, 0, GRID - 2), w: big && rng() < 0.5 ? 3 : 2, h: big ? 3 : 2 }
    if (r.cx0 + r.w > GRID || r.cz0 + r.h > GRID) continue
    if ([...reserved, ...halls, ...rooms].some((o) => rectsOverlap(r, o, 1))) continue
    rooms.push({ ...r, type: roomTypes[rooms.length] })
  }
  rooms.forEach((r, i) => {
    markRect(r, CellType.Room, -100 - i)
    openInterior(r)
  })
  const roomByRegion = new Map<number, Room>()
  rooms.forEach((r, i) => roomByRegion.set(-100 - i, r))

  // Region membership lists
  const regionCells = new Map<number, number[]>()
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === CellType.Solid) continue
    const id = region[i]
    if (!regionCells.has(id)) regionCells.set(id, [])
    regionCells.get(id)!.push(i)
  }

  // Maze carving (DFS with straight-corridor bias)
  const visited = new Set<number>()
  const lastDir = new Int8Array(GRID * GRID).fill(-1)
  const stack: number[] = []
  const visitRegion = (cell: number) => {
    const id = region[cell]
    visited.add(id)
    const t = cells[cell]
    if (t === CellType.Room) return
    const members = regionCells.get(id)!
    if (members.length > 1) for (const m of shuffle(rng, [...members])) if (m !== cell) stack.push(m)
    stack.push(cell)
  }
  visitRegion(cellIdx(LOBBY.cx0, LOBBY.cz0))
  while (stack.length) {
    const cur = stack[stack.length - 1]
    const cx = cur % GRID
    const cz = Math.floor(cur / GRID)
    const options: number[] = []
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d].dx
      const nz = cz + DIRS[d].dz
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue
      const n = cellIdx(nx, nz)
      if (cells[n] === CellType.Solid || visited.has(region[n])) continue
      options.push(d)
    }
    if (!options.length) {
      stack.pop()
      continue
    }
    const ld = lastDir[cur]
    const d = ld >= 0 && options.includes(ld) && rng() < 0.7 ? ld : pick(rng, options)
    const n = cellIdx(cx + DIRS[d].dx, cz + DIRS[d].dz)
    const intoRoom = cells[n] === CellType.Room
    edges.set(cx, cz, DIRS[d].side, intoRoom ? DOOR : OPEN)
    if (intoRoom) {
      const room = roomByRegion.get(region[n])!
      const opposite: Record<Side, Side> = { n: 's', s: 'n', w: 'e', e: 'w' }
      room.door = { side: opposite[DIRS[d].side], cx: n % GRID, cz: Math.floor(n / GRID) }
    }
    lastDir[n] = d
    visitRegion(n)
  }

  // Loops, offset partitions
  const isRoomOrSolid = (i: number) => cells[i] === CellType.Room || cells[i] === CellType.Solid
  for (let cz = 0; cz < GRID; cz++)
    for (let cx = 0; cx < GRID; cx++) {
      const a = cellIdx(cx, cz)
      for (const side of ['e', 's'] as Side[]) {
        const nx = side === 'e' ? cx + 1 : cx
        const nz = side === 's' ? cz + 1 : cz
        if (nx >= GRID || nz >= GRID) continue
        const b = cellIdx(nx, nz)
        if (isRoomOrSolid(a) || isRoomOrSolid(b)) continue
        const e = edges.get(cx, cz, side)
        if (e === WALL && rng() < 0.55) edges.set(cx, cz, side, OPEN)
        else if (
          e === OPEN &&
          cells[a] === CellType.Normal &&
          cells[b] === CellType.Normal &&
          region[a] !== region[b] &&
          rng() < 0.04
        ) {
          edges.set(cx, cz, side, PARTIAL)
          edges.partialEnd.set(`${side}${cx},${cz}`, rng() < 0.5 ? 0 : 1)
        }
      }
    }

  // Stairwell door on the west outer wall, reached by a straight lobby corridor
  edges.set(STAIR.doorCell.cx, STAIR.doorCell.cz, 'w', DOOR)
  for (let cx = STAIR_CORRIDOR.cx0; cx < STAIR_CORRIDOR.cx0 + STAIR_CORRIDOR.w; cx++)
    edges.set(cx, STAIR_CORRIDOR.cz0, 'e', OPEN)
  for (const cz of opts.eastDoors ?? []) edges.set(GRID - 1, cz, 'e', DOOR)
  for (const cz of opts.westDoors ?? []) edges.set(0, cz, 'w', DOOR)
  for (const cx of opts.northDoors ?? []) edges.set(cx, 0, 'n', DOOR)

  const out: FloorData = {
    index,
    cells,
    zones,
    walls: [],
    baseboards: [],
    pillars: [],
    hangingTiles: [],
    lights: [],
    props: [],
    details: [],
    colliders: [],
    lobbyZone: zoneAt(LOBBY.cx0, LOBBY.cz0),
  }

  buildWalls(edges, zoneAt, out, rng)
  buildPillars(cells, region, edges, zoneAt, out, rng)
  buildLights(cells, region, dimGrid, coarse, out, rng)
  buildDetails(cells, zoneAt, out, rng)
  furnishRooms(rooms, out, rng)
  furnishLobby(out)
  scatterCorridors(cells, edges, out, rng)
  addElevatorColliders(out)
  return out
}

function buildWalls(edges: Edges, zoneAt: (cx: number, cz: number) => Zone, out: FloorData, rng: Rng) {
  const longSegments: { a: number; b: number; line: number; horizontal: boolean }[] = []

  const emit = (a: number, b: number, line: number, horizontal: boolean, zone: Zone, partial = false) => {
    const len = b - a
    if (len <= 0.01) return
    const c = (a + b) / 2
    const spec: BoxSpec = horizontal
      ? { p: [c, CEIL_H / 2, line], s: [len + WALL_T, CEIL_H, WALL_T] }
      : { p: [line, CEIL_H / 2, c], s: [WALL_T, CEIL_H, len + WALL_T] }
    out.walls.push({ spec, zone })
    const bb: BoxSpec = horizontal
      ? { p: [c, 0.06, line], s: [len + WALL_T + 0.04, 0.12, WALL_T + 0.04] }
      : { p: [line, 0.06, c], s: [WALL_T + 0.04, 0.12, len + WALL_T + 0.04] }
    out.baseboards.push({ spec: bb, zone })
    const h = WALL_T / 2
    out.colliders.push(horizontal ? aabb(a - h, b + h, line - h, line + h) : aabb(line - h, line + h, a - h, b + h))
    if (!partial && len >= 9) longSegments.push({ a, b, line, horizontal })
    // Wall outlets
    if (len > 2 && rng() < 0.35) {
      const t = a + 0.5 + rng() * (len - 1)
      const side = rng() < 0.5 ? -1 : 1
      const off = line + side * (WALL_T / 2 + 0.008)
      out.details.push(
        horizontal
          ? { m: 'white', p: [t, 0.35, off], s: [0.08, 0.12, 0.016] }
          : { m: 'white', p: [off, 0.35, t], s: [0.016, 0.12, 0.08] },
      )
    }
  }

  const lintel = (mid: number, line: number, horizontal: boolean, zone: Zone) => {
    const h = CEIL_H - DOOR_H
    out.walls.push({
      spec: horizontal
        ? { p: [mid, DOOR_H + h / 2, line], s: [DOOR_GAP, h, WALL_T] }
        : { p: [line, DOOR_H + h / 2, mid], s: [WALL_T, h, DOOR_GAP] },
      zone,
    })
  }

  const scan = (horizontal: boolean) => {
    const lines = GRID + 1
    for (let li = 0; li < lines; li++) {
      let run: { a: number; b: number; zone: Zone } | null = null
      const flush = () => {
        if (run) emit(run.a, run.b, li * CELL, horizontal, run.zone)
        run = null
      }
      for (let k = 0; k < GRID; k++) {
        const e = horizontal ? edges.h[hIdx(k, li)] : edges.v[vIdx(li, k)]
        const zone = horizontal ? zoneAt(k, Math.min(li, GRID - 1)) : zoneAt(Math.min(li, GRID - 1), k)
        const a = k * CELL
        const b = a + CELL
        const mid = a + CELL / 2
        if (e === WALL) {
          if (run && run.b === a && run.zone === zone) run.b = b
          else {
            flush()
            run = { a, b, zone }
          }
        } else if (e === DOOR) {
          if (run && run.b === a && run.zone === zone) run.b = mid - DOOR_GAP / 2
          else {
            flush()
            run = { a, b: mid - DOOR_GAP / 2, zone }
          }
          flush()
          run = { a: mid + DOOR_GAP / 2, b, zone }
          lintel(mid, li * CELL, horizontal, zone)
        } else if (e === PARTIAL) {
          flush()
          const key = horizontal ? `s${k},${li - 1}` : `e${li - 1},${k}`
          const end = edges.partialEnd.get(key) ?? 0
          const len = 1.2
          if (end === 0) emit(a, a + len, li * CELL, horizontal, zone, true)
          else emit(b - len, b, li * CELL, horizontal, zone, true)
        } else flush()
      }
      flush()
    }
  }
  scan(true)
  scan(false)

  // Red stripe along a few long walls
  for (const seg of shuffle(rng, longSegments).slice(0, 3)) {
    const len = seg.b - seg.a
    const c = (seg.a + seg.b) / 2
    out.details.push(
      seg.horizontal
        ? { m: 'red', p: [c, 0.32, seg.line], s: [len, 0.05, WALL_T + 0.012] }
        : { m: 'red', p: [seg.line, 0.32, c], s: [WALL_T + 0.012, 0.05, len] },
    )
  }
}

function buildPillars(
  cells: Uint8Array,
  region: Int32Array,
  edges: Edges,
  zoneAt: (cx: number, cz: number) => Zone,
  out: FloorData,
  rng: Rng,
) {
  const S = 0.9
  const add = (vx: number, vz: number) => {
    const x = vx * CELL
    const z = vz * CELL
    out.pillars.push({ x, z, zone: zoneAt(vx, vz) })
    out.colliders.push(fromCenter(x, z, S, S))
  }
  for (let vz = 1; vz < GRID; vz++)
    for (let vx = 1; vx < GRID; vx++) {
      const around = [cellIdx(vx - 1, vz - 1), cellIdx(vx, vz - 1), cellIdx(vx - 1, vz), cellIdx(vx, vz)]
      const types = around.map((i) => cells[i])
      const allOpen =
        edges.h[hIdx(vx - 1, vz)] === OPEN &&
        edges.h[hIdx(vx, vz)] === OPEN &&
        edges.v[vIdx(vx, vz - 1)] === OPEN &&
        edges.v[vIdx(vx, vz)] === OPEN
      if (!allOpen) continue
      if (types.every((t) => t === CellType.Hall) && around.every((i) => region[i] === region[around[0]])) {
        if ((vx + vz) % 2 === 0) add(vx, vz)
      } else if (types.every((t) => t === CellType.Lobby)) {
        if (vz === LOBBY.cz0 + 1 && (vx === LOBBY.cx0 + 1 || vx === LOBBY.cx1)) add(vx, vz)
      } else if (types.every((t) => t === CellType.Normal) && rng() < 0.45) add(vx, vz)
    }
}

function buildLights(
  cells: Uint8Array,
  region: Int32Array,
  dimGrid: number[],
  coarse: (cx: number, cz: number) => number,
  out: FloorData,
  rng: Rng,
) {
  const regionRot = new Map<number, boolean>()
  for (let cz = 0; cz < GRID; cz++)
    for (let cx = 0; cx < GRID; cx++) {
      const i = cellIdx(cx, cz)
      const t = cells[i]
      if (t === CellType.Solid) continue
      const chance = t === CellType.Normal ? 0.9 : 1
      if (rng() > chance) continue
      if (!regionRot.has(region[i])) regionRot.set(region[i], rng() < 0.5)
      const r = rng()
      out.lights.push({
        x: cx * CELL + CELL / 2,
        z: cz * CELL + CELL / 2,
        rotated: t === CellType.Normal ? rng() < 0.5 : regionRot.get(region[i])!,
        dim: t === CellType.Lobby ? 1 : dimGrid[coarse(cx, cz)],
        state: t === CellType.Lobby ? 0 : r < 0.06 ? 1 : r < 0.1 ? 2 : 0,
        phase: rng() * 100,
      })
    }
}

function buildDetails(cells: Uint8Array, zoneAt: (cx: number, cz: number) => Zone, out: FloorData, rng: Rng) {
  const lit = new Set(out.lights.map((l) => `${Math.floor(l.x / CELL)},${Math.floor(l.z / CELL)}`))
  let hanging = 0
  for (let cz = 0; cz < GRID; cz++)
    for (let cx = 0; cx < GRID; cx++) {
      const t = cells[cellIdx(cx, cz)]
      if (t === CellType.Solid || t === CellType.Lobby) continue
      const x = cx * CELL + CELL / 2
      const z = cz * CELL + CELL / 2
      const hasLight = lit.has(`${cx},${cz}`)
      const r = rng()
      if (!hasLight && r < 0.12 && hanging < 2 && t === CellType.Normal) {
        hanging++
        const hx = x - 0.3
        const a = 0.95
        out.details.push({ m: 'black', p: [x, CEIL_H - 0.004, z], s: [0.6, 0.008, 0.6] })
        out.hangingTiles.push({
          spec: { p: [hx + 0.3 * Math.cos(a), CEIL_H - 0.3 * Math.sin(a) - 0.01, z], s: [0.6, 0.015, 0.6], r: [0, 0, -a] },
          zone: zoneAt(cx, cz),
        })
      } else if (r < 0.1) {
        const vx = x + (rng() < 0.5 ? -0.9 : 0.9)
        out.details.push({ m: 'vent', p: [vx, CEIL_H - 0.01, z], s: [0.6, 0.02, 0.6] })
        for (let k = -2; k <= 2; k++)
          out.details.push({ m: 'darkMetal', p: [vx, CEIL_H - 0.022, z + k * 0.1], s: [0.5, 0.006, 0.03] })
      }
      if (rng() < 0.035 && t !== CellType.Room) {
        const along = rng() < 0.5
        out.details.push({
          m: 'tape',
          p: [x + (rng() - 0.5), 0.003, z + (rng() - 0.5)],
          s: along ? [1.6, 0.004, 0.06] : [0.06, 0.004, 1.6],
        })
      }
    }
}

class Placer {
  taken: AABB[] = []
  constructor(
    private out: FloorData,
    public x0: number,
    public z0: number,
    public x1: number,
    public z1: number,
    private keepOut: { x: number; z: number; r: number }[] = [],
  ) {}

  try(prop: Prop, x: number, z: number, q: number, collide = true): boolean {
    const [fw, fd] = footprint(prop, q)
    const box = fromCenter(x, z, fw, fd, 0, prop.h)
    if (box.minX < this.x0 - 0.001 || box.maxX > this.x1 + 0.001 || box.minZ < this.z0 - 0.001 || box.maxZ > this.z1 + 0.001)
      return false
    for (const t of this.taken)
      if (box.minX < t.maxX + 0.05 && box.maxX > t.minX - 0.05 && box.minZ < t.maxZ + 0.05 && box.maxZ > t.minZ - 0.05)
        return false
    for (const k of this.keepOut) {
      const cx = Math.max(box.minX, Math.min(k.x, box.maxX))
      const cz = Math.max(box.minZ, Math.min(k.z, box.maxZ))
      if ((cx - k.x) ** 2 + (cz - k.z) ** 2 < k.r * k.r) return false
    }
    this.taken.push(box)
    this.out.props.push(...placeProp(prop, x, z, q))
    if (collide) this.out.colliders.push(box)
    return true
  }

  force(prop: Prop, x: number, z: number, q: number) {
    const [fw, fd] = footprint(prop, q)
    const box = fromCenter(x, z, fw, fd, 0, prop.h)
    this.taken.push(box)
    this.out.props.push(...placeProp(prop, x, z, q))
    this.out.colliders.push(box)
  }

  /** Place against a wall, front facing into the room. t in [0,1] along the wall. */
  wall(prop: Prop, side: Side, t: number): boolean {
    const q = side === 'n' ? 0 : side === 's' ? 2 : side === 'w' ? 1 : 3
    const [fw, fd] = footprint(prop, q)
    if (side === 'n' || side === 's') {
      const x = this.x0 + fw / 2 + t * (this.x1 - this.x0 - fw)
      const z = side === 'n' ? this.z0 + fd / 2 : this.z1 - fd / 2
      return this.try(prop, x, z, q)
    }
    const z = this.z0 + fd / 2 + t * (this.z1 - this.z0 - fd)
    const x = side === 'w' ? this.x0 + fw / 2 : this.x1 - fw / 2
    return this.try(prop, x, z, q)
  }

  fillWall(make: () => Prop, side: Side, gap: number, skip = 0, rng?: Rng) {
    const sample = make()
    const len = side === 'n' || side === 's' ? this.x1 - this.x0 : this.z1 - this.z0
    const n = Math.floor((len + gap) / (sample.w + gap))
    for (let i = 0; i < n; i++) {
      if (rng && rng() < skip) continue
      this.wall(i === 0 ? sample : make(), side, n === 1 ? 0.5 : i / (n - 1))
    }
  }
}

function roomBounds(r: Rect) {
  const inset = WALL_T / 2 + 0.06
  return {
    x0: r.cx0 * CELL + inset,
    z0: r.cz0 * CELL + inset,
    x1: (r.cx0 + r.w) * CELL - inset,
    z1: (r.cz0 + r.h) * CELL - inset,
  }
}

function furnishRooms(rooms: Room[], out: FloorData, rng: Rng) {
  for (const room of rooms) {
    if (!room.door) continue
    const bnd = roomBounds(room)
    const { side, cx, cz } = room.door
    const dx = side === 'w' ? cx * CELL : side === 'e' ? (cx + 1) * CELL : cx * CELL + CELL / 2
    const dz = side === 'n' ? cz * CELL : side === 's' ? (cz + 1) * CELL : cz * CELL + CELL / 2
    const inX = side === 'w' ? 1 : side === 'e' ? -1 : 0
    const inZ = side === 'n' ? 1 : side === 's' ? -1 : 0
    const p = new Placer(out, bnd.x0, bnd.z0, bnd.x1, bnd.z1, [{ x: dx + inX * 0.6, z: dz + inZ * 0.6, r: 1.5 }])

    // Plain door leaf swung open against the wall
    const leaf = doorLeaf()
    const hinge = DOOR_GAP / 2 - 0.05
    if (side === 'n' || side === 's') p.force(leaf, dx + hinge + 0.03, dz + inZ * 0.55, 1)
    else p.force(leaf, dx + inX * 0.55, dz + hinge + 0.03, 0)

    const walls = (['n', 's', 'w', 'e'] as Side[]).filter((s) => s !== side)
    const opposite: Record<Side, Side> = { n: 's', s: 'n', w: 'e', e: 'w' }
    const far = opposite[side]

    if (room.type === 'office') {
      for (const w of walls) p.fillWall(workstation, w, 0.3, 0.25, rng)
      p.wall(filingCabinet(), pick(rng, walls), rng())
      p.wall(filingCabinet(), pick(rng, walls), rng())
      p.wall(trashBin(), pick(rng, walls), rng())
      const cxm = (bnd.x0 + bnd.x1) / 2
      const czm = (bnd.z0 + bnd.z1) / 2
      if (bnd.x1 - bnd.x0 > 5 && bnd.z1 - bnd.z0 > 5) {
        p.try(cubicleWall(1.6), cxm, czm, 0)
        p.try(chair(), cxm + 1.2, czm + 0.8, int(rng, 0, 3))
      }
    } else if (room.type === 'storage') {
      p.fillWall(() => shelf(rng), far, 0.15)
      p.fillWall(() => lockers(int(rng, 3, 5)), pick(rng, walls.filter((w) => w !== far)), 0.4)
      for (let i = 0; i < 4; i++)
        p.try(boxStack(rng), bnd.x0 + 1 + rng() * (bnd.x1 - bnd.x0 - 2), bnd.z0 + 1 + rng() * (bnd.z1 - bnd.z0 - 2), int(rng, 0, 3))
    } else if (room.type === 'restroom') {
      const len = far === 'n' || far === 's' ? bnd.x1 - bnd.x0 : bnd.z1 - bnd.z0
      const n = Math.min(4, Math.floor((len - 0.4) / 0.95))
      p.wall(toiletStalls(n), far, 0.5)
      const sinkSide = walls.find((w) => w !== far)!
      p.wall(sinkCounter(2.4), sinkSide, 0.5)
      p.wall(trashBin(), sinkSide, 0.05)
    } else if (room.type === 'server') {
      const horizontalRows = far === 'n' || far === 's'
      p.fillWall(() => serverRack(rng), far, 0.02)
      if (horizontalRows) {
        const zMid = (bnd.z0 + bnd.z1) / 2
        for (let x = bnd.x0 + 0.6; x < bnd.x1 - 0.6; x += 0.62) p.try(serverRack(rng), x, zMid, far === 'n' ? 2 : 0)
      } else {
        const xMid = (bnd.x0 + bnd.x1) / 2
        for (let z = bnd.z0 + 0.6; z < bnd.z1 - 0.6; z += 0.62) p.try(serverRack(rng), xMid, z, far === 'w' ? 3 : 1)
      }
    }
  }
}

function furnishLobby(out: FloorData) {
  const x0 = LOBBY.cx0 * CELL + 0.2
  const z0 = LOBBY.cz0 * CELL + 0.2
  const x1 = (LOBBY.cx1 + 1) * CELL - 0.2
  const z1 = (LOBBY.cz1 + 1) * CELL - 0.2
  const p = new Placer(out, x0, z0, x1, z1, [
    { x: ELEV.x, z: ELEV.frontZ0 - 1, r: 2.2 },
    { x: (x0 + x1) / 2, z: z0 + 4, r: 1.2 },
  ])
  p.try(reception(), x0 + 2.2, z0 + 2.2, 0)
  p.try(chair(), x0 + 2.0, z0 + 1.3, 0)
  p.try(waterCooler(), x1 - 0.25, z1 - 1.2, 3)
  p.try(trashBin(), x1 - 0.25, z1 - 1.8, 3)
  p.try(chair(), x1 - 0.4, z0 + 1.5, 3)
  p.try(chair(), x1 - 0.4, z0 + 2.2, 3)
}

function scatterCorridors(cells: Uint8Array, edges: Edges, out: FloorData, rng: Rng) {
  const makers: (() => Prop)[] = [() => boxStack(rng), filingCabinet, trashBin, chair, () => boxStack(rng), waterCooler]
  for (let cz = 0; cz < GRID; cz++)
    for (let cx = 0; cx < GRID; cx++) {
      if (cells[cellIdx(cx, cz)] !== CellType.Normal) continue
      if (cx <= 1 && cz >= 1 && cz <= 3) continue
      if (rng() > 0.07) continue
      const sides = (['n', 's', 'w', 'e'] as Side[]).filter((s) => edges.get(cx, cz, s) === WALL)
      if (!sides.length) continue
      const bnd = roomBounds({ cx0: cx, cz0: cz, w: 1, h: 1 })
      const p = new Placer(out, bnd.x0, bnd.z0, bnd.x1, bnd.z1, [])
      p.wall(pick(rng, makers)(), pick(rng, sides), 0.15 + rng() * 0.7)
    }
}

export function addElevatorColliders(out: Pick<FloorData, 'colliders'>) {
  const s0x = SHAFT.cx0 * CELL
  const s1x = (SHAFT.cx1 + 1) * CELL
  const s1z = (SHAFT.cz1 + 1) * CELL
  out.colliders.push(
    aabb(s0x, ELEV.cabX0, ELEV.frontZ0, s1z),
    aabb(ELEV.cabX1, s1x, ELEV.frontZ0, s1z),
    aabb(s0x, s1x, ELEV.cabZ1, s1z),
    aabb(s0x, ELEV.x - ELEV.openHalf, ELEV.frontZ0, ELEV.frontZ1),
    aabb(ELEV.x + ELEV.openHalf, s1x, ELEV.frontZ0, ELEV.frontZ1),
  )
}

export function generateBuilding(seed: number, floors: number): FloorData[] {
  return Array.from({ length: floors }, (_, i) => generateFloor(seed, i))
}

import { fromCenter, type AABB } from './collision'
import { CEIL_H, CELL, GRID, SIZE } from './constants'
import { createHideSpot, type HideSpot, type HideSpotType } from './hide-spot'
import { EYE_CROUCH } from './player-store'
import { cubicleWall, desk, placeProp, type MatBox, type Prop } from './props'
import { shuffle, type Rng } from './rng'
import type { FloorData } from './world-generator'

export interface MeterRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface HideSpotRules {
  minPerFloor: number
  minSpacing: number
  /** Floor is split into sectors x sectors; each sector gets a spot first for an even spread. */
  sectors: number
  weights: Partial<Record<HideSpotType, number>>
  /** Areas that must stay clear (spawn, elevator, stair corridor). */
  keepOut: MeterRect[]
  /** Cell types where wall-backed spots may go. */
  wallCells: number[]
  /** Cell types where free-standing partitions may go. */
  openCells: number[]
}

const b = (m: MatBox['m'], p: [number, number, number], s: [number, number, number]): MatBox => ({ m, p, s })

function hideLocker(): Prop {
  const boxes: MatBox[] = [b('locker', [0, 1.0, 0], [0.64, 2.0, 0.56]), b('darkMetal', [0.22, 1.05, 0.285], [0.03, 0.16, 0.02])]
  for (const y of [1.55, 1.62, 1.69, 1.76, 0.28, 0.35]) boxes.push(b('black', [0, y, 0.282], [0.36, 0.022, 0.01]))
  return { w: 0.64, d: 0.56, h: 2.0, boxes }
}

function supplyCloset(): Prop {
  return {
    w: 1.2,
    d: 1.0,
    h: 2.4,
    boxes: [
      b('white', [0, 1.2, 0], [1.2, 2.4, 1.0]),
      b('door', [0, 1.04, 0.505], [0.86, 2.06, 0.02]),
      b('darkMetal', [0.33, 1.0, 0.52], [0.04, 0.14, 0.03]),
      b('black', [0, 2.22, 0.505], [0.5, 0.1, 0.012]),
    ],
  }
}

function ventCrawl(): Prop {
  const boxes: MatBox[] = [
    b('vent', [0, CEIL_H - 0.012, 0], [0.9, 0.02, 0.9]),
    b('cardboard', [0, 0.35, -0.1], [0.72, 0.7, 0.62]),
    b('tape', [0, 0.705, -0.1], [0.73, 0.012, 0.08]),
    b('cardboard', [0.05, 0.95, -0.12], [0.5, 0.5, 0.46]),
  ]
  for (let k = -2; k <= 2; k++) boxes.push(b('darkMetal', [0, CEIL_H - 0.024, k * 0.15], [0.8, 0.006, 0.04]))
  return { w: 0.9, d: 0.9, h: 1.2, boxes }
}

interface PropSpec {
  make: () => Prop
  wallBacked: boolean
  frontClear: number
  backClear?: number
  pose: [number, number, number]
  facing: [number, number]
  pitch: number
  anchor: [number, number, number]
  exit: [number, number]
  entry: [number, number]
}

/** All local coordinates: +z is the prop's front, x along its width. */
const SPECS: Record<Exclude<HideSpotType, 'pillar'>, PropSpec> = {
  desk: {
    make: desk,
    wallBacked: true,
    frontClear: 1.1,
    pose: [-0.2, 0.42, 0],
    facing: [0, 1],
    pitch: -0.05,
    anchor: [-0.2, 0.55, 0.35],
    exit: [-0.2, 0.95],
    entry: [0, 1],
  },
  locker: {
    make: hideLocker,
    wallBacked: true,
    frontClear: 1.1,
    pose: [0, 1.55, 0.26],
    facing: [0, 1],
    pitch: 0,
    anchor: [0, 1.2, 0.3],
    exit: [0, 0.9],
    entry: [0, 1],
  },
  closet: {
    make: supplyCloset,
    wallBacked: true,
    frontClear: 1.2,
    pose: [0, 1.6, 0.47],
    facing: [0, 1],
    pitch: 0,
    anchor: [0, 1.2, 0.5],
    exit: [0, 1.2],
    entry: [0, 1],
  },
  vent: {
    make: ventCrawl,
    wallBacked: true,
    frontClear: 1.0,
    pose: [0, CEIL_H - 0.012, 0],
    facing: [0, 1],
    pitch: -0.75,
    anchor: [0, 1.3, 0.25],
    exit: [0, 0.95],
    entry: [0, 1],
  },
  partition: {
    make: () => cubicleWall(1.8),
    wallBacked: false,
    frontClear: 0.7,
    backClear: 1.1,
    pose: [0.4, EYE_CROUCH, -0.45],
    facing: [1, 0],
    pitch: 0,
    anchor: [0, 0.9, -0.1],
    exit: [0.4, -0.8],
    entry: [0, -1],
  },
}

/** Front direction per quarter turn, matching placeProp's rotation. */
const FRONT: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
]

function rot(q: number, lx: number, lz: number): [number, number] {
  if (q === 1) return [lz, -lx]
  if (q === 2) return [-lx, -lz]
  if (q === 3) return [-lz, lx]
  return [lx, lz]
}

function localRect(cx: number, cz: number, q: number, lx0: number, lz0: number, lx1: number, lz1: number, h = 3): AABB {
  const [ax, az] = rot(q, lx0, lz0)
  const [bx, bz] = rot(q, lx1, lz1)
  return {
    minX: cx + Math.min(ax, bx),
    maxX: cx + Math.max(ax, bx),
    minZ: cz + Math.min(az, bz),
    maxZ: cz + Math.max(az, bz),
    minY: 0,
    maxY: h,
  }
}

const yawFor = (fx: number, fz: number) => Math.atan2(-fx, -fz)

const RES = 0.1
const N = Math.ceil(SIZE / RES)
const FREE = 0
const SOLID = 1
const RESERVED = 2

class OccGrid {
  g = new Uint8Array(N * N)

  private range(a: number, b: number): [number, number] {
    return [Math.max(0, Math.floor(a / RES)), Math.min(N - 1, Math.ceil(b / RES) - 1)]
  }

  fill(r: AABB | MeterRect, val: number, onlyFree = false) {
    const [i0, i1] = 'minX' in r ? this.range(r.minX, r.maxX) : this.range(r.x0, r.x1)
    const [j0, j1] = 'minX' in r ? this.range(r.minZ, r.maxZ) : this.range(r.z0, r.z1)
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * N + i
        if (!onlyFree || this.g[k] === FREE) this.g[k] = val
      }
  }

  /** Counts cells of each kind inside r. Out-of-bounds cells count as solid. */
  scan(r: AABB) {
    let solid = 0
    let reserved = 0
    let total = 0
    const j0 = Math.floor(r.minZ / RES)
    const j1 = Math.ceil(r.maxZ / RES) - 1
    const i0 = Math.floor(r.minX / RES)
    const i1 = Math.ceil(r.maxX / RES) - 1
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        total++
        if (i < 0 || j < 0 || i >= N || j >= N) {
          solid++
          continue
        }
        const v = this.g[j * N + i]
        if (v === SOLID) solid++
        else if (v === RESERVED) reserved++
      }
    return { solid, reserved, total }
  }
}

const overlapsAny = (box: AABB, colliders: AABB[], eps = 0.005) =>
  colliders.some(
    (c) =>
      c.maxY > 0.2 &&
      box.minX < c.maxX - eps &&
      box.maxX > c.minX + eps &&
      box.minZ < c.maxZ - eps &&
      box.maxZ > c.minZ + eps,
  )

const inBounds = (r: AABB) => r.minX >= 0.05 && r.minZ >= 0.05 && r.maxX <= SIZE - 0.05 && r.maxZ <= SIZE - 0.05

/** Exact distance from (x, z) backward along -f to the nearest tall collider face. */
function distanceToWall(colliders: AABB[], x: number, z: number, fx: number, fz: number): number {
  let best = Infinity
  for (const c of colliders) {
    if (c.maxY < 1.3) continue
    let d: number
    if (fz !== 0) {
      if (x <= c.minX || x >= c.maxX) continue
      d = fz > 0 ? z - c.maxZ : c.minZ - z
    } else {
      if (z <= c.minZ || z >= c.maxZ) continue
      d = fx > 0 ? x - c.maxX : c.minX - x
    }
    if (d >= 0 && d < best) best = d
  }
  return best
}

/**
 * Procedurally places hide spots on a generated floor. Deterministic for a given rng.
 * Adds the spots' geometry to floor.props and their collision to floor.colliders, so
 * they render inside the existing merged batches (no extra draw calls).
 */
export function placeHideSpots(floor: FloorData, rules: HideSpotRules, rng: Rng): HideSpot[] {
  const grid = new OccGrid()
  for (const c of floor.colliders) if (c.maxY >= 1.3) grid.fill(c, SOLID)
  for (let cz = 0; cz < GRID; cz++)
    for (let cx = 0; cx < GRID; cx++) {
      const t = floor.cells[cz * GRID + cx]
      const rect = { x0: cx * CELL, z0: cz * CELL, x1: (cx + 1) * CELL, z1: (cz + 1) * CELL }
      if (!rules.wallCells.includes(t) && !rules.openCells.includes(t)) grid.fill(rect, RESERVED, true)
    }
  for (const r of rules.keepOut) grid.fill(r, RESERVED, true)

  const cellType = (x: number, z: number) =>
    floor.cells[Math.min(GRID - 1, Math.floor(z / CELL)) * GRID + Math.min(GRID - 1, Math.floor(x / CELL))]

  const spots: HideSpot[] = []
  const farEnough = (x: number, z: number) =>
    spots.every((s) => (s.position.x - x) ** 2 + (s.position.z - z) ** 2 >= rules.minSpacing ** 2)

  const bag: HideSpotType[] = []
  for (const [type, w] of Object.entries(rules.weights) as [HideSpotType, number][])
    for (let i = 0; i < w; i++) bag.push(type)

  const finish = (type: HideSpotType, spec: PropSpec, cx: number, cz: number, q: number, prop: Prop, box: AABB) => {
    const [ax, az] = rot(q, spec.anchor[0], spec.anchor[2])
    const [px, pz] = rot(q, spec.pose[0], spec.pose[2])
    const [fx, fz] = rot(q, spec.facing[0], spec.facing[1])
    const [ex, ez] = rot(q, spec.exit[0], spec.exit[1])
    const [nx, nz] = rot(q, spec.entry[0], spec.entry[1])
    return createHideSpot({
      id: `${floor.index}-${type}-${spots.length}`,
      type,
      floor: floor.index,
      position: { x: cx + ax, y: spec.anchor[1], z: cz + az },
      entryDirection: { x: nx, z: nz },
      cameraPose: { x: cx + px, y: spec.pose[1], z: cz + pz, yaw: yawFor(fx, fz), pitch: spec.pitch },
      exitPoint: { x: cx + ex, z: cz + ez },
      bounds: { ...box, maxY: Math.max(prop.h, type === 'vent' ? CEIL_H : 0) },
    })
  }

  const tryProp = (type: Exclude<HideSpotType, 'pillar'>, x: number, z: number, q: number): HideSpot | null => {
    const spec = SPECS[type]
    const prop = spec.make()
    const [fx, fz] = FRONT[q]
    let cx = x
    let cz = z
    if (spec.wallBacked) {
      if (!rules.wallCells.includes(cellType(x, z))) return null
      const dist = distanceToWall(floor.colliders, x, z, fx, fz)
      if (dist > 2.5) return null
      const shift = dist - 0.02 - prop.d / 2
      cx = x - fx * shift
      cz = z - fz * shift
    } else if (!rules.openCells.includes(cellType(x, z))) return null

    const hw = prop.w / 2
    const hd = prop.d / 2
    const box = localRect(cx, cz, q, -hw, -hd, hw, hd, prop.h)
    if (!inBounds(box) || overlapsAny(box, floor.colliders)) return null
    if (grid.scan(localRect(cx, cz, q, -hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05)).reserved > 0) return null

    const front = localRect(cx, cz, q, -hw, hd + 0.02, hw, hd + spec.frontClear)
    if (!inBounds(front) || overlapsAny(front, floor.colliders)) return null

    if (spec.wallBacked) {
      const strip = grid.scan(localRect(cx, cz, q, -hw + 0.1, -hd - 0.14, hw - 0.1, -hd - 0.04))
      if (strip.solid < strip.total) return null
    } else {
      const clear = localRect(cx, cz, q, -hw - 0.5, -hd - (spec.backClear ?? 1), hw + 0.5, hd + spec.frontClear)
      if (!inBounds(clear) || overlapsAny(clear, floor.colliders, 0.005) || grid.scan(clear).reserved > 0) return null
    }

    const spot = finish(type, spec, cx, cz, q, prop, box)
    if (!farEnough(spot.position.x, spot.position.z)) return null

    floor.props.push(...placeProp(prop, cx, cz, q))
    floor.colliders.push(fromCenter(cx, cz, box.maxX - box.minX, box.maxZ - box.minZ, 0, prop.h))
    grid.fill(box, SOLID)
    grid.fill(front, RESERVED, true)
    return spot
  }

  const tryPillar = (sx0: number, sz0: number, size: number): HideSpot | null => {
    const inSector = floor.pillars.filter((p) => p.x >= sx0 && p.x < sx0 + size && p.z >= sz0 && p.z < sz0 + size)
    if (!inSector.length) return null
    const pillar = inSector[Math.floor(rng() * inSector.length)]
    const q = Math.floor(rng() * 4)
    const [fx, fz] = FRONT[q]
    const px = pillar.x + fx * 0.85
    const pz = pillar.z + fz * 0.85
    const area = fromCenter(px, pz, 0.6, 0.6)
    if (!inBounds(area) || overlapsAny(area, floor.colliders)) return null
    if (grid.scan(area).reserved > 0) return null
    const ax = pillar.x + fx * 0.47
    const az = pillar.z + fz * 0.47
    if (!farEnough(ax, az)) return null
    const side = rng() < 0.5 ? 1 : -1
    grid.fill(area, RESERVED, true)
    return createHideSpot({
      id: `${floor.index}-pillar-${spots.length}`,
      type: 'pillar',
      floor: floor.index,
      position: { x: ax, y: 1.0, z: az },
      entryDirection: { x: fx, z: fz },
      cameraPose: { x: px, y: EYE_CROUCH, z: pz, yaw: yawFor(fz * side, -fx * side), pitch: 0 },
      exitPoint: { x: px, z: pz },
      bounds: fromCenter(pillar.x, pillar.z, 0.94, 0.94, 0, CEIL_H),
    })
  }

  const size = SIZE / rules.sectors
  const sectors = shuffle(
    rng,
    Array.from({ length: rules.sectors * rules.sectors }, (_, i) => i),
  )
  for (let pass = 0; pass < 4; pass++) {
    if (pass > 0 && spots.length >= rules.minPerFloor) break
    for (const s of sectors) {
      if (pass > 0 && spots.length >= rules.minPerFloor) break
      const sx0 = (s % rules.sectors) * size
      const sz0 = Math.floor(s / rules.sectors) * size
      for (let attempt = 0; attempt < 28; attempt++) {
        const type = bag[Math.floor(rng() * bag.length)]
        const spot =
          type === 'pillar'
            ? tryPillar(sx0, sz0, size)
            : tryProp(type, sx0 + rng() * size, sz0 + rng() * size, Math.floor(rng() * 4))
        if (spot) {
          spots.push(spot)
          break
        }
      }
    }
  }
  return spots
}

import { G, garageGroundAt, generateGarage, type GarageLayout } from '@/levels/garage-layout'
import type { AABB } from '@/lib/backrooms/collision'
import { CEIL_H, DOOR_H, FLOOR_H } from '@/lib/backrooms/constants'
import type { HideSpot } from '@/lib/backrooms/hide-spot'
import { addElevatorColliders, type FloorData } from '@/lib/backrooms/world-generator'
import { box, customFloor } from '@/lib/levels-kit/level-helpers'

/**
 * B1. The unchanged garage generator, placed under the yellow building so its upper deck is y = 0.
 * Everything here is in world coordinates except `layout` (garage-local, rendered inside a group at ORIGIN).
 */
export const GARAGE_ORIGIN = { x: -14, y: -G.DECK, z: -32.4 } as const

/** World bounds of the garage interior (for ground height). */
export const GARAGE_BOUNDS = {
  x0: GARAGE_ORIGIN.x,
  x1: GARAGE_ORIGIN.x + G.X,
  z0: GARAGE_ORIGIN.z,
  z1: GARAGE_ORIGIN.z + G.Z,
} as const

/** B1 lobby between the stairwell bottom, the elevator and the garage's south wall. */
export const LOBBY_B1 = { x0: 0, x1: 32, z0: GARAGE_BOUNDS.z1 + 0.4, z1: 30, ceil: CEIL_H, doorX: 27, doorW: 2 } as const

/** Vehicle ramp outside the building's east wall: Floor 1 (top, south) down to the garage (bottom, north). */
export const RAMP = {
  x0: 54.2,
  x1: 60.2,
  zBottom: 10.2,
  zSlope0: 24,
  zSlope1: 45,
  zTop: 48.5,
  rise: FLOOR_H,
  /** Floor 1 doorway centre (east wall cell row 15). */
  topDoorZ: 46.5,
  /** Garage east-wall doorway centre (upper-deck aisle). */
  bottomDoorZ: GARAGE_ORIGIN.z + 45,
  headroom: 3,
} as const

export interface WorldBox {
  m: 'floor' | 'wall' | 'ceil' | 'paint' | 'hazard' | 'fixture'
  b: AABB
  /** Optional slope about the x axis (for the ramp slab), radians. */
  rx?: number
}

export interface GarageZoneData {
  layout: GarageLayout
  floor: FloorData
  hideSpots: HideSpot[]
  lights: { x: number; y: number; z: number; flicker: number; phase: number }[]
  /** Hand-built connector geometry (lobby + ramp), world space. */
  boxes: WorldBox[]
  tubes: { x: number; y: number; z: number; on: boolean }[]
}

const off = (b: AABB): AABB => ({
  minX: b.minX + GARAGE_ORIGIN.x,
  maxX: b.maxX + GARAGE_ORIGIN.x,
  minY: b.minY + GARAGE_ORIGIN.y,
  maxY: b.maxY + GARAGE_ORIGIN.y,
  minZ: b.minZ + GARAGE_ORIGIN.z,
  maxZ: b.maxZ + GARAGE_ORIGIN.z,
})

function offsetSpot(s: HideSpot): HideSpot {
  const { x, y, z } = GARAGE_ORIGIN
  return {
    ...s,
    id: `b1-${s.id}`,
    floor: 0,
    position: { x: s.position.x + x, y: s.position.y + y, z: s.position.z + z },
    cameraPose: { ...s.cameraPose, x: s.cameraPose.x + x, y: s.cameraPose.y + y, z: s.cameraPose.z + z },
    exitPoint: { x: s.exitPoint.x + x, z: s.exitPoint.z + z },
    bounds: off(s.bounds),
  }
}

export function buildGarageZone(seed: number): GarageZoneData {
  const lobbyDoorLocalX = LOBBY_B1.doorX - GARAGE_ORIGIN.x
  const data = generateGarage(seed, {
    keepClear: [{ x0: lobbyDoorLocalX - 2.5, z0: G.Z - 7, x1: lobbyDoorLocalX + 3, z1: G.Z }],
    openings: [
      { wall: 's', at: lobbyDoorLocalX, width: LOBBY_B1.doorW, height: 2.4 },
      { wall: 'e', at: RAMP.bottomDoorZ - GARAGE_ORIGIN.z, width: 2.4, height: 2.5 },
    ],
  })
  const layout = data.extra as GarageLayout
  const colliders = data.floors[0].colliders.map(off)
  const boxes: WorldBox[] = []
  const tubes: GarageZoneData['tubes'] = []
  const solid = (m: WorldBox['m'], b: AABB) => {
    boxes.push({ m, b })
    colliders.push(b)
  }
  const deco = (m: WorldBox['m'], b: AABB, rx?: number) => boxes.push({ m, b, rx })

  // B1 lobby: floor, ceiling and walls. North wall = garage south wall (with doorway).
  const L = LOBBY_B1
  deco('floor', box(L.x0 - 0.2, -0.3, L.z0 - 0.4, L.x1 + 0.2, 0, L.z1 + 0.2))
  deco('ceil', box(L.x0 - 0.2, L.ceil, L.z0 - 0.4, L.x1 + 0.2, L.ceil + 0.2, L.z1 + 0.2))
  solid('wall', box(L.x0 - 0.2, -0.3, L.z0 - 0.4, L.x0, L.ceil, 23.8))
  solid('wall', box(L.x0, -0.3, L.z1, 24, L.ceil, L.z1 + 0.2))
  solid('wall', box(30, -0.3, L.z1, L.x1, L.ceil, L.z1 + 0.2))
  solid('wall', box(L.x1, -0.3, L.z0 - 0.4, L.x1 + 0.2, L.ceil, L.z1 + 0.2))
  deco('hazard', box(L.doorX - L.doorW / 2 - 0.12, 0, L.z0 - 0.42, L.doorX + L.doorW / 2 + 0.12, 0.012, L.z0 + 0.2))
  for (const x of [5, 13, 21, 29]) tubes.push({ x, y: L.ceil - 0.1, z: (L.z0 + L.z1) / 2, on: x !== 13 })
  const floor = customFloor(colliders)
  addElevatorColliders(floor)

  // Vehicle ramp corridor
  const R = RAMP
  const slopeLen = R.zSlope1 - R.zSlope0
  const ang = Math.atan2(R.rise, slopeLen)
  const top = R.rise + R.headroom
  deco('floor', box(R.x0, -0.3, R.zBottom, R.x1, 0, R.zSlope0))
  deco('floor', box(R.x0, R.rise - 0.3, R.zSlope1, R.x1, R.rise, R.zTop))
  deco('floor', box(R.x0, R.rise / 2 - 0.3, R.zSlope0, R.x1, R.rise / 2, R.zSlope1), ang)
  deco('ceil', box(R.x0, R.headroom, R.zBottom, R.x1, R.headroom + 0.2, R.zSlope0))
  deco('ceil', box(R.x0, top, R.zSlope1, R.x1, top + 0.2, R.zTop))
  deco('ceil', box(R.x0, R.rise / 2 + R.headroom, R.zSlope0, R.x1, R.rise / 2 + R.headroom + 0.2, R.zSlope1), ang)
  for (const ex of [R.x0 + 0.35, R.x1 - 0.35]) {
    deco('paint', box(ex - 0.06, R.rise / 2 + 0.004, R.zSlope0, ex + 0.06, R.rise / 2 + 0.008, R.zSlope1), ang)
    deco('paint', box(ex - 0.06, 0.004, R.zBottom + 1, ex + 0.06, 0.008, R.zSlope0))
  }
  // West wall (building side) with the Floor 1 doorway; the garage wall covers z < GARAGE_BOUNDS.z1.
  const doorHalf = 0.65
  const wz0 = GARAGE_BOUNDS.z1
  solid('wall', box(R.x0 - 0.1, -0.3, wz0, R.x0, top, R.topDoorZ - doorHalf))
  solid('wall', box(R.x0 - 0.1, -0.3, R.topDoorZ + doorHalf, R.x0, top, R.zTop + 0.2))
  solid('wall', box(R.x0 - 0.1, -0.3, R.topDoorZ - doorHalf, R.x0, R.rise, R.topDoorZ + doorHalf))
  solid('wall', box(R.x0 - 0.1, R.rise + DOOR_H, R.topDoorZ - doorHalf, R.x0, top, R.topDoorZ + doorHalf))
  // Gap between the garage wall (x = 54.4) and ramp floor edge at the bottom
  deco('floor', box(GARAGE_BOUNDS.x1, -0.3, R.zBottom, R.x0, 0, wz0))
  solid('wall', box(R.x1, -0.3, R.zBottom - 0.2, R.x1 + 0.2, top, R.zTop + 0.2))
  solid('wall', box(GARAGE_BOUNDS.x1, -0.3, R.zBottom - 0.2, R.x1, R.headroom, R.zBottom))
  solid('wall', box(R.x0 - 0.1, R.rise - 0.3, R.zTop, R.x1, top, R.zTop + 0.2))
  deco('hazard', box(R.x0, R.rise + 0.002, R.zSlope1, R.x1, R.rise + 0.012, R.zSlope1 + 0.3))
  deco('hazard', box(R.x0, 0.002, R.zSlope0 - 0.3, R.x1, 0.012, R.zSlope0))
  const cx = (R.x0 + R.x1) / 2
  for (const z of [13, 19]) tubes.push({ x: cx, y: R.headroom - 0.1, z, on: z === 13 })
  for (const z of [28, 34, 40]) tubes.push({ x: cx, y: ((z - R.zSlope0) / slopeLen) * R.rise + R.headroom - 0.1, z, on: z !== 34 })
  tubes.push({ x: cx, y: top - 0.1, z: R.topDoorZ, on: true })

  const lights = [
    ...layout.lights
      .filter((l) => l.on)
      .map((l) => ({
        x: l.x + GARAGE_ORIGIN.x,
        y: l.y - 0.15 + GARAGE_ORIGIN.y,
        z: l.z + GARAGE_ORIGIN.z,
        flicker: l.flicker,
        phase: l.phase,
      })),
    ...tubes.filter((t) => t.on).map((t, i) => ({ x: t.x, y: t.y - 0.15, z: t.z, flicker: i % 3 === 1 ? 0.2 : 0, phase: i })),
  ]

  return { layout, floor, hideSpots: data.hideSpots.map(offsetSpot), lights, boxes, tubes }
}

export const inGarage = (x: number, z: number) =>
  x > GARAGE_BOUNDS.x0 && x < GARAGE_BOUNDS.x1 && z > GARAGE_BOUNDS.z0 && z < GARAGE_BOUNDS.z1

export const inRamp = (x: number, z: number) => x > RAMP.x0 - 0.15 && x < RAMP.x1 && z > RAMP.zBottom && z < RAMP.zTop

export function rampGround(x: number, z: number): number | null {
  if (!inRamp(x, z)) return null
  if (z >= RAMP.zSlope1) return RAMP.rise
  if (z <= RAMP.zSlope0) return 0
  return ((z - RAMP.zSlope0) / (RAMP.zSlope1 - RAMP.zSlope0)) * RAMP.rise
}

/** World ground height inside the garage (lower deck, car ramps, upper deck). */
export const garageGround = (x: number) => garageGroundAt(null, x - GARAGE_ORIGIN.x) + GARAGE_ORIGIN.y

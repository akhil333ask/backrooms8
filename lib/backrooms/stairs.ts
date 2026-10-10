import { CEIL_H, DOOR_H, FLOOR_H, FLOORS, STAIR } from './constants'
import { aabb, type AABB } from './collision'
import type { BoxSpec } from './geometry'

const { x0, x1, mid, z0, landingEnd, flightEnd, z1, flightRise } = STAIR
const FLIGHT_LEN = flightEnd - landingEnd
const STEPS = 10
const RUN = FLIGHT_LEN / STEPS
const RISE = flightRise / STEPS
export const STAIR_TOP = (FLOORS - 1) * FLOOR_H + CEIL_H + 0.2

export function inStairwell(x: number, z: number) {
  return x < x1 + 0.05 && x > x0 && z > z0 && z < z1
}

/**
 * Ramp-style walkable height at (x, z). Picks the highest surface that is
 * not more than a step above the current feet, so flights stacked above
 * each other resolve correctly.
 */
export function stairGround(x: number, z: number, feet: number): number | null {
  if (!inStairwell(x, z)) return null
  const candidates: number[] = []
  for (let k = 0; k < FLOORS; k++) {
    const base = k * FLOOR_H
    if (z <= landingEnd) {
      candidates.push(base)
      continue
    }
    if (k === FLOORS - 1) continue
    if (z >= flightEnd) candidates.push(base + flightRise)
    else if (x > mid) candidates.push(base + (flightRise * (z - landingEnd)) / FLIGHT_LEN)
    else candidates.push(base + flightRise + (flightRise * (flightEnd - z)) / FLIGHT_LEN)
  }
  let best: number | null = null
  for (const c of candidates) if (c <= feet + 0.55 && (best === null || c > best)) best = c
  if (best === null) best = Math.min(...candidates)
  return best
}

export interface StairData {
  concrete: BoxSpec[]
  walls: BoxSpec[]
  rails: BoxSpec[]
  colliders: AABB[]
  lights: { x: number; y: number; z: number }[]
  doors: { floor: number; y: number }[]
}

export function buildStairwell(): StairData {
  const concrete: BoxSpec[] = []
  const walls: BoxSpec[] = []
  const rails: BoxSpec[] = []
  const colliders: AABB[] = []
  const lights: StairData['lights'] = []
  const doors: StairData['doors'] = []
  const W = 0.2

  // Ground slab
  concrete.push({ p: [(x0 + x1) / 2, -0.1, (z0 + z1) / 2], s: [x1 - x0, 0.2, z1 - z0] })

  for (let k = 0; k < FLOORS; k++) {
    const base = k * FLOOR_H
    if (k > 0) concrete.push({ p: [(x0 + x1) / 2, base - 0.1, (z0 + landingEnd) / 2], s: [x1 - x0, 0.2, landingEnd - z0] })
    doors.push({ floor: k, y: base })
    lights.push({ x: (x0 + x1) / 2, y: base + CEIL_H - 0.05, z: z0 + 1 })
    if (k === FLOORS - 1) break

    // Mid landing
    concrete.push({ p: [(x0 + x1) / 2, base + flightRise - 0.1, (flightEnd + z1) / 2], s: [x1 - x0, 0.2, z1 - flightEnd] })
    lights.push({ x: (x0 + x1) / 2, y: base + flightRise + CEIL_H - 0.4, z: z1 - 1 })

    for (let i = 0; i < STEPS; i++) {
      // Flight A (east half, rising toward +z)
      const topA = base + RISE * (i + 1)
      const hA = k === 0 ? topA : 0.45
      concrete.push({ p: [(mid + x1) / 2, topA - hA / 2, landingEnd + RUN * (i + 0.5)], s: [x1 - mid - 0.1, hA, RUN] })
      // Flight B (west half, rising toward -z)
      const topB = base + flightRise + RISE * (i + 1)
      concrete.push({ p: [(x0 + mid) / 2, topB - 0.225, flightEnd - RUN * (i + 0.5)], s: [mid - x0 - 0.1, 0.45, RUN] })
    }

    // Sloped handrails
    const slope = Math.atan2(flightRise, FLIGHT_LEN)
    const len = Math.hypot(flightRise, FLIGHT_LEN)
    const cy = base + flightRise / 2 + 0.9
    const cz = (landingEnd + flightEnd) / 2
    rails.push({ p: [x1 - 0.32, cy, cz], s: [0.05, 0.05, len], r: [-slope, 0, 0] })
    rails.push({ p: [mid + 0.18, cy, cz], s: [0.05, 0.05, len], r: [-slope, 0, 0] })
    rails.push({ p: [x0 + 0.12, cy + flightRise, cz], s: [0.05, 0.05, len], r: [slope, 0, 0] })
    rails.push({ p: [mid - 0.18, cy + flightRise, cz], s: [0.05, 0.05, len], r: [slope, 0, 0] })
    for (let s = 0; s <= 4; s++) {
      const z = landingEnd + 0.3 + s * ((FLIGHT_LEN - 0.6) / 4)
      const yA = base + (flightRise * (z - landingEnd)) / FLIGHT_LEN
      rails.push({ p: [x1 - 0.32, yA + 0.45, z], s: [0.03, 0.9, 0.03] })
      const yB = base + flightRise + (flightRise * (flightEnd - z)) / FLIGHT_LEN
      rails.push({ p: [x0 + 0.12, yB + 0.45, z], s: [0.03, 0.9, 0.03] })
    }
  }

  // Block under the lowest west flight
  concrete.push({ p: [(x0 + mid) / 2 - 0.05, 0.75, (landingEnd + flightEnd) / 2], s: [mid - x0 - 0.1, 1.5, FLIGHT_LEN] })
  colliders.push(aabb(x0, mid, landingEnd, flightEnd, 0, flightRise - 0.1))

  // Top-floor guard rail over the drop to the flight below
  const top = (FLOORS - 1) * FLOOR_H
  rails.push({ p: [(mid + x1) / 2, top + 1.0, landingEnd + 0.05], s: [x1 - mid, 0.05, 0.05] })
  for (let i = 0; i <= 4; i++) rails.push({ p: [mid + 0.15 + i * 0.67, top + 0.5, landingEnd + 0.05], s: [0.03, 1, 0.03] })
  colliders.push(aabb(mid + 0.1, x1, landingEnd, z1, top + 0.1, STAIR_TOP))

  // Central divider wall between flights
  walls.push({ p: [mid, STAIR_TOP / 2 - 0.1, (landingEnd + flightEnd) / 2], s: [0.2, STAIR_TOP + 0.2, FLIGHT_LEN] })
  colliders.push(aabb(mid - 0.1, mid + 0.1, landingEnd, flightEnd, -1, STAIR_TOP))

  // Outer walls
  const H = STAIR_TOP + 0.2
  walls.push({ p: [x0 - W / 2, H / 2 - 0.2, (z0 + z1) / 2], s: [W, H, z1 - z0 + 2 * W] })
  walls.push({ p: [(x0 + x1) / 2, H / 2 - 0.2, z0 - W / 2], s: [x1 - x0, H, W] })
  walls.push({ p: [(x0 + x1) / 2, H / 2 - 0.2, z1 + W / 2], s: [x1 - x0, H, W] })
  colliders.push(aabb(x0 - W, x0, z0 - W, z1 + W, -1, H), aabb(x0, x1, z0 - W, z0, -1, H), aabb(x0, x1, z1, z1 + W, -1, H))

  // East wall shared with the building, with a doorway on every floor
  const ex = x1 - 0.15
  walls.push({ p: [ex, H / 2 - 0.2, (z0 + STAIR.doorZ0) / 2], s: [0.1, H, STAIR.doorZ0 - z0] })
  walls.push({ p: [ex, H / 2 - 0.2, (STAIR.doorZ1 + z1) / 2], s: [0.1, H, z1 - STAIR.doorZ1] })
  for (let k = 0; k < FLOORS; k++) {
    const base = k * FLOOR_H
    const nextBase = k < FLOORS - 1 ? (k + 1) * FLOOR_H : H - 0.2
    walls.push({
      p: [ex, (base + DOOR_H + nextBase) / 2, (STAIR.doorZ0 + STAIR.doorZ1) / 2],
      s: [0.1, nextBase - base - DOOR_H, STAIR.doorZ1 - STAIR.doorZ0],
    })
  }
  if (FLOORS > 0) walls.push({ p: [ex, -0.1, (STAIR.doorZ0 + STAIR.doorZ1) / 2], s: [0.1, 0.2, 1] })
  colliders.push(aabb(x1 - 0.2, x1 + 0.1, z0 - W, STAIR.doorZ0, -1, H), aabb(x1 - 0.2, x1 + 0.1, STAIR.doorZ1, z1 + W, -1, H))

  // Ceiling
  concrete.push({ p: [(x0 + x1) / 2, STAIR_TOP + 0.1, (z0 + z1) / 2], s: [x1 - x0, 0.2, z1 - z0] })

  return { concrete, walls, rails, colliders, lights, doors }
}

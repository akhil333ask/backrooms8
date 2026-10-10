import { aabb, type AABB } from '@/lib/backrooms/collision'
import { GRID } from '@/lib/backrooms/constants'
import { createHideSpot, type HideSpot, type HideSpotType } from '@/lib/backrooms/hide-spot'
import type { HideSpotRules } from '@/lib/backrooms/hide-spot-placer'
import type { FloorData } from '@/lib/backrooms/world-generator'

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

export const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad

/** Box helper matching the min/max argument order used by the level builders. */
export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): AABB => aabb(x0, x1, z0, z1, y0, y1)

/** A single-floor FloorData for levels that render their own scene. */
export function customFloor(colliders: AABB[]): FloorData {
  const n = GRID * GRID
  return {
    index: 0,
    cells: new Uint8Array(n),
    zones: new Uint8Array(n),
    walls: [],
    baseboards: [],
    pillars: [],
    hangingTiles: [],
    lights: [],
    props: [],
    details: [],
    colliders,
    lobbyZone: 0,
  }
}

export interface SpotInit {
  id: string
  type: HideSpotType
  label: string
  /** Interaction anchor. */
  x: number
  y: number
  z: number
  /** Unit vector from the spot toward the open side the player enters from. */
  dir: { x: number; z: number }
  /** Where the hidden camera sits (world). Defaults to the anchor. */
  camX?: number
  camZ?: number
  camY: number
  bounds: AABB
  crouch?: boolean
  concealment?: number
  exitDist?: number
}

/** Builds a HideSpot whose hidden camera looks out of the open side. */
export function makeSpot(o: SpotInit): HideSpot {
  const exit = o.exitDist ?? 1
  return createHideSpot({
    id: o.id,
    type: o.type,
    label: o.label,
    floor: 0,
    position: { x: o.x, y: o.y, z: o.z },
    entryDirection: o.dir,
    cameraPose: { x: o.camX ?? o.x, y: o.camY, z: o.camZ ?? o.z, yaw: Math.atan2(-o.dir.x, -o.dir.z), pitch: -0.05 },
    exitPoint: { x: o.x + o.dir.x * exit, z: o.z + o.dir.z * exit },
    bounds: o.bounds,
    ...(o.crouch !== undefined ? { requiresCrouch: o.crouch } : {}),
    ...(o.concealment !== undefined ? { concealment: o.concealment } : {}),
  })
}

/** Custom-scene levels place their own hide spots, so the office placer is unused. */
export const HAND_PLACED_RULES: HideSpotRules = {
  minPerFloor: 0,
  minSpacing: 3,
  sectors: 1,
  weights: {},
  keepOut: [],
  wallCells: [],
  openCells: [],
}

export const pick = <T,>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)]

export function shuffle<T>(rand: () => number, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

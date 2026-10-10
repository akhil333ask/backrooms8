import type { AmbienceKind } from '@/levels/types'
import { CELL, ELEV, FLOOR_H, LOBBY, STAIR } from '@/lib/backrooms/constants'
import { P } from '@/levels/pool-layout'
import { LOBBY_B1, RAMP } from './garage-zone'
import { inLivingWing, inPoolWing, LIVING_FLOOR, LIVING_HALLS, POOL_CORRIDORS, POOL_FLOOR, POOL_ORIGIN } from './wings'

export type ZoneId = 'garage' | 'yellow-1' | 'yellow-2' | 'yellow-3' | 'pool' | 'living'

export interface ZoneEnv {
  fog: { color: string; near: number; far: number }
  ambient: { skyColor: string; groundColor: string; hemiIntensity: number; color: string; intensity: number }
  lightStyle: { color: string; intensity: number; blackoutAmbient: number }
  ambientSound: { humBase: number; humRange: number; buzzGain: number }
  ambience: AmbienceKind | null
}

export interface ZoneDef {
  id: ZoneId
  /** Corner card: small title + big subtitle. */
  title: string
  name: string
  floor: number
  env: ZoneEnv
  /** Zones reachable through a doorway / stairs / ramp. Render + collision set = current + these. */
  neighbors: ZoneId[]
  start: { floor: number; x: number; z: number; yaw: number }
}

const YELLOW_ENV: ZoneEnv = {
  fog: { color: '#9d9462', near: 8, far: 62 },
  ambient: { skyColor: '#fff8dc', groundColor: '#a0925a', hemiIntensity: 1.25, color: '#fff2c8', intensity: 0.35 },
  lightStyle: { color: '#fff4d2', intensity: 3.6, blackoutAmbient: 0.3 },
  ambientSound: { humBase: 0.025, humRange: 0.11, buzzGain: 0.025 },
  ambience: null,
}

const ZONE_B_ENV: ZoneEnv = {
  ...YELLOW_ENV,
  fog: { color: '#6f6744', near: 6, far: 48 },
  ambient: { skyColor: '#e9dcb0', groundColor: '#7d6f42', hemiIntensity: 0.95, color: '#e6d3a4', intensity: 0.26 },
  lightStyle: { color: '#ffe9bf', intensity: 3.1, blackoutAmbient: 0.25 },
}

const GARAGE_ENV: ZoneEnv = {
  fog: { color: '#1b201c', near: 1.5, far: 21 },
  ambient: { skyColor: '#5d665c', groundColor: '#2a2823', hemiIntensity: 0.22, color: '#8a9484', intensity: 0.06 },
  lightStyle: { color: '#d6e6cc', intensity: 6, blackoutAmbient: 0.15 },
  ambientSound: { humBase: 0.012, humRange: 0.05, buzzGain: 0.03 },
  ambience: 'garage',
}

/** levels/level-2.ts values. */
const POOL_ENV: ZoneEnv = {
  fog: { color: '#a9d8d6', near: 6, far: 42 },
  ambient: { skyColor: '#f4ffff', groundColor: '#8fc4c6', hemiIntensity: 1.1, color: '#e6fbfb', intensity: 0.35 },
  lightStyle: { color: '#e9fbff', intensity: 5, blackoutAmbient: 0.5 },
  ambientSound: { humBase: 0.012, humRange: 0.04, buzzGain: 0.008 },
  ambience: 'pool',
}

/** levels/level-3.ts values, lifted further so the rooms read without the flashlight. */
const LIVING_ENV: ZoneEnv = {
  fog: { color: '#4a3622', near: 4, far: 34 },
  ambient: { skyColor: '#d2a676', groundColor: '#5e4530', hemiIntensity: 1.7, color: '#e3b685', intensity: 0.55 },
  lightStyle: { color: '#ff9d55', intensity: 5.2, blackoutAmbient: 0.35 },
  ambientSound: { humBase: 0.008, humRange: 0.03, buzzGain: 0.004 },
  ambience: 'living',
}

const lobbyStart = (floor: number) => ({
  floor,
  x: ((LOBBY.cx0 + LOBBY.cx1 + 1) / 2) * CELL,
  z: (LOBBY.cz0 + 1.5) * CELL,
  yaw: Math.PI,
})

export const ZONES: Record<ZoneId, ZoneDef> = {
  garage: {
    id: 'garage',
    title: 'B1',
    name: 'The Garage',
    floor: 0,
    env: GARAGE_ENV,
    neighbors: ['yellow-1'],
    start: { floor: 0, x: LOBBY_B1.doorX, z: LOBBY_B1.z0 + 2.5, yaw: 0 },
  },
  'yellow-1': {
    id: 'yellow-1',
    title: 'Floor 1',
    name: 'The Yellow Rooms',
    floor: 1,
    env: YELLOW_ENV,
    neighbors: ['garage', 'yellow-2', 'living'],
    start: lobbyStart(1),
  },
  'yellow-2': {
    id: 'yellow-2',
    title: 'Floor 2',
    name: 'The Yellow Rooms',
    floor: 2,
    env: YELLOW_ENV,
    neighbors: ['yellow-1', 'yellow-3', 'pool'],
    start: lobbyStart(2),
  },
  pool: {
    id: 'pool',
    title: 'Floor 2',
    name: 'The Pool Rooms',
    floor: POOL_FLOOR,
    env: POOL_ENV,
    neighbors: ['yellow-2'],
    start: { floor: POOL_FLOOR, x: POOL_ORIGIN.x + P.ROOM / 2, z: POOL_ORIGIN.z + P.ROOM / 2, yaw: -Math.PI / 2 },
  },
  living: {
    id: 'living',
    title: 'Floor 1',
    name: 'The Living Room',
    floor: LIVING_FLOOR,
    env: LIVING_ENV,
    neighbors: ['yellow-1'],
    start: { floor: LIVING_FLOOR, x: LIVING_HALLS[0].x, z: -3, yaw: 0 },
  },
  'yellow-3': {
    id: 'yellow-3',
    title: 'Floor 3',
    name: 'Zone B',
    floor: 3,
    env: ZONE_B_ENV,
    neighbors: ['yellow-2'],
    start: lobbyStart(3),
  },
}

export const ZONE_IDS = Object.keys(ZONES) as ZoneId[]

/** Which zone owns this point. Wings own everything outside the building on their floor (corridors included). */
export function zoneAt(floor: number, x: number, z: number): ZoneId {
  if (floor <= 0) return 'garage'
  if (floor === POOL_FLOOR && inPoolWing(x, z)) return 'pool'
  if (floor === LIVING_FLOOR && inLivingWing(x, z)) return 'living'
  return `yellow-${Math.min(3, floor)}` as ZoneId
}

export const zoneOnFloor = (floor: number) => zoneAt(floor, 0, 0)

/**
 * A doorway between two zones. Used to lazily mount the far side when the player is within
 * MOUNT_RANGE, and (when `blend`) to crossfade fog/ambient/sound within BLEND_RANGE.
 * Vertical connectors (stairwell, ramp) blend by height instead, see zone-manager.
 */
export interface Portal {
  a: ZoneId
  b: ZoneId
  x: number
  y: number
  z: number
  blend?: boolean
  /** Mount distance override. Other floors are only visible through a stair door or the elevator cab up close. */
  range?: number
}

const stairDoor = (floor: number) => ({ x: STAIR.x1 - 0.5, y: floor * FLOOR_H, z: (STAIR.doorZ0 + STAIR.doorZ1) / 2 })
const elevDoor = (floor: number) => ({ x: ELEV.x, y: floor * FLOOR_H, z: ELEV.frontZ0 - 0.6 })

export const PORTALS: Portal[] = [
  ...[0, 1, 2].flatMap((k) => {
    const a = zoneOnFloor(k)
    const b = zoneOnFloor(k + 1)
    return [
      { a, b, ...stairDoor(k), range: 9 },
      { a, b, ...stairDoor(k + 1), range: 9 },
      { a, b, ...elevDoor(k), range: 3.5 },
      { a, b, ...elevDoor(k + 1), range: 3.5 },
    ]
  }),
  { a: 'yellow-1', b: 'garage', x: RAMP.x0, y: RAMP.rise, z: RAMP.topDoorZ },
  { a: 'yellow-1', b: 'garage', x: RAMP.x0, y: 0, z: RAMP.bottomDoorZ },
  ...POOL_CORRIDORS.map((c) => ({ a: 'yellow-2' as const, b: 'pool' as const, x: c.x1, y: POOL_FLOOR * FLOOR_H, z: c.z, blend: true })),
  ...LIVING_HALLS.map((h) => ({ a: 'yellow-1' as const, b: 'living' as const, x: h.x, y: LIVING_FLOOR * FLOOR_H, z: h.z1, blend: true })),
]

export const MOUNT_RANGE = 15
export const BLEND_RANGE = 6

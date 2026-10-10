import type { ComponentType } from 'react'
import type { HideSpot } from '@/lib/backrooms/hide-spot'
import type { HideSpotRules } from '@/lib/backrooms/hide-spot-placer'
import type { MaterialSet } from '@/lib/backrooms/materials'
import type { TextureSet } from '@/lib/backrooms/textures'
import type { FloorData } from '@/lib/backrooms/world-generator'

export interface LevelData {
  floors: FloorData[]
  hideSpots: HideSpot[]
  /** Level-specific layout (pools, portals, cars...) consumed by its scene + physics. */
  extra?: unknown
}

export type WaterKind = 'dry' | 'shallow' | 'deep'

export interface WaterMedium {
  kind: WaterKind
  /** Movement speed multiplier. */
  speed: number
  /** World Y of the water surface. */
  surface: number
}

/** Optional per-level movement rules for levels that don't use the office building. */
export interface LevelPhysics {
  groundAt: (extra: unknown, x: number, z: number, feet: number, crouching: boolean) => number
  medium?: (extra: unknown, x: number, z: number) => WaterMedium
  /** Runs after collision; may reposition the player (e.g. looping doorways). */
  afterMove?: (extra: unknown, pos: { x: number; z: number }) => void
}

export type AmbienceKind = 'garage' | 'pool' | 'living'

export interface SpawnPoint {
  floor: number
  x: number
  z: number
  yaw: number
}

export interface LevelConfig {
  id: string
  name: string
  /** Must be pure: identical levelSeed => identical LevelData (required for 1v1 sync). */
  generate: (levelSeed: number) => LevelData
  materials: () => MaterialSet
  textures: () => TextureSet
  /** Frees GPU resources owned by this level. Called when switching to another level. */
  dispose: () => void
  fog: { color: string; near: number; far: number }
  ambient: {
    skyColor: string
    groundColor: string
    hemiIntensity: number
    color: string
    intensity: number
  }
  lightStyle: {
    color: string
    intensity: number
    /** How much of the ambient fill survives a zone blackout (0-1). */
    blackoutAmbient: number
  }
  ambientSound: { humBase: number; humRange: number; buzzGain: number }
  hideSpotRules: HideSpotRules
  spawn: (data: LevelData, levelSeed: number) => SpawnPoint
  /** Custom renderer. When set it replaces the office building (floors, elevator, stairwell, light rig). */
  scene?: ComponentType<{ extra: unknown }>
  physics?: LevelPhysics
  /** Synthesized ambience layered on top of the base hum. */
  ambience?: AmbienceKind
}

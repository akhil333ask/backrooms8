import { CELL, FLOORS, LOBBY, STAIR } from '@/lib/backrooms/constants'
import { placeHideSpots } from '@/lib/backrooms/hide-spot-placer'
import { disposeMaterials, getMaterials } from '@/lib/backrooms/materials'
import { hashSeed, mulberry32 } from '@/lib/backrooms/rng'
import { disposeTextures, getTextures } from '@/lib/backrooms/textures'
import { CellType, generateBuilding } from '@/lib/backrooms/world-generator'
import type { LevelConfig } from './types'

/** Level 0: the original mono-yellow office maze. */
export const level0: LevelConfig = {
  id: 'level-0',
  name: 'Level 0',
  generate(levelSeed) {
    const floors = generateBuilding(levelSeed, FLOORS)
    const hideSpots = floors.flatMap((floor, i) =>
      placeHideSpots(floor, level0.hideSpotRules, mulberry32(hashSeed(levelSeed, i, 0x41de5))),
    )
    return { floors, hideSpots }
  },
  materials: getMaterials,
  textures: getTextures,
  dispose() {
    disposeMaterials()
    disposeTextures()
  },
  fog: { color: '#9d9462', near: 8, far: 62 },
  ambient: { skyColor: '#fff8dc', groundColor: '#a0925a', hemiIntensity: 1.25, color: '#fff2c8', intensity: 0.35 },
  lightStyle: { color: '#fff4d2', intensity: 3.6, blackoutAmbient: 0.3 },
  ambientSound: { humBase: 0.025, humRange: 0.11, buzzGain: 0.025 },
  hideSpotRules: {
    minPerFloor: 28,
    minSpacing: 3.2,
    sectors: 6,
    weights: { desk: 3, locker: 3, partition: 2, closet: 3, vent: 3, pillar: 1 },
    keepOut: [
      // Elevator lobby + shaft
      { x0: LOBBY.cx0 * CELL, z0: LOBBY.cz0 * CELL, x1: (LOBBY.cx1 + 1) * CELL, z1: (LOBBY.cz1 + 2) * CELL },
      // Straight corridor from the stairwell door to the lobby
      { x0: 0, z0: STAIR.doorCell.cz * CELL, x1: LOBBY.cx0 * CELL, z1: (STAIR.doorCell.cz + 1) * CELL },
    ],
    wallCells: [CellType.Normal, CellType.Hall, CellType.Room],
    openCells: [CellType.Hall],
  },
  spawn: () => ({
    floor: 0,
    x: ((LOBBY.cx0 + LOBBY.cx1 + 1) / 2) * CELL,
    z: (LOBBY.cz0 + 1.5) * CELL,
    yaw: Math.PI,
  }),
}

import { disposePools, PoolScene } from '@/components/levels/pool-scene'
import { getMaterials } from '@/lib/backrooms/materials'
import { getTextures } from '@/lib/backrooms/textures'
import { HAND_PLACED_RULES } from '@/lib/levels-kit/level-helpers'
import { generatePools, poolGroundAt, poolMedium, poolSpawn } from './pool-layout'
import type { LevelConfig } from './types'

/** Level 2: bright, humid tiled rooms full of still water. */
export const level2: LevelConfig = {
  id: 'level-2',
  name: 'Level 2: The Pool Rooms',
  generate: generatePools,
  materials: getMaterials,
  textures: getTextures,
  dispose: disposePools,
  fog: { color: '#a9d8d6', near: 6, far: 42 },
  ambient: { skyColor: '#f4ffff', groundColor: '#8fc4c6', hemiIntensity: 1.1, color: '#e6fbfb', intensity: 0.35 },
  lightStyle: { color: '#e9fbff', intensity: 5, blackoutAmbient: 0.5 },
  ambientSound: { humBase: 0.012, humRange: 0.04, buzzGain: 0.008 },
  hideSpotRules: HAND_PLACED_RULES,
  spawn: poolSpawn,
  scene: PoolScene,
  physics: { groundAt: poolGroundAt, medium: poolMedium },
  ambience: 'pool',
}

import { disposeGarage, GarageScene } from '@/components/levels/garage-scene'
import { getMaterials } from '@/lib/backrooms/materials'
import { getTextures } from '@/lib/backrooms/textures'
import { HAND_PLACED_RULES } from '@/lib/levels-kit/level-helpers'
import { garageGroundAt, generateGarage } from './garage-layout'
import type { LevelConfig } from './types'

/** Level 1: low, dim, two-deck concrete parking garage. */
export const level1: LevelConfig = {
  id: 'level-1',
  name: 'Level 1: Concrete Parking Garage',
  generate: generateGarage,
  materials: getMaterials,
  textures: getTextures,
  dispose: disposeGarage,
  fog: { color: '#1b201c', near: 1.5, far: 21 },
  ambient: { skyColor: '#5d665c', groundColor: '#2a2823', hemiIntensity: 0.22, color: '#8a9484', intensity: 0.06 },
  lightStyle: { color: '#d6e6cc', intensity: 6, blackoutAmbient: 0.15 },
  ambientSound: { humBase: 0.012, humRange: 0.05, buzzGain: 0.03 },
  hideSpotRules: HAND_PLACED_RULES,
  spawn: () => ({ floor: 0, x: 4, z: 27, yaw: -Math.PI / 2 }),
  scene: GarageScene,
  physics: { groundAt: garageGroundAt },
  ambience: 'garage',
}

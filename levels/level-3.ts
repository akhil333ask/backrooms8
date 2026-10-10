import { disposeLiving, LivingScene } from '@/components/levels/living-scene'
import { getMaterials } from '@/lib/backrooms/materials'
import { getTextures } from '@/lib/backrooms/textures'
import { HAND_PLACED_RULES } from '@/lib/levels-kit/level-helpers'
import { generateLiving, livingAfterMove, livingSpawn } from './living-layout'
import type { LevelConfig } from './types'

/** Level 3: dated, lamplit rooms that don't quite connect the way they should. */
export const level3: LevelConfig = {
  id: 'level-3',
  name: 'Level 3: The Living Room',
  generate: generateLiving,
  materials: getMaterials,
  textures: getTextures,
  dispose: disposeLiving,
  fog: { color: '#2e2014', near: 2.5, far: 30 },
  ambient: { skyColor: '#a07a55', groundColor: '#3a2a1c', hemiIntensity: 0.64, color: '#c99a6a', intensity: 0.16 },
  lightStyle: { color: '#ff9d55', intensity: 5.2, blackoutAmbient: 0.25 },
  ambientSound: { humBase: 0.008, humRange: 0.03, buzzGain: 0.004 },
  hideSpotRules: HAND_PLACED_RULES,
  spawn: livingSpawn,
  scene: LivingScene,
  physics: { groundAt: () => 0, afterMove: livingAfterMove },
  ambience: 'living',
}

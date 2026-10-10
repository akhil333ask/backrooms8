import { hashSeed } from '@/lib/backrooms/rng'
import { level0 } from './level-0'
import { level1 } from './level-1'
import { level2 } from './level-2'
import { level3 } from './level-3'
import type { LevelConfig } from './types'

export type { LevelConfig, LevelData, SpawnPoint } from './types'

export const LEVELS: Record<string, LevelConfig> = {
  [level0.id]: level0,
  [level1.id]: level1,
  [level2.id]: level2,
  [level3.id]: level3,
}

export const DEFAULT_LEVEL_ID = level0.id

export const getLevelConfig = (id: string): LevelConfig => LEVELS[id] ?? LEVELS[DEFAULT_LEVEL_ID]

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h >>> 0
}

/** Every random decision in a level derives from this, so (levelId, seed) => identical map. */
export const deriveLevelSeed = (levelId: string, seed: number) => hashSeed(hashString(levelId), seed)

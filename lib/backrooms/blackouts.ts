import { audio } from './audio'
import { CELL } from './constants'
import { hashSeed, mulberry32, type Rng } from './rng'

/** Lights are grouped into a 3x3 grid of 18m zones (matches the generator's dimming grid). */
const ZONE_SIZE = 6 * CELL
const clampZone = (v: number) => Math.max(0, Math.min(2, Math.floor(v / ZONE_SIZE)))
export const zoneOf = (x: number, z: number) => clampZone(z) * 3 + clampZone(x)

const RETURN_STUTTER = 0.45

const state = {
  rng: mulberry32(1) as Rng,
  pendingReset: true,
  nextAt: Infinity,
  zone: -1,
  end: 0,
  returnEnd: 0,
  returned: false,
}

/** Event timing is seeded so it can be replayed identically on another client. */
export function resetBlackouts(levelSeed: number) {
  state.rng = mulberry32(hashSeed(levelSeed, 0xb1ac0))
  state.pendingReset = true
  state.zone = -1
}

export function updateBlackouts(t: number, playerZone: number, active: boolean) {
  if (state.pendingReset) {
    state.pendingReset = false
    state.nextAt = t + 14 + state.rng() * 16
  }
  if (!active) return
  const r = state.rng
  if (state.zone < 0) {
    if (t < state.nextAt) return
    state.zone = r() < 0.7 ? playerZone : Math.floor(r() * 9)
    state.end = t + 1 + r() * 2
    state.returnEnd = state.end + RETURN_STUTTER
    state.returned = false
    audio.blackoutCut()
    return
  }
  if (!state.returned && t >= state.end) {
    state.returned = true
    audio.buzzReturn()
  }
  if (t >= state.returnEnd) {
    state.zone = -1
    state.nextAt = t + 15 + r() * 25
  }
}

/** Multiplier applied to a light at (x, z). 0 = cut, stutters back on return. */
export function zoneFactor(x: number, z: number, t: number): number {
  if (state.zone < 0 || zoneOf(x, z) !== state.zone) return 1
  if (t < state.end) return 0
  return Math.random() < 0.5 ? 0.15 : 1
}

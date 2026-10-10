import { useSyncExternalStore } from 'react'
import type { HideSpot } from './hide-spot'

export const NOISE = { run: 1, walk: 0.4, crouch: 0.1, hidden: 0, idle: 0 } as const
export const EYE_STAND = 1.7
export const EYE_CROUCH = 1.0

const BATTERY_DRAIN = 1 / 150
const BATTERY_RECHARGE = 1 / 300
export const LOW_BATTERY = 0.2

/**
 * Player gameplay state readable by a future seeker AI or multiplayer layer.
 * Mutated every frame by the game loop; React reads it through `usePlayer`.
 */
export const player = {
  noise: 0 as number,
  isHidden: false,
  currentHideSpot: null as HideSpot | null,
  crouching: false,
  crouchToggled: false,
  eye: EYE_STAND,
  flashlightOn: false,
  battery: 1,
}

export interface PlayerSnapshot {
  noise: number
  isHidden: boolean
  currentHideSpot: HideSpot | null
  crouching: boolean
  flashlightOn: boolean
  /** Battery rounded to 5% steps so the HUD doesn't re-render every frame. */
  battery: number
}

const makeSnapshot = (): PlayerSnapshot => ({
  noise: player.noise,
  isHidden: player.isHidden,
  currentHideSpot: player.currentHideSpot,
  crouching: player.crouching,
  flashlightOn: player.flashlightOn,
  battery: Math.ceil(player.battery * 20) / 20,
})

let snapshot = makeSnapshot()
const listeners = new Set<() => void>()

/** Publishes changes to subscribers. Cheap to call every frame. */
export function commitPlayer() {
  const next = makeSnapshot()
  let changed = false
  for (const k in next) {
    const key = k as keyof PlayerSnapshot
    if (next[key] !== snapshot[key]) changed = true
  }
  if (!changed) return
  snapshot = next
  listeners.forEach((l) => l())
}

export const getPlayer = () => snapshot

export function usePlayer<T>(selector: (s: PlayerSnapshot) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => selector(snapshot),
    () => selector(snapshot),
  )
}

export function toggleCrouch() {
  if (player.isHidden) return
  player.crouchToggled = !player.crouchToggled
  commitPlayer()
}

export function toggleFlashlight() {
  if (!player.flashlightOn && player.battery <= 0.01) return
  player.flashlightOn = !player.flashlightOn
  commitPlayer()
}

export function updateBattery(dt: number) {
  if (player.flashlightOn) {
    player.battery = Math.max(0, player.battery - dt * BATTERY_DRAIN)
    if (player.battery <= 0) player.flashlightOn = false
  } else {
    player.battery = Math.min(1, player.battery + dt * BATTERY_RECHARGE)
  }
}

export function resetPlayerState() {
  player.noise = 0
  player.isHidden = false
  player.currentHideSpot = null
  player.crouching = false
  player.crouchToggled = false
  player.eye = EYE_STAND
  commitPlayer()
}

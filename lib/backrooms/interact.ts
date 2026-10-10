import { ELEV, FLOOR_H, FLOOR_LABELS, FLOORS } from './constants'
import { playerInCab, pressCall, pressFloor } from './elevator-state'
import type { HideSpot } from './hide-spot'
import { enterHideSpot, hideLabel } from './hiding'
import { player } from './player-store'
import { game } from './store'

/** World-local positions of interactive buttons (y relative to the floor). */
export const CALL_BUTTON = { x: ELEV.x + 1.35, y: 1.15, z: ELEV.frontZ0 - 0.015 }
export const PANEL = { x: ELEV.cabX1 - 0.035, z: ELEV.cabZ0 + 0.45 }
export const panelButtonY = (i: number) => 1.05 + i * 0.16

const HIDE_RANGE = 2

interface Target {
  label: string
  x: number
  y: number
  z: number
  run: () => void
  spot?: HideSpot
  /** Hide spots use a looser aim cone than tiny buttons. */
  loose?: boolean
}

function targets(floor: number): Target[] {
  const base = floor * FLOOR_H
  if (playerInCab()) {
    return Array.from({ length: FLOORS }, (_, i) => ({
      label: `Floor ${FLOOR_LABELS[i]}`,
      x: PANEL.x,
      y: base + panelButtonY(i),
      z: PANEL.z,
      run: () => pressFloor(i),
    }))
  }
  const list: Target[] = [
    {
      label: 'Call elevator',
      x: CALL_BUTTON.x,
      y: base + CALL_BUTTON.y,
      z: CALL_BUTTON.z,
      run: () => pressCall(floor),
    },
  ]
  const p = game.player
  for (const spot of game.hideSpots) {
    if (spot.floor !== floor) continue
    const dx = p.x - spot.position.x
    const dz = p.z - spot.position.z
    if (dx * dx + dz * dz > (HIDE_RANGE + 0.6) ** 2) continue
    // Only from the open side, so spots behind a wall never light up.
    if (dx * spot.entryDirection.x + dz * spot.entryDirection.z < 0.05) continue
    list.push({
      label: hideLabel(spot),
      x: spot.position.x,
      y: base + spot.position.y,
      z: spot.position.z,
      run: () => enterHideSpot(spot),
      spot,
      loose: true,
    })
  }
  return list
}

/**
 * Finds the button the player is looking at. Uses a view cone plus
 * distance so it works with imprecise touch aiming too.
 */
export function findTarget(floor: number, coarse: boolean): Target | null {
  const p = game.player
  const ex = p.x
  const ey = p.feet + player.eye
  const ez = p.z
  const cp = Math.cos(p.pitch)
  const fx = -Math.sin(p.yaw) * cp
  const fy = Math.sin(p.pitch)
  const fz = -Math.cos(p.yaw) * cp
  let best: Target | null = null
  let bestScore = -Infinity
  for (const t of targets(floor)) {
    const dx = t.x - ex
    const dy = t.y - ey
    const dz = t.z - ez
    const d = Math.hypot(dx, dy, dz)
    const maxD = t.spot ? HIDE_RANGE + 0.4 : 2.1
    if (d > maxD || d < 0.05) continue
    if (t.spot && Math.hypot(t.x - ex, t.z - ez) > HIDE_RANGE) continue
    const minDot = t.loose ? (coarse ? 0.78 : 0.84) : coarse ? 0.9 : 0.95
    const dot = (dx * fx + dy * fy + dz * fz) / d
    if (dot < minDot) continue
    if (dot > bestScore) {
      bestScore = dot
      best = t
    }
  }
  return best
}

import type * as THREE from 'three'
import { FLOOR_H } from './constants'
import { canEnter, HIDE_SPOT_INFO, occupy, vacate, type HideSpot } from './hide-spot'
import { commitPlayer, NOISE, player } from './player-store'
import { game } from './store'

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export const hideLabel = (spot: HideSpot) =>
  `Hide ${spot.label ?? HIDE_SPOT_INFO[spot.type].label}${spot.requiresCrouch ? ' (crouch)' : ''}`

export function enterHideSpot(spot: HideSpot): boolean {
  if (player.isHidden || !canEnter(spot)) return false
  occupy(spot)
  player.isHidden = true
  player.currentHideSpot = spot
  player.noise = NOISE.hidden
  if (spot.requiresCrouch) player.crouchToggled = true
  game.player.yaw = spot.cameraPose.yaw
  game.player.pitch = spot.cameraPose.pitch
  commitPlayer()
  return true
}

export function exitHideSpot() {
  const spot = player.currentHideSpot
  if (!spot) return
  vacate(spot)
  const p = game.player
  p.x = spot.exitPoint.x
  p.z = spot.exitPoint.z
  p.yaw = Math.atan2(-spot.entryDirection.x, -spot.entryDirection.z)
  p.pitch = 0
  player.isHidden = false
  player.currentHideSpot = null
  if (spot.requiresCrouch) player.crouchToggled = false
  commitPlayer()
}

/** Locks the camera to the spot's pose, allowing a limited peek. */
export function updateHidden(camera: THREE.Camera, dt: number) {
  const spot = player.currentHideSpot
  if (!spot) return
  const p = game.player
  const pose = spot.cameraPose
  const dy = Math.max(-spot.peek.yaw, Math.min(spot.peek.yaw, wrap(p.yaw - pose.yaw)))
  p.yaw = pose.yaw + dy
  p.pitch = Math.max(pose.pitch - spot.peek.pitch, Math.min(pose.pitch + spot.peek.pitch, p.pitch))
  player.noise = NOISE.hidden
  player.eye = pose.y

  const k = Math.min(1, dt * 10)
  const y = spot.floor * FLOOR_H + pose.y
  camera.position.set(
    camera.position.x + (pose.x - camera.position.x) * k,
    camera.position.y + (y - camera.position.y) * k,
    camera.position.z + (pose.z - camera.position.z) * k,
  )
  camera.rotation.order = 'YXZ'
  camera.rotation.set(p.pitch, p.yaw, 0)
}

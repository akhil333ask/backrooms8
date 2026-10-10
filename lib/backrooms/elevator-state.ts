import { ELEV, FLOOR_H } from './constants'
import { aabb, type AABB } from './collision'
import { audio } from './audio'
import { floorOf, game } from './store'

type Phase = 'closed' | 'opening' | 'open' | 'closing' | 'moving'

const DOOR_TIME = 1.1
const AUTO_CLOSE = 9

export const elevator = {
  floor: 1,
  phase: 'open' as Phase,
  door: 1,
  timer: 0,
  target: null as number | null,
  riding: false,
  travel: 0,
  light: 1,
}

export const doorCollider: AABB = aabb(ELEV.x - ELEV.openHalf, ELEV.x + ELEV.openHalf, ELEV.frontZ0, ELEV.doorZ + 0.05)

export function resetElevator() {
  Object.assign(elevator, { floor: 1, phase: 'open', door: 1, timer: 0, target: null, riding: false, light: 1 })
}

export function playerInCab() {
  const p = game.player
  return p.x > ELEV.cabX0 && p.x < ELEV.cabX1 && p.z > ELEV.cabZ0 - 0.05 && p.z < ELEV.cabZ1
}

function playerInDoorway() {
  const p = game.player
  return Math.abs(p.x - ELEV.x) < ELEV.openHalf + 0.3 && p.z > ELEV.frontZ0 - 0.35 && p.z < ELEV.cabZ0 + 0.3
}

export function pressCall(playerFloor: number) {
  if (elevator.phase === 'moving') return
  if (elevator.floor === playerFloor) {
    if (elevator.phase === 'closed' || elevator.phase === 'closing') elevator.phase = 'opening'
    elevator.timer = 0
    return
  }
  elevator.target = playerFloor
  elevator.phase = elevator.phase === 'closed' ? 'moving' : 'closing'
  if (elevator.phase === 'moving') startMove()
}

export function pressFloor(f: number) {
  if (elevator.phase === 'moving' || elevator.phase === 'closing') return
  if (f === elevator.floor) {
    if (elevator.phase === 'closed') elevator.phase = 'opening'
    return
  }
  elevator.target = f
  elevator.phase = 'closing'
}

function startMove() {
  elevator.phase = 'moving'
  elevator.timer = 0
  elevator.riding = playerInCab() && floorOf(game.player.feet) === elevator.floor
  elevator.travel = 1.8 + 1.1 * Math.abs((elevator.target ?? elevator.floor) - elevator.floor)
  if (elevator.riding) audio.rumble(elevator.travel)
}

export function updateElevator(dt: number) {
  const e = elevator
  e.light += (1 - e.light) * Math.min(1, dt * 6)
  switch (e.phase) {
    case 'opening':
      e.door = Math.min(1, e.door + dt / DOOR_TIME)
      if (e.door >= 1) {
        e.phase = 'open'
        e.timer = 0
      }
      break
    case 'open':
      e.timer += dt
      if (e.timer > AUTO_CLOSE && !playerInCab() && !playerInDoorway()) e.phase = 'closing'
      break
    case 'closing':
      if (playerInDoorway() && floorOf(game.player.feet) === e.floor) {
        e.phase = 'opening'
        break
      }
      e.door = Math.max(0, e.door - dt / DOOR_TIME)
      if (e.door <= 0) {
        if (e.target !== null && e.target !== e.floor) startMove()
        else e.phase = 'closed'
      }
      break
    case 'moving': {
      e.timer += dt
      if (e.riding) {
        e.light = Math.random() < 0.08 ? 0.15 + Math.random() * 0.4 : e.light
        game.shake = 0.012
      }
      if (e.timer >= e.travel) {
        const target = e.target ?? e.floor
        if (e.riding) game.player.feet += (target - e.floor) * FLOOR_H
        e.floor = target
        e.target = null
        e.riding = false
        game.shake = 0
        e.phase = 'opening'
        if (floorOf(game.player.feet) === e.floor) audio.ding()
      }
      break
    }
  }
}

/** Door opening amount as seen from the given floor (0 closed, 1 open). */
export function doorFor(floor: number) {
  if (elevator.phase === 'moving' || elevator.floor !== floor) return 0
  return elevator.door
}

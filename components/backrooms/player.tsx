'use client'

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { WaterMedium } from '@/levels/types'
import { audio } from '@/lib/backrooms/audio'
import { moveWithCollision, type BoxSource } from '@/lib/backrooms/collision'
import { FLOOR_H, PLAYER_R } from '@/lib/backrooms/constants'
import { doorCollider, doorFor, updateElevator } from '@/lib/backrooms/elevator-state'
import { exitHideSpot, updateHidden } from '@/lib/backrooms/hiding'
import { findTarget } from '@/lib/backrooms/interact'
import { commitPlayer, EYE_CROUCH, EYE_STAND, NOISE, player } from '@/lib/backrooms/player-store'
import { buildStairwell, stairGround } from '@/lib/backrooms/stairs'
import { floorOf, game, getUi, setUi } from '@/lib/backrooms/store'
import { getWater, updateWater } from '@/lib/backrooms/water-state'
import { livingAfterMove } from '@/levels/living-layout'
import { P, poolGroundAt, poolMedium } from '@/levels/pool-layout'
import { garageGround, inGarage, rampGround } from '@/lib/world/garage-zone'
import { inLivingWing, inPoolRooms, LIVING_FLOOR, LIVING_ORIGIN, POOL_FLOOR, POOL_ORIGIN } from '@/lib/world/wings'
import { updateZones } from '@/lib/world/zone-manager'

/** Walkable height at (x, z) in the continuous world. */
function groundAt(x: number, z: number, feet: number, crouching: boolean) {
  const stair = stairGround(x, z, feet)
  if (stair !== null) return stair
  const ramp = rampGround(x, z)
  if (ramp !== null) return ramp
  const floor = floorOf(feet, x, z)
  if (floor === 0 && inGarage(x, z)) return garageGround(x)
  const base = floor * FLOOR_H
  if (floor === POOL_FLOOR && game.pool && inPoolRooms(x, z)) {
    const o = POOL_ORIGIN
    return base + poolGroundAt(game.pool.layout, x - o.x, z - o.z, feet - base, crouching)
  }
  return base
}

const DRY: WaterMedium = { kind: 'dry', speed: 1, surface: P.SURF }

/** Pool water under the player (dry everywhere else). Surface is floor-local. */
function mediumAt(x: number, z: number, floor: number): WaterMedium {
  if (floor !== POOL_FLOOR || !game.pool || !inPoolRooms(x, z)) return DRY
  return poolMedium(game.pool.layout, x - POOL_ORIGIN.x, z - POOL_ORIGIN.z)
}

const WALK = 2.4
const RUN = 4.3
const CROUCH = 1.25
const HEIGHT = 1.8

export function Player() {
  const camera = useThree((s) => s.camera)
  const stairColliders = useMemo(() => buildStairwell().colliders, [])
  const step = useRef(0)
  const vel = useRef({ x: 0, z: 0 })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    updateElevator(dt)

    const p = game.player
    const inp = game.input
    const ui = getUi()
    const floor = floorOf(p.feet)
    const data = game.floors[floor]
    if (!data) return

    p.yaw -= inp.lookDX
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - inp.lookDY))
    inp.lookDX = 0
    inp.lookDY = 0

    if (player.isHidden) {
      updateHidden(camera, dt)
      vel.current.x = 0
      vel.current.z = 0
      p.speed = 0
      game.highlight = null
      if (inp.interactQueued) {
        inp.interactQueued = false
        exitHideSpot()
      }
      commitPlayer()
      updateZones()
      setUi({ floor, target: player.isHidden ? 'Leave hiding spot' : null })
      return
    }

    const crouching = player.crouchToggled || inp.keys.has('ControlLeft') || inp.keys.has('ControlRight')
    player.crouching = crouching
    player.eye += ((crouching ? EYE_CROUCH : EYE_STAND) - player.eye) * Math.min(1, dt * 10)

    let mx = 0
    let mz = 0
    if (ui.started) {
      const k = inp.keys
      if (k.has('KeyW') || k.has('ArrowUp')) mz += 1
      if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1
      mx += inp.joyX
      mz += inp.joyY
    }
    const mag = Math.hypot(mx, mz)
    if (mag > 1) {
      mx /= mag
      mz /= mag
    }
    const medium = mediumAt(p.x, p.z, floor)
    const wet = medium.kind !== 'dry'
    const running =
      !crouching && (inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight') || Math.hypot(inp.joyX, inp.joyY) > 0.95)
    const speed = (crouching ? CROUCH : running ? RUN : WALK) * medium.speed
    const fx = -Math.sin(p.yaw)
    const fz = -Math.cos(p.yaw)
    const rx = Math.cos(p.yaw)
    const rz = -Math.sin(p.yaw)
    const tvx = (fx * mz + rx * mx) * speed
    const tvz = (fz * mz + rz * mx) * speed
    const accel = Math.min(1, dt * 10)
    vel.current.x += (tvx - vel.current.x) * accel
    vel.current.z += (tvz - vel.current.z) * accel

    const base = floor * FLOOR_H
    // Current floor + the floors directly above/below (ramp and stair landings straddle two).
    const sources: BoxSource[] = [{ boxes: stairColliders, yOffset: 0 }]
    for (let k = Math.max(0, floor - 1); k <= Math.min(game.floors.length - 1, floor + 1); k++) {
      sources.push({ boxes: game.floors[k].colliders, yOffset: k * FLOOR_H })
    }
    if (doorFor(floor) < 0.85) sources.push({ boxes: [doorCollider], yOffset: base })
    moveWithCollision(p, p.feet, HEIGHT, PLAYER_R, vel.current.x * dt, vel.current.z * dt, sources)
    if (floor === LIVING_FLOOR && game.living && inLivingWing(p.x, p.z)) {
      // The loop room's wrong doors work in wing-local coordinates.
      const o = LIVING_ORIGIN
      const local = { x: p.x - o.x, z: p.z - o.z }
      livingAfterMove(game.living.layout, local)
      p.x = local.x + o.x
      p.z = local.z + o.z
    }

    const ground = groundAt(p.x, p.z, p.feet, crouching)
    if (ground > p.feet) p.feet += (ground - p.feet) * Math.min(1, dt * (wet ? 4 : 18)) + 0.0005
    else p.feet = Math.max(ground, p.feet - (wet ? 1.8 : 7) * dt)
    if (Math.abs(ground - p.feet) < 0.002) p.feet = ground
    updateWater(medium.kind, p.feet + player.eye, base + medium.surface)

    const moving = Math.hypot(vel.current.x, vel.current.z)
    p.speed = moving
    player.noise = moving > 0.2 ? (crouching ? NOISE.crouch : running ? NOISE.run : NOISE.walk) : NOISE.idle
    if (getWater().submerged) player.noise = NOISE.hidden
    if (moving > 0.2) {
      p.bob += dt * moving * 2.6
      const s = Math.floor(p.bob / Math.PI)
      if (s !== step.current) {
        step.current = s
        if (wet) audio.splash(medium.kind === 'deep' ? 0.45 : crouching ? 0.4 : 0.9)
        else audio.footstep(running, crouching ? 0.3 : 1)
      }
    } else {
      p.bob += (Math.round(p.bob / Math.PI) * Math.PI - p.bob) * Math.min(1, dt * 6)
    }
    const amp = Math.min(1, moving / RUN)
    const swimBob = medium.kind === 'deep' ? Math.sin(performance.now() / 650) * 0.05 : 0
    const bobY = Math.abs(Math.sin(p.bob)) * 0.045 * amp + swimBob
    const bobX = Math.cos(p.bob) * 0.025 * amp
    const sh = game.shake
    camera.position.set(
      p.x + rx * bobX + (Math.random() - 0.5) * sh,
      p.feet + player.eye + bobY - 0.02 * amp + (Math.random() - 0.5) * sh,
      p.z + rz * bobX,
    )
    camera.rotation.order = 'YXZ'
    camera.rotation.set(p.pitch, p.yaw, 0)

    const currentFloor = floorOf(p.feet)
    const target = ui.started ? findTarget(currentFloor, ui.isTouch) : null
    game.highlight = target?.spot ?? null
    if (inp.interactQueued) {
      inp.interactQueued = false
      target?.run()
    }
    commitPlayer()
    updateZones()
    setUi({ floor: currentFloor, target: player.isHidden ? 'Leave hiding spot' : (target?.label ?? null) })
  })

  return null
}

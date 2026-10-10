import * as THREE from 'three'
import type { AmbienceKind } from '@/levels/types'
import { ambience } from '@/lib/backrooms/ambience'
import { audio } from '@/lib/backrooms/audio'
import { FLOOR_H, FLOORS } from '@/lib/backrooms/constants'
import { elevator } from '@/lib/backrooms/elevator-state'
import { inStairwell } from '@/lib/backrooms/stairs'
import { floorOf, game, getUi, setUi } from '@/lib/backrooms/store'
import { inRamp } from './garage-zone'
import { BLEND_RANGE, MOUNT_RANGE, PORTALS, ZONES, zoneAt, zoneOnFloor, type ZoneId } from './zones'

/** Blended environment for this frame. Read by the environment, light rig and audio. */
export const zoneEnv = {
  fogColor: new THREE.Color(),
  fogNear: 8,
  fogFar: 60,
  sky: new THREE.Color(),
  ground: new THREE.Color(),
  hemi: 1,
  ambColor: new THREE.Color(),
  amb: 0.3,
  lightColor: new THREE.Color(),
  lightIntensity: 3.6,
  blackoutAmbient: 0.3,
  /** Weight of the yellow office lighting (0 in the garage). */
  officeLights: 1,
}

const colors = new Map<ZoneId, { fog: THREE.Color; sky: THREE.Color; ground: THREE.Color; amb: THREE.Color; light: THREE.Color }>()
function zoneColors(id: ZoneId) {
  let c = colors.get(id)
  if (!c) {
    const e = ZONES[id].env
    c = {
      fog: new THREE.Color(e.fog.color),
      sky: new THREE.Color(e.ambient.skyColor),
      ground: new THREE.Color(e.ambient.groundColor),
      amb: new THREE.Color(e.ambient.color),
      light: new THREE.Color(e.lightStyle.color),
    }
    colors.set(id, c)
  }
  return c
}

const weights = new Map<ZoneId, number>()
const add = (id: ZoneId, w: number) => weights.set(id, (weights.get(id) ?? 0) + w)

function computeWeights(current: ZoneId) {
  weights.clear()
  const p = game.player
  const ramp = inRamp(p.x, p.z)
  if (ramp || inStairwell(p.x, p.z)) {
    // Vertical connectors crossfade by height, so the blend is continuous with both floors' doorways.
    const t = Math.max(0, Math.min(ramp ? 1 : FLOORS - 1, p.feet / FLOOR_H))
    const k0 = Math.min(Math.floor(t), FLOORS - 2)
    const f = t - k0
    add(zoneOnFloor(k0), 1 - f)
    add(zoneOnFloor(k0 + 1), f)
    return
  }
  let best: { id: ZoneId; w: number } | null = null
  for (const portal of PORTALS) {
    if (!portal.blend || (portal.a !== current && portal.b !== current)) continue
    const d = Math.hypot(p.x - portal.x, (p.feet - portal.y) * 2, p.z - portal.z)
    if (d >= BLEND_RANGE) continue
    const w = 0.5 * (1 - d / BLEND_RANGE)
    if (!best || w > best.w) best = { id: portal.a === current ? portal.b : portal.a, w }
  }
  add(current, 1 - (best?.w ?? 0))
  if (best) add(best.id, best.w)
}

function blendEnv() {
  const e = zoneEnv
  e.fogColor.setRGB(0, 0, 0)
  e.sky.setRGB(0, 0, 0)
  e.ground.setRGB(0, 0, 0)
  e.ambColor.setRGB(0, 0, 0)
  e.lightColor.setRGB(0, 0, 0)
  e.fogNear = e.fogFar = e.hemi = e.amb = e.lightIntensity = e.blackoutAmbient = e.officeLights = 0
  let humBase = 0
  let humRange = 0
  let buzzGain = 0
  let amb: AmbienceKind | null = null
  let ambW = 0
  weights.forEach((w, id) => {
    const env = ZONES[id].env
    const c = zoneColors(id)
    e.fogColor.r += c.fog.r * w
    e.fogColor.g += c.fog.g * w
    e.fogColor.b += c.fog.b * w
    e.sky.r += c.sky.r * w
    e.sky.g += c.sky.g * w
    e.sky.b += c.sky.b * w
    e.ground.r += c.ground.r * w
    e.ground.g += c.ground.g * w
    e.ground.b += c.ground.b * w
    e.ambColor.r += c.amb.r * w
    e.ambColor.g += c.amb.g * w
    e.ambColor.b += c.amb.b * w
    e.lightColor.r += c.light.r * w
    e.lightColor.g += c.light.g * w
    e.lightColor.b += c.light.b * w
    e.fogNear += env.fog.near * w
    e.fogFar += env.fog.far * w
    e.hemi += env.ambient.hemiIntensity * w
    e.amb += env.ambient.intensity * w
    e.lightIntensity += env.lightStyle.intensity * w
    e.blackoutAmbient += env.lightStyle.blackoutAmbient * w
    if (id !== 'garage') e.officeLights += w
    humBase += env.ambientSound.humBase * w
    humRange += env.ambientSound.humRange * w
    buzzGain += env.ambientSound.buzzGain * w
    if (env.ambience && w > ambW) {
      amb = env.ambience
      ambW = w
    }
  })
  audio.configure({ humBase, humRange, buzzGain })
  const started = getUi().started
  ambience.set(started && amb && ambW > 0.02 ? amb : null)
  ambience.setVolume(ambW)
  ambience.tick()
}

let frame = 0
let lastMount = -100

/** Per-frame: current zone, environment blend, and which zones are mounted (current + nearby neighbours). */
export function updateZones() {
  frame++
  const p = game.player
  const floor = floorOf(p.feet)
  const current = zoneAt(floor, p.x, p.z)
  computeWeights(current)
  blendEnv()

  const allowed = new Set<ZoneId>([current, ...ZONES[current].neighbors])
  const wanted: ZoneId[] = []
  if (elevator.riding && elevator.target !== null) {
    const target = zoneOnFloor(elevator.target)
    allowed.add(target)
    wanted.push(target)
  }
  // Neighbours stay mounted until the player is well past the mount range (hysteresis avoids rebuild hitches).
  const keep = new Set<ZoneId>([current, ...wanted])
  for (const portal of PORTALS) {
    if (portal.a !== current && portal.b !== current) continue
    const d = Math.hypot(p.x - portal.x, p.feet - portal.y, p.z - portal.z)
    const range = portal.range ?? MOUNT_RANGE
    const other = portal.a === current ? portal.b : portal.a
    if (d < range) wanted.push(other)
    if (d < range * 1.6 + 2) keep.add(other)
  }
  if (inStairwell(p.x, p.z) || inRamp(p.x, p.z)) {
    wanted.push(...ZONES[current].neighbors)
    ZONES[current].neighbors.forEach((id) => keep.add(id))
  }

  const ui = getUi()
  let mounted = ui.mounted.filter((id) => allowed.has(id) && keep.has(id))
  if (!mounted.includes(current)) mounted = [current, ...mounted]
  // Add at most one far-side zone every few frames so geometry builds don't stack into one hitch.
  const next = wanted.find((id) => !mounted.includes(id))
  if (next && frame - lastMount > 12) {
    mounted = [...mounted, next]
    lastMount = frame
  }
  const changed = mounted.length !== ui.mounted.length || mounted.some((id, i) => ui.mounted[i] !== id)
  setUi({ zone: current, floor, ...(changed ? { mounted } : {}) })
}

export function resetZones(start: ZoneId) {
  lastMount = -100
  setUi({ zone: start, mounted: [start] })
}

'use client'

import { GarageLights, GarageZoneScene } from '@/components/levels/garage-scene'
import { Elevator } from '@/components/backrooms/elevator'
import { FloorMesh } from '@/components/backrooms/floor-mesh'
import { LightRig } from '@/components/backrooms/light-rig'
import { Stairwell } from '@/components/backrooms/stairwell'
import { FLOOR_H } from '@/lib/backrooms/constants'
import { game, useUi } from '@/lib/backrooms/store'
import { ZONES, type ZoneId } from '@/lib/world/zones'
import { WingLights, WingScene } from './wing-scenes'

/** Geometry for one zone. Unmounting it disposes its geometry (and the garage's textures/materials). */
function ZoneGeometry({ id, activeFloor }: { id: ZoneId; activeFloor: number }) {
  if (id === 'garage') return game.garage ? <GarageZoneScene zone={game.garage} /> : null
  if (id === 'pool') return game.pool ? <WingScene wing={game.pool} /> : null
  if (id === 'living') return game.living ? <WingScene wing={game.living} /> : null
  const floor = ZONES[id].floor
  const data = game.floors[floor]
  if (!data) return null
  return <FloorMesh floor={data} yOffset={floor * FLOOR_H} active={floor === activeFloor} />
}

/**
 * The continuous world: every mounted zone (current + neighbours near a doorway, managed by
 * lib/world/zone-manager.ts) plus the shared connectors (stairwell, elevator) and light rigs.
 */
export function WorldScene() {
  const seed = useUi((s) => s.seed)
  const floor = useUi((s) => s.floor)
  const mounted = useUi((s) => s.mounted)
  const lobbyZone = game.floors[floor]?.lobbyZone ?? 0

  return (
    <>
      {mounted.map((id) => (
        <ZoneGeometry key={`${seed}-${id}`} id={id} activeFloor={floor} />
      ))}
      <Elevator floor={floor} zone={lobbyZone} yOffset={floor * FLOOR_H} concrete={floor === 0} />
      <Stairwell />
      <LightRig />
      {game.garage && <GarageLights key={seed} zone={game.garage} />}
      <WingLights key={`wing-${seed}`} />
    </>
  )
}

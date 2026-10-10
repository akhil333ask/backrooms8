'use client'

import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { BuiltMeshes } from '@/components/levels/built-meshes'
import { LightPool, type PoolLight } from '@/components/levels/light-pool'
import { disposeLiving, LivingScene, livingMaterials } from '@/components/levels/living-scene'
import { disposePools, PoolScene, poolMaterials } from '@/components/levels/pool-scene'
import { updateBlackouts, zoneFactor, zoneOf } from '@/lib/backrooms/blackouts'
import { FLOOR_H } from '@/lib/backrooms/constants'
import { game, getUi } from '@/lib/backrooms/store'
import { MeshBuilder } from '@/lib/levels-kit/builder'
import type { WingData } from '@/lib/world/wings'
import { zoneOnFloor } from '@/lib/world/zones'

function buildConnectors(wing: WingData) {
  const mb = new MeshBuilder()
  for (const { m, b, tex } of wing.boxes) mb.box(m, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, tex ?? 1)
  return mb.build()
}

/**
 * One wing (Pool Rooms or Living Room): the unchanged level scene placed at the wing origin, plus its connectors
 * (built with the same material set). Unmounting disposes geometry, textures and materials.
 */
export function WingScene({ wing }: { wing: WingData }) {
  const isPool = wing.id === 'pool'
  const mat = isPool ? poolMaterials() : livingMaterials()
  const connectors = useMemo(() => buildConnectors(wing), [wing])
  useEffect(() => () => (isPool ? disposePools() : disposeLiving()), [isPool])
  const { x, y, z } = wing.origin

  return (
    <>
      <group position={[x, y, z]}>
        {isPool ? <PoolScene extra={wing.layout} lights={false} /> : <LivingScene extra={wing.layout} lights={false} />}
      </group>
      <group position={[0, wing.floor * FLOOR_H, 0]}>
        <BuiltMeshes geos={connectors} materials={mat} />
      </group>
    </>
  )
}

/**
 * Always mounted, so the shader light count never changes: 6 point lights that follow the nearest wing fixtures
 * (pool panels, living-room lamps, TV glow). Blackouts cut wing lights by the same 18m grid as the yellow panels.
 */
export function WingLights() {
  const lights = useMemo<PoolLight[]>(
    () =>
      [game.pool, game.living].flatMap((w) => (w ? w.lights.map((l) => ({ ...l, y: l.y + w.floor * FLOOR_H })) : [])),
    // Rebuilt per world (seed); the component is keyed by seed in WorldScene.
    [],
  )
  const clock = useThree((s) => s.clock)
  // Runs once per frame. The yellow floor's LightPanels drive blackouts while mounted; deep inside a wing nothing else does.
  const scale = () => {
    const ui = getUi()
    if ((ui.zone === 'pool' || ui.zone === 'living') && !ui.mounted.includes(zoneOnFloor(ui.floor))) {
      updateBlackouts(clock.elapsedTime, zoneOf(game.player.x, game.player.z), ui.started)
    }
    return 1
  }
  const factor = (l: PoolLight, t: number) => zoneFactor(l.x, l.z, t)
  return (
    <LightPool lights={lights} count={6} color="#ffffff" intensity={5.2} distance={10} decay={1.6} scale={scale} factor={factor} />
  )
}

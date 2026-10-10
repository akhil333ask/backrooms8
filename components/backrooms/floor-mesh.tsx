'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { updateBlackouts, zoneFactor, zoneOf } from '@/lib/backrooms/blackouts'
import { CARPET_TEX, CEIL_H, CEIL_TEX, CELL, GRID, WALL_TEX_W } from '@/lib/backrooms/constants'
import { game, getUi } from '@/lib/backrooms/store'
import { BoxBatch, QuadBatch, worldBox } from '@/lib/backrooms/geometry'
import { lightRuntime, panelLevel } from '@/lib/backrooms/lights'
import { getMaterials } from '@/lib/backrooms/materials'
import type { MatKey } from '@/lib/backrooms/props'
import { CellType, type FloorData } from '@/lib/backrooms/world-generator'

interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

function buildParts(floor: FloorData): Part[] {
  const mats = getMaterials()
  const parts: Part[] = []
  const push = (g: THREE.BufferGeometry | null, material: THREE.Material) => {
    if (g) parts.push({ geometry: g, material })
  }

  for (const zone of [0, 1] as const) {
    const walls = new BoxBatch(WALL_TEX_W, CEIL_H)
    floor.walls.filter((w) => w.zone === zone).forEach((w) => walls.add(w.spec))
    push(walls.build(), mats.wall[zone])

    const bb = new BoxBatch()
    floor.baseboards.filter((w) => w.zone === zone).forEach((w) => bb.add(w.spec))
    push(bb.build(), mats.baseboard[zone])

    const carpet = new QuadBatch(CARPET_TEX)
    const ceil = new QuadBatch(CEIL_TEX, true)
    for (let cz = 0; cz < GRID; cz++)
      for (let cx = 0; cx < GRID; cx++) {
        const i = cz * GRID + cx
        if (floor.cells[i] === CellType.Solid || floor.zones[i] !== zone) continue
        carpet.add(cx * CELL, cz * CELL, (cx + 1) * CELL, (cz + 1) * CELL, 0)
        ceil.add(cx * CELL, cz * CELL, (cx + 1) * CELL, (cz + 1) * CELL, CEIL_H)
      }
    push(carpet.build(), mats.carpet[zone])
    push(ceil.build(), mats.ceiling[zone])

    const tiles = new BoxBatch(CEIL_TEX, CEIL_TEX)
    floor.hangingTiles.filter((t) => t.zone === zone).forEach((t) => tiles.add(t.spec))
    push(tiles.build(), mats.ceiling[zone])
  }

  const byMat = new Map<MatKey, BoxBatch>()
  for (const box of [...floor.props, ...floor.details]) {
    if (!byMat.has(box.m)) byMat.set(box.m, new BoxBatch())
    byMat.get(box.m)!.add(box)
  }
  byMat.forEach((batch, key) => push(batch.build(), mats.props[key]))
  return parts
}

function Pillars({ floor }: { floor: FloorData }) {
  const mats = getMaterials()
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const data = useMemo(() => {
    const geo = worldBox(0.9, CEIL_H, 0.9, WALL_TEX_W, CEIL_H)
    const base = new THREE.BoxGeometry(0.96, 0.12, 0.96)
    const byZone = [0, 1].map((z) => floor.pillars.filter((p) => p.zone === z))
    return { geo, base, byZone }
  }, [floor])

  useEffect(() => {
    const m = new THREE.Matrix4()
    data.byZone.forEach((list, z) => {
      const body = refs.current[z * 2]
      const base = refs.current[z * 2 + 1]
      list.forEach((p, i) => {
        body?.setMatrixAt(i, m.makeTranslation(p.x, CEIL_H / 2, p.z))
        base?.setMatrixAt(i, m.makeTranslation(p.x, 0.06, p.z))
      })
      if (body) body.instanceMatrix.needsUpdate = true
      if (base) base.instanceMatrix.needsUpdate = true
    })
    return () => {
      data.geo.dispose()
      data.base.dispose()
    }
  }, [data])

  return (
    <>
      {data.byZone.map((list, z) =>
        list.length ? (
          <group key={z}>
            <instancedMesh
              ref={(r) => {
                refs.current[z * 2] = r
              }}
              args={[data.geo, mats.wall[z], list.length]}
            />
            <instancedMesh
              ref={(r) => {
                refs.current[z * 2 + 1] = r
              }}
              args={[data.base, mats.baseboard[z], list.length]}
            />
          </group>
        ) : null,
      )}
    </>
  )
}

/** Only the `active` floor (the one the player is on) drives the shared light rig and blackouts. */
function LightPanels({ floor, yOffset, active }: { floor: FloorData; yOffset: number; active: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mats = getMaterials()
  const geo = useMemo(() => new THREE.BoxGeometry(1.2, 0.03, 0.6), [])
  const color = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2)
    floor.lights.forEach((l, i) => {
      m.makeTranslation(l.x, CEIL_H - 0.012, l.z)
      if (l.rotated) m.multiply(rot)
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, color.setScalar(1))
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [floor, geo, color])

  useEffect(() => () => geo.dispose(), [geo])

  useEffect(() => {
    if (!active) return
    lightRuntime.panels = floor.lights
    lightRuntime.levels = new Float32Array(floor.lights.length)
    lightRuntime.yOffset = yOffset
    return () => {
      if (lightRuntime.panels !== floor.lights) return
      lightRuntime.panels = []
      lightRuntime.levels = new Float32Array(0)
    }
  }, [floor, yOffset, active])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh || !mesh.instanceColor) return
    const t = clock.elapsedTime
    if (active) updateBlackouts(t, zoneOf(game.player.x, game.player.z), getUi().started)
    const levels = active && lightRuntime.panels === floor.lights ? lightRuntime.levels : null
    floor.lights.forEach((l, i) => {
      const lv = panelLevel(l, t) * zoneFactor(l.x, l.z, t)
      if (levels) levels[i] = lv
      mesh.setColorAt(i, color.setScalar(l.state === 2 || lv === 0 ? 0.16 : 0.25 + lv * 0.75))
    })
    mesh.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mats.panel, floor.lights.length]} frustumCulled={false} />
}

export function FloorMesh({ floor, yOffset, active = true }: { floor: FloorData; yOffset: number; active?: boolean }) {
  const parts = useMemo(() => buildParts(floor), [floor])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])

  return (
    <group position={[0, yOffset, 0]}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} />
      ))}
      <Pillars floor={floor} />
      <LightPanels floor={floor} yOffset={yOffset} active={active} />
    </group>
  )
}

'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { audio } from '@/lib/backrooms/audio'
import { CEIL_H, EYE } from '@/lib/backrooms/constants'
import { lightRuntime } from '@/lib/backrooms/lights'
import { buildStairwell } from '@/lib/backrooms/stairs'
import { floorOf, game } from '@/lib/backrooms/store'
import { ZONES, zoneOnFloor } from '@/lib/world/zones'

const N = 8
const HUM_RANGE = 7

/**
 * A handful of point lights that follow the nearest working ceiling panels.
 * The light count never changes so shaders are compiled once.
 */
export function LightRig() {
  const refs = useRef<(THREE.PointLight | null)[]>([])
  const stairLights = useMemo(() => buildStairwell().lights, [])
  const scratch = useMemo(() => ({ d: new Float64Array(N), i: new Int32Array(N) }), [])
  const frame = useRef(0)

  const style = ZONES['yellow-1'].env.lightStyle

  useFrame(() => {
    const p = game.player
    const floor = floorOf(p.feet)
    const intensity = ZONES[zoneOnFloor(Math.max(1, floor))].env.lightStyle.intensity
    const ey = p.feet + EYE
    const { panels, levels, yOffset } = lightRuntime
    const { d, i: idx } = scratch
    d.fill(Infinity)
    idx.fill(-1)

    const insert = (dist: number, id: number) => {
      if (dist >= d[N - 1]) return
      let k = N - 1
      while (k > 0 && d[k - 1] > dist) {
        d[k] = d[k - 1]
        idx[k] = idx[k - 1]
        k--
      }
      d[k] = dist
      idx[k] = id
    }

    // Hung well below the tiles so the ceiling gets an even wash, not hotspots.
    const py = yOffset + CEIL_H - 0.85
    for (let i = 0; i < panels.length; i++) {
      const l = panels[i]
      if (l.state === 2) continue
      const dx = l.x - p.x
      const dz = l.z - p.z
      const dy = py - ey
      insert(dx * dx + dy * dy + dz * dz, i)
    }
    if (p.x < 2)
      for (let j = 0; j < stairLights.length; j++) {
        const s = stairLights[j]
        insert((s.x - p.x) ** 2 + (s.y - 0.3 - ey) ** 2 + (s.z - p.z) ** 2, -2 - j)
      }

    let hum = 0
    let flicker = 0
    for (let k = 0; k < N; k++) {
      const light = refs.current[k]
      if (!light) continue
      const id = idx[k]
      if (id === -1) {
        light.intensity = 0
        continue
      }
      let level = 1
      if (id >= 0) {
        const l = panels[id]
        level = levels[id] ?? l.dim
        light.position.set(l.x, py, l.z)
        const dist = Math.sqrt(d[k])
        const near = Math.max(0, 1 - dist / HUM_RANGE)
        hum += level * near
        if (l.state === 1) flicker += Math.max(0, 1 - level / Math.max(0.01, l.dim)) * near
      } else {
        const s = stairLights[-2 - id]
        light.position.set(s.x, s.y - 0.3, s.z)
        level = 0.8
      }
      light.intensity = intensity * level
    }

    if (++frame.current % 4 === 0) audio.setHum(Math.min(1, hum * 0.7), Math.min(1, flicker * 2))
  })

  return (
    <>
      {Array.from({ length: N }, (_, k) => (
        <pointLight
          key={k}
          ref={(r) => {
            refs.current[k] = r
          }}
          color={style.color}
          intensity={0}
          distance={13}
          decay={1.5}
        />
      ))}
    </>
  )
}

'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { game } from '@/lib/backrooms/store'

export interface PoolLight {
  x: number
  y: number
  z: number
  /** 0 steady, otherwise how often it stutters (0-1). */
  flicker?: number
  phase?: number
  /** Per-fixture brightness multiplier. */
  power?: number
  /** Per-fixture colour / range (one pool can serve several kinds of fixture). */
  color?: THREE.Color
  distance?: number
}

/**
 * A fixed handful of point lights that follow the fixtures nearest the player.
 * Keeps the shader light count constant no matter how many fixtures a level has.
 */
export function LightPool({
  lights,
  count = 6,
  color,
  intensity,
  distance,
  decay = 1.6,
  scale,
  factor,
}: {
  /** Per-fixture, per-frame multiplier (e.g. blackouts). */
  factor?: (l: PoolLight, t: number) => number
  lights: PoolLight[]
  count?: number
  color: string
  intensity: number
  distance: number
  decay?: number
  /** Per-frame multiplier (zone blending fades a zone's lights in/out). */
  scale?: () => number
}) {
  const refs = useRef<(THREE.PointLight | null)[]>([])
  const assigned = useRef<(PoolLight | null)[]>([])
  const timer = useRef(0)

  useFrame(({ clock }, dt) => {
    timer.current -= dt
    const p = game.player
    if (timer.current <= 0) {
      timer.current = 0.25
      const sorted = [...lights]
        .map((l) => ({ l, d: (l.x - p.x) ** 2 + (l.z - p.z) ** 2 + (l.y - p.feet - 1.5) ** 2 }))
        .sort((a, b) => a.d - b.d)
      for (let i = 0; i < count; i++) assigned.current[i] = sorted[i]?.l ?? null
    }
    const t = clock.elapsedTime
    const gain = scale ? scale() : 1
    for (let i = 0; i < count; i++) {
      const light = refs.current[i]
      const fx = assigned.current[i]
      if (!light) continue
      if (!fx) {
        light.intensity = 0
        continue
      }
      light.position.set(fx.x, fx.y, fx.z)
      if (fx.color) light.color.copy(fx.color)
      if (fx.distance) light.distance = fx.distance
      let k = (fx.power ?? 1) * (factor ? factor(fx, t) : 1)
      if (fx.flicker) {
        const n = Math.sin(t * 23 + (fx.phase ?? 0) * 7) * Math.sin(t * 3.1 + (fx.phase ?? 0))
        if (n > 1 - fx.flicker) k *= 0.08
      }
      light.intensity = intensity * k * gain
    }
  })

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          color={color}
          intensity={0}
          distance={distance}
          decay={decay}
        />
      ))}
    </>
  )
}

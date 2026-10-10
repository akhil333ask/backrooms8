'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FLOOR_H } from '@/lib/backrooms/constants'
import { game } from '@/lib/backrooms/store'

/** HDR color so the outline just crosses the bloom threshold and glows softly. */
const GLOW = new THREE.Color(1.7, 1.5, 1.0)

/** Outline + floating marker on the hide spot the player is aiming at (2 draw calls, only when visible). */
export function HideSpotHighlight() {
  const group = useRef<THREE.Group>(null)
  const box = useRef<THREE.LineSegments>(null)
  const icon = useRef<THREE.Mesh>(null)
  const res = useMemo(() => {
    const cube = new THREE.BoxGeometry(1, 1, 1)
    const edges = new THREE.EdgesGeometry(cube)
    cube.dispose()
    return {
      edges,
      lineMat: new THREE.LineBasicMaterial({ color: GLOW, transparent: true, opacity: 0.5, toneMapped: false, fog: false }),
      iconGeo: new THREE.OctahedronGeometry(0.06),
      iconMat: new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.85, toneMapped: false, fog: false }),
    }
  }, [])

  useEffect(
    () => () => {
      res.edges.dispose()
      res.lineMat.dispose()
      res.iconGeo.dispose()
      res.iconMat.dispose()
    },
    [res],
  )

  useFrame(({ clock }) => {
    const g = group.current
    if (!g || !box.current || !icon.current) return
    const spot = game.highlight
    g.visible = !!spot
    if (!spot) return
    const t = clock.elapsedTime
    const base = spot.floor * FLOOR_H
    const b = spot.bounds
    box.current.position.set((b.minX + b.maxX) / 2, base + (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2)
    box.current.scale.set(b.maxX - b.minX + 0.05, b.maxY - b.minY + 0.03, b.maxZ - b.minZ + 0.05)
    res.lineMat.opacity = 0.3 + 0.2 * Math.sin(t * 4)
    icon.current.position.set(spot.position.x, base + spot.position.y + 0.35 + Math.sin(t * 2.5) * 0.03, spot.position.z)
    icon.current.rotation.y = t * 1.5
  })

  return (
    <group ref={group} visible={false}>
      <lineSegments ref={box} geometry={res.edges} material={res.lineMat} />
      <mesh ref={icon} geometry={res.iconGeo} material={res.iconMat} />
    </group>
  )
}

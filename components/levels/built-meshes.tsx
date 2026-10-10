'use client'

import { useEffect } from 'react'
import type * as THREE from 'three'

/** Renders the merged geometry buckets from a MeshBuilder, one mesh per material key. */
export function BuiltMeshes({
  geos,
  materials,
}: {
  geos: Map<string, THREE.BufferGeometry>
  materials: Record<string, THREE.Material>
}) {
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  return (
    <>
      {[...geos.entries()].map(([key, geo]) =>
        materials[key] ? <mesh key={key} geometry={geo} material={materials[key]} /> : null,
      )}
    </>
  )
}

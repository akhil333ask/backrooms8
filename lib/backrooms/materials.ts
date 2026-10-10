import * as THREE from 'three'
import { MAT_COLORS, type MatKey } from './props'
import { getTextures } from './textures'

export interface MaterialSet {
  wall: [THREE.Material, THREE.Material]
  baseboard: [THREE.Material, THREE.Material]
  carpet: [THREE.Material, THREE.Material]
  ceiling: [THREE.Material, THREE.Material]
  props: Record<MatKey, THREE.Material>
  panel: THREE.MeshBasicMaterial
  metalTex: THREE.Material
  concrete: THREE.Material
  paintedConcrete: THREE.Material
  rail: THREE.Material
  fireDoor: THREE.Material
  exit: THREE.Material
}

let cache: MaterialSet | null = null

export function getMaterials(): MaterialSet {
  if (cache) return cache
  const t = getTextures()
  const pbr = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ metalness: 0, ...opts })
  const lambert = (opts: THREE.MeshStandardMaterialParameters) => pbr({ roughness: 0.8, ...opts })
  const props = {} as Record<MatKey, THREE.Material>
  for (const key of Object.keys(MAT_COLORS) as MatKey[]) {
    props[key] =
      key === 'led'
        ? new THREE.MeshBasicMaterial({ color: MAT_COLORS.led, toneMapped: false })
        : lambert({ color: MAT_COLORS[key], roughness: 0.6 })
  }
  cache = {
    // Satin-finish wallpaper catches soft highlights from the panels above.
    wall: [pbr({ map: t.wallA, roughness: 0.62 }), pbr({ map: t.wallB, roughness: 0.66 })],
    baseboard: [pbr({ color: '#c6bb6e', roughness: 0.45 }), pbr({ color: '#b8a878', roughness: 0.45 })],
    carpet: [pbr({ map: t.carpetA, roughness: 0.93 }), pbr({ map: t.carpetB, roughness: 0.95 })],
    ceiling: [pbr({ map: t.ceilA, roughness: 0.9 }), pbr({ map: t.ceilB, roughness: 0.9 })],
    props,
    // HDR white (>1) so only the panels cross the bloom threshold.
    panel: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.7), toneMapped: false }),
    metalTex: lambert({ map: t.metal }),
    concrete: lambert({ map: t.concrete }),
    paintedConcrete: lambert({ map: t.concrete, color: '#d8d3b4' }),
    rail: lambert({ color: '#9c3a2a' }),
    fireDoor: lambert({ color: '#8a3b2c' }),
    exit: new THREE.MeshBasicMaterial({ map: t.exit, toneMapped: false }),
  }
  return cache
}

export function disposeMaterials() {
  if (!cache) return
  const { props, wall, baseboard, carpet, ceiling, ...rest } = cache
  for (const m of [...Object.values(props), ...wall, ...baseboard, ...carpet, ...ceiling, ...Object.values(rest)]) m.dispose()
  cache = null
}

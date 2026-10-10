import * as THREE from 'three'

function disposeDeep(value: unknown) {
  if (!value || typeof value !== 'object') return
  if (value instanceof THREE.Texture || value instanceof THREE.Material || value instanceof THREE.BufferGeometry) {
    value.dispose()
    return
  }
  for (const v of Object.values(value)) disposeDeep(v)
}

/**
 * Lazily-created GPU resources (textures + materials) owned by one level.
 * `dispose` frees everything so switching levels doesn't leak VRAM.
 */
export function lazyResources<T extends object>(create: () => T) {
  let res: T | null = null
  return {
    get: () => (res ??= create()),
    dispose() {
      if (!res) return
      disposeDeep(res)
      res = null
    },
  }
}

export const std = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(opts)

/** Glowing material for light fixtures, screens and lamp shades (crosses the bloom threshold). */
export const glow = (color: string, strength: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: strength, roughness: 1, ...opts })

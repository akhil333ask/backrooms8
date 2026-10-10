export interface AABB {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export const aabb = (minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 3): AABB => ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
})

export const fromCenter = (x: number, z: number, w: number, d: number, minY = 0, maxY = 3): AABB =>
  aabb(x - w / 2, x + w / 2, z - d / 2, z + d / 2, minY, maxY)

export interface BoxSource {
  boxes: AABB[]
  yOffset: number
}

const EPS = 0.001

/**
 * Moves a vertical capsule (approximated as a square column) and resolves
 * overlaps one axis at a time so the player slides along walls.
 */
export function moveWithCollision(
  pos: { x: number; z: number },
  feet: number,
  height: number,
  r: number,
  dx: number,
  dz: number,
  sources: BoxSource[],
) {
  const top = feet + height
  pos.x += dx
  for (const src of sources) {
    for (const b of src.boxes) {
      if (top <= b.minY + src.yOffset || feet + 0.25 >= b.maxY + src.yOffset) continue
      if (pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX) continue
      if (dx > 0) pos.x = b.minX - r - EPS
      else if (dx < 0) pos.x = b.maxX + r + EPS
    }
  }
  pos.z += dz
  for (const src of sources) {
    for (const b of src.boxes) {
      if (top <= b.minY + src.yOffset || feet + 0.25 >= b.maxY + src.yOffset) continue
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX) continue
      if (pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue
      if (dz > 0) pos.z = b.minZ - r - EPS
      else if (dz < 0) pos.z = b.maxZ + r + EPS
    }
  }
}

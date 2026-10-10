import * as THREE from 'three'

interface Bucket {
  pos: number[]
  nor: number[]
  uv: number[]
}

const tmpM = new THREE.Matrix4()

/**
 * Collects primitives into one merged geometry per material key, so an entire
 * level renders in a handful of draw calls. UVs are scaled to world meters so
 * tiling textures keep a constant density on any size of box.
 */
export class MeshBuilder {
  private buckets = new Map<string, Bucket>()

  private bucket(key: string) {
    let b = this.buckets.get(key)
    if (!b) {
      b = { pos: [], nor: [], uv: [] }
      this.buckets.set(key, b)
    }
    return b
  }

  add(key: string, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (matrix) g.applyMatrix4(matrix)
    const b = this.bucket(key)
    const p = g.attributes.position
    const n = g.attributes.normal
    const u = g.attributes.uv
    for (let i = 0; i < p.count; i++) {
      b.pos.push(p.getX(i), p.getY(i), p.getZ(i))
      b.nor.push(n.getX(i), n.getY(i), n.getZ(i))
      if (u) b.uv.push(u.getX(i), u.getY(i))
      else b.uv.push(0, 0)
    }
    g.dispose()
  }

  /** Axis-aligned box from min/max corners. `tex` = meters per texture repeat. */
  box(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex = 1) {
    const w = x1 - x0
    const h = y1 - y0
    const d = z1 - z0
    if (w <= 0.0001 || h <= 0.0001 || d <= 0.0001) return
    const g = new THREE.BoxGeometry(w, h, d)
    const uv = g.attributes.uv
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
    const dims = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ]
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / tex, (uv.getY(i) * dims[f][1]) / tex)
      }
    }
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    this.add(key, g)
    g.dispose()
  }

  /** Box from center + size. */
  boxC(key: string, x: number, y: number, z: number, w: number, h: number, d: number, tex = 1) {
    this.box(key, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, tex)
  }

  /** Box from center + size, rotated by Euler angles (XYZ order). Used for ramps, open doors and lids. */
  boxR(key: string, x: number, y: number, z: number, w: number, h: number, d: number, rx: number, ry: number, rz = 0, tex = 1) {
    const g = new THREE.BoxGeometry(w, h, d)
    const uv = g.attributes.uv
    const dims = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ]
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / tex, (uv.getY(i) * dims[f][1]) / tex)
      }
    }
    tmpM.makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z)
    this.add(key, g, tmpM)
    g.dispose()
  }

  /** Cylinder centered at (x,y,z) aligned to an axis. */
  cyl(key: string, x: number, y: number, z: number, r: number, len: number, axis: 'x' | 'y' | 'z' = 'y', seg = 10, tex = 1) {
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / tex, (uv.getY(i) * len) / tex)
    if (axis === 'x') g.rotateZ(Math.PI / 2)
    if (axis === 'z') g.rotateX(Math.PI / 2)
    g.translate(x, y, z)
    this.add(key, g)
    g.dispose()
  }

  /** Horizontal quad facing up (y-normal) with optional atlas UV rect [u0,v0,u1,v1]. */
  floorQuad(key: string, x: number, y: number, z: number, w: number, d: number, rotY = 0, uvRect?: [number, number, number, number]) {
    const g = new THREE.PlaneGeometry(w, d)
    if (uvRect) {
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uvRect[0] + uv.getX(i) * (uvRect[2] - uvRect[0]), uvRect[1] + uv.getY(i) * (uvRect[3] - uvRect[1]))
      }
    }
    g.rotateX(-Math.PI / 2)
    tmpM.makeRotationY(rotY).setPosition(x, y, z)
    this.add(key, g, tmpM)
    g.dispose()
  }

  /** Vertical quad facing along +normal axis direction. */
  wallQuad(key: string, x: number, y: number, z: number, w: number, h: number, rotY: number, uvRect?: [number, number, number, number]) {
    const g = new THREE.PlaneGeometry(w, h)
    if (uvRect) {
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uvRect[0] + uv.getX(i) * (uvRect[2] - uvRect[0]), uvRect[1] + uv.getY(i) * (uvRect[3] - uvRect[1]))
      }
    }
    tmpM.makeRotationY(rotY).setPosition(x, y, z)
    this.add(key, g, tmpM)
    g.dispose()
  }

  build(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>()
    for (const [key, b] of this.buckets) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
      g.computeBoundingSphere()
      out.set(key, g)
    }
    return out
  }
}

export interface Opening {
  /** Center along the wall's run axis. */
  at: number
  width: number
  height: number
}

/**
 * Emits a straight wall with rectangular openings (doors / archways),
 * returning the solid segments so callers can reuse them as colliders.
 */
export function wallWithOpenings(
  axis: 'x' | 'z',
  fixed: number,
  from: number,
  to: number,
  openings: Opening[],
  thickness: number,
  height: number,
  y0 = 0,
): { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[] {
  const out: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[] = []
  const sorted = [...openings].sort((a, b) => a.at - b.at)
  const push = (a: number, b: number, ya: number, yb: number) => {
    if (b - a < 0.01 || yb - ya < 0.01) return
    if (axis === 'x') out.push({ x0: a, x1: b, z0: fixed - thickness / 2, z1: fixed + thickness / 2, y0: ya, y1: yb })
    else out.push({ x0: fixed - thickness / 2, x1: fixed + thickness / 2, z0: a, z1: b, y0: ya, y1: yb })
  }
  let cursor = from
  for (const o of sorted) {
    const a = o.at - o.width / 2
    const b = o.at + o.width / 2
    push(cursor, a, y0, y0 + height)
    push(a, b, y0 + o.height, y0 + height)
    cursor = b
  }
  push(cursor, to, y0, y0 + height)
  return out
}

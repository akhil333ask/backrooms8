import * as THREE from 'three'

export interface BoxSpec {
  p: [number, number, number]
  s: [number, number, number]
  /** Optional Euler rotation (radians, XYZ). */
  r?: [number, number, number]
}

/**
 * Builds a box whose UVs are scaled to world meters so tiled textures
 * keep a constant density regardless of box size.
 * BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each).
 */
export function worldBox(w: number, h: number, d: number, texW = 1, texH = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  const scales: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    const [su, sv] = scales[f]
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, (uv.getX(i) * su) / texW, (uv.getY(i) * sv) / texH)
    }
  }
  return g
}

/** Accumulates many boxes into one merged geometry (one draw call per material). */
export class BoxBatch {
  private positions: number[] = []
  private normals: number[] = []
  private uvs: number[] = []
  private indices: number[] = []
  private vertexCount = 0
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private v = new THREE.Vector3()
  private one = new THREE.Vector3(1, 1, 1)
  private nm = new THREE.Matrix3()

  constructor(
    private texW = 1,
    private texH = 1,
  ) {}

  add(spec: BoxSpec, uvOffset = 0) {
    const [w, h, d] = spec.s
    const g = worldBox(w, h, d, this.texW, this.texH)
    this.e.set(...(spec.r ?? [0, 0, 0]))
    this.q.setFromEuler(this.e)
    this.m.compose(this.v.set(...spec.p), this.q, this.one)
    g.applyMatrix4(this.m)
    const pos = g.attributes.position.array
    const nor = g.attributes.normal.array
    const uv = g.attributes.uv.array
    for (let i = 0; i < pos.length; i++) this.positions.push(pos[i])
    for (let i = 0; i < nor.length; i++) this.normals.push(nor[i])
    for (let i = 0; i < uv.length; i += 2) this.uvs.push(uv[i] + uvOffset, uv[i + 1])
    const idx = g.index!.array
    for (let i = 0; i < idx.length; i++) this.indices.push(idx[i] + this.vertexCount)
    this.vertexCount += pos.length / 3
    g.dispose()
    void this.nm
  }

  get empty() {
    return this.vertexCount === 0
  }

  build(): THREE.BufferGeometry | null {
    if (this.empty) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    g.setIndex(this.indices)
    g.computeBoundingSphere()
    return g
  }
}

/** Horizontal quads (floors/ceilings) with world-space UVs. */
export class QuadBatch {
  private positions: number[] = []
  private normals: number[] = []
  private uvs: number[] = []
  private indices: number[] = []
  private n = 0

  constructor(
    private tex: number,
    private facingDown = false,
  ) {}

  add(x0: number, z0: number, x1: number, z1: number, y: number) {
    const ny = this.facingDown ? -1 : 1
    const corners = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ]
    for (const [x, z] of corners) {
      this.positions.push(x, y, z)
      this.normals.push(0, ny, 0)
      this.uvs.push(x / this.tex, z / this.tex)
    }
    const b = this.n
    if (this.facingDown) this.indices.push(b, b + 1, b + 2, b, b + 2, b + 3)
    else this.indices.push(b, b + 2, b + 1, b, b + 3, b + 2)
    this.n += 4
  }

  build(): THREE.BufferGeometry | null {
    if (this.n === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    g.setIndex(this.indices)
    g.computeBoundingSphere()
    return g
  }
}

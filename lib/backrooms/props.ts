import type { BoxSpec } from './geometry'
import type { Rng } from './rng'

export type MatKey =
  | 'wood'
  | 'metal'
  | 'darkMetal'
  | 'fabric'
  | 'plastic'
  | 'cardboard'
  | 'porcelain'
  | 'rack'
  | 'led'
  | 'door'
  | 'red'
  | 'white'
  | 'vent'
  | 'tape'
  | 'locker'
  | 'black'
  | 'mirror'
  | 'bottle'

export const MAT_COLORS: Record<MatKey, string> = {
  wood: '#a08a68',
  metal: '#9a9b93',
  darkMetal: '#45463f',
  fabric: '#6b7072',
  plastic: '#c7bfa7',
  cardboard: '#a3825a',
  porcelain: '#e3e0d6',
  rack: '#1d1e20',
  led: '#5cff7a',
  door: '#b5a985',
  red: '#a8231b',
  white: '#e6e2d2',
  vent: '#8c8b82',
  tape: '#c9ab33',
  locker: '#7a8792',
  black: '#121212',
  mirror: '#8d989c',
  bottle: '#86b4cf',
}

export interface MatBox extends BoxSpec {
  m: MatKey
}

/** A prop is authored facing +z (its "front"), centered on its footprint. */
export interface Prop {
  boxes: MatBox[]
  w: number
  d: number
  h: number
}

const b = (m: MatKey, p: [number, number, number], s: [number, number, number]): MatBox => ({ m, p, s })

export function desk(): Prop {
  return {
    w: 1.4,
    d: 0.7,
    h: 0.76,
    boxes: [
      b('wood', [0, 0.735, 0], [1.4, 0.03, 0.7]),
      b('metal', [-0.66, 0.36, 0.31], [0.04, 0.72, 0.04]),
      b('metal', [-0.66, 0.36, -0.31], [0.04, 0.72, 0.04]),
      b('wood', [0, 0.45, -0.32], [1.3, 0.5, 0.02]),
      b('metal', [0.45, 0.36, 0], [0.42, 0.7, 0.62]),
      b('darkMetal', [0.45, 0.6, 0.312], [0.14, 0.02, 0.01]),
      b('darkMetal', [0.45, 0.3, 0.312], [0.14, 0.02, 0.01]),
    ],
  }
}

export function chair(): Prop {
  return {
    w: 0.5,
    d: 0.5,
    h: 1.05,
    boxes: [
      b('fabric', [0, 0.47, 0], [0.46, 0.07, 0.46]),
      b('fabric', [0, 0.8, -0.21], [0.44, 0.5, 0.06]),
      b('darkMetal', [0, 0.25, 0], [0.05, 0.4, 0.05]),
      b('darkMetal', [0, 0.03, 0], [0.52, 0.04, 0.07]),
      b('darkMetal', [0, 0.03, 0], [0.07, 0.04, 0.52]),
    ],
  }
}

export function workstation(): Prop {
  const d = desk().boxes.map((x) => ({ ...x, p: [x.p[0], x.p[1], x.p[2] - 0.3] as [number, number, number] }))
  const c = chair().boxes.map((x) => ({
    ...x,
    p: [x.p[0] - 0.15, x.p[1], -x.p[2] + 0.4] as [number, number, number],
  }))
  return {
    w: 1.6,
    d: 1.3,
    h: 1.35,
    boxes: [
      ...d,
      ...c,
      b('fabric', [0.77, 0.67, 0], [0.06, 1.34, 1.3]),
      b('metal', [0.77, 1.35, 0], [0.08, 0.03, 1.3]),
    ],
  }
}

export function cubicleWall(len: number): Prop {
  return {
    w: len,
    d: 0.08,
    h: 1.35,
    boxes: [b('fabric', [0, 0.67, 0], [len, 1.34, 0.06]), b('metal', [0, 1.35, 0], [len, 0.03, 0.08])],
  }
}

export function filingCabinet(): Prop {
  const boxes: MatBox[] = [b('metal', [0, 0.66, 0], [0.46, 1.32, 0.62])]
  for (const y of [0.3, 0.62, 0.94, 1.24]) {
    boxes.push(b('darkMetal', [0, y, 0.315], [0.16, 0.03, 0.02]))
    boxes.push(b('darkMetal', [0, y + 0.15, 0.311], [0.44, 0.008, 0.01]))
  }
  return { w: 0.46, d: 0.62, h: 1.32, boxes }
}

export function lockers(n = 4): Prop {
  const boxes: MatBox[] = []
  const lw = 0.38
  const total = lw * n
  for (let i = 0; i < n; i++) {
    const x = -total / 2 + lw / 2 + i * lw
    boxes.push(b('locker', [x, 0.95, 0], [lw - 0.01, 1.9, 0.5]))
    boxes.push(b('darkMetal', [x + 0.12, 1.0, 0.255], [0.03, 0.14, 0.02]))
    for (const y of [1.6, 1.68, 1.76, 0.25, 0.33]) boxes.push(b('black', [x, y, 0.252], [0.22, 0.02, 0.01]))
  }
  return { w: total, d: 0.5, h: 1.9, boxes }
}

export function shelf(rng: Rng): Prop {
  const boxes: MatBox[] = []
  for (const x of [-0.58, 0.58]) for (const z of [-0.23, 0.23]) boxes.push(b('metal', [x, 1, z], [0.04, 2, 0.04]))
  for (const y of [0.1, 0.6, 1.1, 1.6]) {
    boxes.push(b('metal', [0, y, 0], [1.2, 0.03, 0.5]))
    let x = -0.55
    while (x < 0.45) {
      const w = 0.2 + rng() * 0.25
      if (rng() < 0.65) {
        const h = 0.15 + rng() * 0.25
        boxes.push(b('cardboard', [x + w / 2, y + 0.015 + h / 2, (rng() - 0.5) * 0.08], [w - 0.02, h, 0.35 + rng() * 0.1]))
      }
      x += w
    }
  }
  return { w: 1.2, d: 0.5, h: 2, boxes }
}

export function boxStack(rng: Rng): Prop {
  const boxes: MatBox[] = []
  let y = 0
  const n = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < n; i++) {
    const s = 0.5 - i * 0.06 + rng() * 0.05
    const h = 0.3 + rng() * 0.15
    boxes.push(b('cardboard', [(rng() - 0.5) * 0.06, y + h / 2, (rng() - 0.5) * 0.06], [s, h, s * 0.9]))
    boxes.push(b('tape', [0, y + h + 0.001, 0], [0.05, 0.003, s * 0.9]))
    y += h
  }
  return { w: 0.6, d: 0.6, h: y, boxes }
}

export function reception(): Prop {
  return {
    w: 2.5,
    d: 1.3,
    h: 1.14,
    boxes: [
      b('wood', [0, 0.55, 0.3], [2.4, 1.1, 0.6]),
      b('wood', [0, 1.12, 0.33], [2.5, 0.04, 0.72]),
      b('darkMetal', [0, 0.05, 0.62], [2.4, 0.1, 0.02]),
      b('wood', [0, 0.74, -0.3], [2.4, 0.03, 0.6]),
      b('metal', [-1.1, 0.37, -0.3], [0.04, 0.72, 0.5]),
      b('metal', [1.1, 0.37, -0.3], [0.04, 0.72, 0.5]),
    ],
  }
}

export function waterCooler(): Prop {
  return {
    w: 0.34,
    d: 0.34,
    h: 1.45,
    boxes: [
      b('white', [0, 0.5, 0], [0.32, 1.0, 0.32]),
      b('bottle', [0, 1.21, 0], [0.26, 0.42, 0.26]),
      b('black', [0, 0.82, 0.165], [0.06, 0.05, 0.03]),
      b('darkMetal', [0, 0.62, 0.165], [0.2, 0.02, 0.06]),
    ],
  }
}

export function trashBin(): Prop {
  return {
    w: 0.32,
    d: 0.32,
    h: 0.45,
    boxes: [b('darkMetal', [0, 0.21, 0], [0.3, 0.42, 0.3]), b('black', [0, 0.43, 0], [0.32, 0.03, 0.32])],
  }
}

export function toiletStalls(n: number): Prop {
  const sw = 0.95
  const depth = 1.5
  const total = sw * n
  const boxes: MatBox[] = []
  for (let i = 0; i <= n; i++) boxes.push(b('plastic', [-total / 2 + i * sw, 1.0, 0], [0.04, 1.8, depth]))
  for (let i = 0; i < n; i++) {
    const cx = -total / 2 + sw / 2 + i * sw
    boxes.push(b('plastic', [cx, 1.0, depth / 2], [sw - 0.05, 1.8, 0.04]))
    boxes.push(b('darkMetal', [cx + 0.3, 1.0, depth / 2 + 0.03], [0.04, 0.1, 0.03]))
    boxes.push(b('porcelain', [cx, 0.2, -0.35], [0.38, 0.4, 0.5]))
    boxes.push(b('porcelain', [cx, 0.55, -0.66], [0.42, 0.35, 0.16]))
  }
  boxes.push(b('metal', [0, 1.92, depth / 2], [total, 0.04, 0.05]))
  return { w: total + 0.04, d: depth + 0.04, h: 1.95, boxes }
}

export function sinkCounter(len: number): Prop {
  const boxes: MatBox[] = [
    b('plastic', [0, 0.41, 0], [len, 0.82, 0.5]),
    b('porcelain', [0, 0.85, 0.02], [len, 0.06, 0.56]),
    b('mirror', [0, 1.55, -0.27], [len - 0.1, 0.8, 0.02]),
  ]
  const n = Math.max(1, Math.floor(len / 0.9))
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len / n) * (i + 0.5)
    boxes.push(b('metal', [x, 0.882, 0.05], [0.42, 0.01, 0.32]))
    boxes.push(b('metal', [x, 0.95, -0.17], [0.04, 0.14, 0.04]))
  }
  return { w: len, d: 0.6, h: 2, boxes }
}

export function serverRack(rng: Rng): Prop {
  const boxes: MatBox[] = [b('rack', [0, 1.0, 0], [0.6, 2.0, 1.0])]
  for (let y = 0.2; y < 1.9; y += 0.09) {
    boxes.push(b('black', [0, y, 0.502], [0.54, 0.012, 0.01]))
    if (rng() < 0.55) boxes.push(b('led', [-0.22 + rng() * 0.12, y + 0.035, 0.506], [0.018, 0.012, 0.01]))
    if (rng() < 0.3) boxes.push(b('led', [0.2, y + 0.035, 0.506], [0.018, 0.012, 0.01]))
  }
  return { w: 0.6, d: 1.0, h: 2, boxes }
}

export function doorLeaf(): Prop {
  return {
    w: 0.95,
    d: 0.05,
    h: 2.1,
    boxes: [b('door', [0, 1.05, 0], [0.95, 2.1, 0.045]), b('metal', [0.38, 1.0, 0.04], [0.12, 0.03, 0.04])],
  }
}

/** Rotate prop boxes by quarter turns (q) around Y and move to (x, z). */
export function placeProp(prop: Prop, x: number, z: number, q: number, y = 0): MatBox[] {
  const qq = ((q % 4) + 4) % 4
  return prop.boxes.map((box) => {
    const [px, py, pz] = box.p
    const [sx, sy, sz] = box.s
    let nx = px
    let nz = pz
    if (qq === 1) {
      nx = pz
      nz = -px
    } else if (qq === 2) {
      nx = -px
      nz = -pz
    } else if (qq === 3) {
      nx = -pz
      nz = px
    }
    const odd = qq % 2 === 1
    return { m: box.m, p: [x + nx, y + py, z + nz], s: odd ? [sz, sy, sx] : [sx, sy, sz], r: box.r }
  })
}

export function footprint(prop: Prop, q: number): [number, number] {
  return q % 2 === 1 ? [prop.d, prop.w] : [prop.w, prop.d]
}

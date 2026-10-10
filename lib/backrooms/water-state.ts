import { useSyncExternalStore } from 'react'
import type { WaterKind } from '@/levels/types'

export interface WaterSnapshot {
  kind: WaterKind
  /** Head below the surface (counts as concealed for a future seeker). */
  submerged: boolean
  /** performance.now() when the head last left the water; drives the lens droplets. */
  surfacedAt: number
}

let snapshot: WaterSnapshot = { kind: 'dry', submerged: false, surfacedAt: 0 }
const listeners = new Set<() => void>()

export const getWater = () => snapshot

export function updateWater(kind: WaterKind, eyeY: number, surface: number) {
  const submerged = kind !== 'dry' && eyeY < surface - 0.04
  if (kind === snapshot.kind && submerged === snapshot.submerged) return
  const surfaced = (snapshot.submerged && !submerged) || (snapshot.kind === 'deep' && kind !== 'deep')
  snapshot = { kind, submerged, surfacedAt: surfaced ? performance.now() : snapshot.surfacedAt }
  listeners.forEach((l) => l())
}

export function resetWater() {
  snapshot = { kind: 'dry', submerged: false, surfacedAt: 0 }
  listeners.forEach((l) => l())
}

export function useWater<T>(selector: (s: WaterSnapshot) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => selector(snapshot),
    () => selector(snapshot),
  )
}

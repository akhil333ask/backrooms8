import type { AABB } from './collision'

export type HideSpotType = 'desk' | 'locker' | 'partition' | 'closet' | 'vent' | 'pillar'

/** How the view is masked while hidden (rendered by the HUD). */
export type HideView = 'under' | 'slats' | 'crack' | 'grate' | 'open'

export interface CameraPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

/**
 * A hide spot. All coordinates are floor-local (add floor * FLOOR_H for world Y).
 * This is plain serializable data so it can be synced between peers later.
 */
export interface HideSpot {
  id: string
  type: HideSpotType
  /** Overrides the type's default label (e.g. "under car" for a desk-style spot). */
  label?: string
  floor: number
  /** Interaction anchor the player aims at. */
  position: { x: number; y: number; z: number }
  /** Unit vector pointing from the spot toward the side you enter from. */
  entryDirection: { x: number; z: number }
  capacity: number
  /** 0 = fully visible, 1 = fully concealed. */
  concealment: number
  requiresCrouch: boolean
  cameraPose: CameraPose
  /** Max look offset from the pose while hidden (radians). */
  peek: { yaw: number; pitch: number }
  /** Where the player stands after leaving. */
  exitPoint: { x: number; z: number }
  /** Outline volume for the highlight. */
  bounds: AABB
}

export interface HideSpotInfo {
  label: string
  concealment: number
  requiresCrouch: boolean
  peek: { yaw: number; pitch: number }
  view: HideView
}

export const HIDE_SPOT_INFO: Record<HideSpotType, HideSpotInfo> = {
  desk: { label: 'under desk', concealment: 0.55, requiresCrouch: false, peek: { yaw: 0.9, pitch: 0.25 }, view: 'under' },
  locker: { label: 'locker', concealment: 0.85, requiresCrouch: false, peek: { yaw: 0.7, pitch: 0.35 }, view: 'slats' },
  partition: {
    label: 'behind partition',
    concealment: 0.45,
    requiresCrouch: true,
    peek: { yaw: 1.2, pitch: 0.4 },
    view: 'open',
  },
  closet: { label: 'supply closet', concealment: 0.95, requiresCrouch: false, peek: { yaw: 0.7, pitch: 0.35 }, view: 'crack' },
  vent: { label: 'ceiling vent', concealment: 0.9, requiresCrouch: false, peek: { yaw: Math.PI, pitch: 0.5 }, view: 'grate' },
  pillar: { label: 'behind pillar', concealment: 0.4, requiresCrouch: true, peek: { yaw: 1.3, pitch: 0.4 }, view: 'open' },
}

export function createHideSpot(
  init: Omit<HideSpot, 'capacity' | 'concealment' | 'requiresCrouch' | 'peek'> & Partial<HideSpot>,
): HideSpot {
  const info = HIDE_SPOT_INFO[init.type]
  return {
    capacity: 1,
    concealment: info.concealment,
    requiresCrouch: info.requiresCrouch,
    peek: info.peek,
    ...init,
  }
}

/** Occupancy is runtime state; kept separate from the deterministic spot data. */
const occupancy = new Map<string, number>()

export const occupantsOf = (spot: HideSpot) => occupancy.get(spot.id) ?? 0
export const canEnter = (spot: HideSpot) => occupantsOf(spot) < spot.capacity
export function occupy(spot: HideSpot) {
  occupancy.set(spot.id, occupantsOf(spot) + 1)
}
export function vacate(spot: HideSpot) {
  occupancy.set(spot.id, Math.max(0, occupantsOf(spot) - 1))
}
export function resetOccupancy() {
  occupancy.clear()
}

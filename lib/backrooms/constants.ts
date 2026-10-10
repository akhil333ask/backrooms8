export const CELL = 3
export const GRID = 18
export const SIZE = CELL * GRID
export const CEIL_H = 3
export const FLOOR_H = 3.4
/** World floors: index 0 = B1 (garage), 1..3 = yellow office floors. World y = index * FLOOR_H. */
export const FLOORS = 4
export const YELLOW_FLOORS = 3
export const FLOOR_LABELS = ['B1', '1', '2', '3'] as const
export const WALL_T = 0.2
export const EYE = 1.7
export const PLAYER_R = 0.3
export const DOOR_GAP = 1.3
export const DOOR_H = 2.15

/** Wallpaper texture covers this many meters horizontally (and CEIL_H vertically). */
export const WALL_TEX_W = 6
export const CARPET_TEX = 2
export const CEIL_TEX = 1.2

/**
 * Stairwell sits outside the building's west wall (x < 0), on the same row as
 * the elevator lobby so a straight corridor leads from the lobby to its door.
 */
export const STAIR = {
  x0: -6,
  x1: 0,
  mid: -3,
  z0: 24,
  landingEnd: 26,
  flightEnd: 30,
  z1: 32,
  flightRise: FLOOR_H / 2,
  doorZ0: 25,
  doorZ1: 26,
  doorCell: { cx: 0, cz: 8 },
} as const

/** Elevator lobby (cells) and shaft block, in building-local meters. */
export const LOBBY = { cx0: 7, cz0: 7, cx1: 10, cz1: 9 } as const
export const SHAFT = { cx0: 8, cz0: 10, cx1: 9, cz1: 10 } as const
export const ELEV = {
  x: 27,
  frontZ0: 29.9,
  frontZ1: 30.15,
  doorZ: 30.2,
  cabX0: 25.9,
  cabX1: 28.1,
  cabZ0: 30.25,
  cabZ1: 32.25,
  openHalf: 0.6,
  cabCeil: 2.65,
} as const

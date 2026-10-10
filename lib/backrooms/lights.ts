import type { LightPanel } from './world-generator'

/** Shared between the floor's panel mesh (writer) and the point-light rig (reader). */
export const lightRuntime = {
  panels: [] as LightPanel[],
  levels: new Float32Array(0),
  yOffset: 0,
}

export function panelLevel(l: LightPanel, t: number): number {
  if (l.state === 2) return 0
  if (l.state === 0) return l.dim
  const s = Math.sin(t * 1.3 + l.phase) + Math.sin(t * 2.9 + l.phase * 1.7)
  if (s > 1.1) return Math.random() < 0.55 ? 0.08 * l.dim : l.dim
  if (s > 0.9) return l.dim * (0.6 + Math.random() * 0.4)
  return l.dim
}

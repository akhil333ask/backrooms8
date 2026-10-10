'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { getUi } from '@/lib/backrooms/store'

/** Whole-frame totals (all postprocessing passes included). Read by ?debug=1 and window.__stats. */
export const renderStats = { calls: 0, triangles: 0, geometries: 0, textures: 0, maxCalls: 0 }

/**
 * Debug-only (?debug=1). renderer.info normally resets on every render() call, and the EffectComposer
 * renders several passes per frame, so autoReset is disabled and the totals are reset here once per frame.
 */
export function RenderStats() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const acc = useRef(0)

  useEffect(() => {
    gl.info.autoReset = false
    Object.assign(window, { __stats: renderStats, __scene: scene })
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])

  useFrame((_, dt) => {
    const { render, memory } = gl.info
    renderStats.calls = render.calls
    renderStats.triangles = render.triangles
    renderStats.geometries = memory.geometries
    renderStats.textures = memory.textures
    gl.info.reset()
    acc.current += dt
    if (acc.current < 2) return
    acc.current = 0
    renderStats.maxCalls = Math.max(renderStats.maxCalls, renderStats.calls)
    const { zone, mounted } = getUi()
    console.log(
      `[stats] zone=${zone} mounted=${mounted.join(',')} calls=${renderStats.calls} tris=${renderStats.triangles} geos=${renderStats.geometries} tex=${renderStats.textures}`,
    )
  })

  return null
}

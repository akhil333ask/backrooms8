'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { zoneFactor } from '@/lib/backrooms/blackouts'
import { game, useUi } from '@/lib/backrooms/store'
import { zoneEnv } from '@/lib/world/zone-manager'
import { ZONES } from '@/lib/world/zones'

export const FOOTAGE_FOV = 82
const NORMAL_FOV = 75

/** Fog, ambient fill and camera settings, blended between zones every frame by the zone manager. */
export function LevelEnvironment() {
  const footage = useUi((s) => s.footage)
  const isTouch = useUi((s) => s.isTouch)
  const initial = ZONES['yellow-1'].env
  const hemi = useRef<THREE.HemisphereLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const setDpr = useThree((s) => s.setDpr)
  const dim = useRef(1)

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = footage ? FOOTAGE_FOV : NORMAL_FOV
    cam.updateProjectionMatrix()
    const dpr = window.devicePixelRatio || 1
    // Lower pixel ratio gives a soft camcorder image and saves fill-rate on phones.
    setDpr(isTouch ? Math.min(1.25, Math.max(1, dpr)) : Math.min(1.5, Math.max(1, dpr)))
  }, [camera, setDpr, footage, isTouch])

  useFrame(({ clock }, dt) => {
    const e = zoneEnv
    const f = Math.min(1, zoneFactor(game.player.x, game.player.z, clock.elapsedTime))
    dim.current += (f - dim.current) * Math.min(1, dt * 14)
    const keep = e.blackoutAmbient
    const k = keep + (1 - keep) * dim.current
    if (hemi.current) {
      hemi.current.intensity = e.hemi * k
      hemi.current.color.copy(e.sky)
      hemi.current.groundColor.copy(e.ground)
    }
    if (amb.current) {
      amb.current.intensity = e.amb * k
      amb.current.color.copy(e.ambColor)
    }
    const fk = 0.35 + 0.65 * dim.current
    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      fog.color.copy(e.fogColor).multiplyScalar(fk)
      fog.near = e.fogNear
      fog.far = e.fogFar
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(e.fogColor).multiplyScalar(fk)
  })

  return (
    <>
      <color attach="background" args={[initial.fog.color]} />
      <fog attach="fog" args={[initial.fog.color, initial.fog.near, initial.fog.far]} />
      <hemisphereLight ref={hemi} args={[initial.ambient.skyColor, initial.ambient.groundColor, initial.ambient.hemiIntensity]} />
      <ambientLight ref={amb} intensity={initial.ambient.intensity} color={initial.ambient.color} />
    </>
  )
}

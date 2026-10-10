'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { commitPlayer, LOW_BATTERY, player, updateBattery } from '@/lib/backrooms/player-store'
import { game } from '@/lib/backrooms/store'

const INTENSITY = 14

/**
 * Camera-held spotlight. It is always in the scene (intensity 0 when off) so
 * toggling never changes the light count and never recompiles shaders.
 */
export function Flashlight() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const light = useMemo(() => {
    const l = new THREE.SpotLight('#fff1d6', 0, 20, 0.42, 0.6, 1.3)
    l.castShadow = false
    return l
  }, [])
  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), lag: new THREE.Vector3(0, 0, -1) }), [])
  const flicker = useRef({ until: 0, level: 1 })

  useEffect(() => {
    scene.add(light, light.target)
    return () => {
      scene.remove(light, light.target)
      light.dispose()
    }
  }, [scene, light])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    const wasOn = player.flashlightOn
    updateBattery(dt)
    if (wasOn !== player.flashlightOn) commitPlayer()

    camera.getWorldDirection(tmp.dir)
    // Lag behind the view so the beam sways like a hand-held torch.
    tmp.lag.lerp(tmp.dir, 1 - Math.exp(-dt * 8)).normalize()
    const p = game.player
    const sway = Math.sin(p.bob) * 0.012
    const rx = Math.cos(p.yaw)
    const rz = -Math.sin(p.yaw)
    light.position.set(camera.position.x + rx * 0.16, camera.position.y - 0.14, camera.position.z + rz * 0.16)
    light.target.position.set(
      light.position.x + (tmp.lag.x + rx * sway) * 6,
      light.position.y + (tmp.lag.y + Math.cos(p.bob * 2) * 0.006) * 6,
      light.position.z + (tmp.lag.z + rz * sway) * 6,
    )
    light.target.updateMatrixWorld()

    if (!player.flashlightOn) {
      light.intensity = 0
      return
    }
    const f = flicker.current
    if (player.battery < LOW_BATTERY && t > f.until) {
      const severity = 1 - player.battery / LOW_BATTERY
      const dropout = Math.random() < 0.04 + severity * 0.25
      f.level = dropout ? Math.random() * 0.25 : 0.7 + Math.random() * 0.3
      f.until = t + (dropout ? 0.04 + Math.random() * 0.12 : 0.1 + Math.random() * 0.5)
    } else if (player.battery >= LOW_BATTERY) f.level = 1
    light.intensity = INTENSITY * f.level * (0.6 + 0.4 * Math.min(1, player.battery / 0.5))
  })

  return null
}

'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CEIL_H, DOOR_H, ELEV, FLOORS, SHAFT, CELL } from '@/lib/backrooms/constants'
import { doorFor, elevator } from '@/lib/backrooms/elevator-state'
import { BoxBatch, type BoxSpec } from '@/lib/backrooms/geometry'
import { CALL_BUTTON, PANEL, panelButtonY } from '@/lib/backrooms/interact'
import { getMaterials } from '@/lib/backrooms/materials'
import { getTextures } from '@/lib/backrooms/textures'
import type { Zone } from '@/lib/backrooms/world-generator'

const { x: EX, frontZ0, frontZ1, doorZ, cabX0, cabX1, cabZ0, cabZ1, openHalf, cabCeil } = ELEV
const SX0 = SHAFT.cx0 * CELL
const SX1 = (SHAFT.cx1 + 1) * CELL
const CAB_W = cabX1 - cabX0
const CAB_D = cabZ1 - cabZ0
const CAB_CX = (cabX0 + cabX1) / 2
const CAB_CZ = (cabZ0 + cabZ1) / 2
const FRONT_D = frontZ1 - frontZ0
const FRONT_CZ = (frontZ0 + frontZ1) / 2
/** Leaves overlap the jambs slightly so no light leaks through when closed. */
const LEAF_W = openHalf + 0.08
const SLIDE = openHalf + 0.04

function batch(specs: BoxSpec[], texW = 1, texH = 1) {
  const b = new BoxBatch(texW, texH)
  specs.forEach((s) => b.add(s))
  return b.build()!
}

function useStaticGeometry() {
  return useMemo(() => {
    const leftW = EX - openHalf - SX0
    const rightW = SX1 - (EX + openHalf)
    const facade = batch(
      [
        { p: [SX0 + leftW / 2, CEIL_H / 2, FRONT_CZ], s: [leftW, CEIL_H, FRONT_D] },
        { p: [SX1 - rightW / 2, CEIL_H / 2, FRONT_CZ], s: [rightW, CEIL_H, FRONT_D] },
        { p: [EX, (DOOR_H + CEIL_H) / 2, FRONT_CZ], s: [openHalf * 2, CEIL_H - DOOR_H, FRONT_D] },
      ],
      6,
      CEIL_H,
    )
    const trim = batch([
      { p: [EX - openHalf - 0.05, DOOR_H / 2, frontZ0 - 0.01], s: [0.1, DOOR_H, 0.06] },
      { p: [EX + openHalf + 0.05, DOOR_H / 2, frontZ0 - 0.01], s: [0.1, DOOR_H, 0.06] },
      { p: [EX, DOOR_H + 0.05, frontZ0 - 0.01], s: [openHalf * 2 + 0.2, 0.1, 0.06] },
      { p: [EX, 0.006, frontZ0 + 0.1], s: [openHalf * 2, 0.012, 0.36] },
      // Call panel plate and indicator housing
      { p: [CALL_BUTTON.x, CALL_BUTTON.y, frontZ0 - 0.006], s: [0.13, 0.24, 0.012] },
      { p: [EX, DOOR_H + 0.3, frontZ0 - 0.008], s: [0.34, 0.24, 0.016] },
    ])
    const cab = batch(
      [
        { p: [cabX0 - 0.03, cabCeil / 2, CAB_CZ], s: [0.06, cabCeil, CAB_D] },
        { p: [cabX1 + 0.03, cabCeil / 2, CAB_CZ], s: [0.06, cabCeil, CAB_D] },
        { p: [CAB_CX, cabCeil / 2, cabZ1 + 0.03], s: [CAB_W + 0.12, cabCeil, 0.06] },
        { p: [(cabX0 + EX - openHalf) / 2, cabCeil / 2, cabZ0 + 0.02], s: [EX - openHalf - cabX0, cabCeil, 0.04] },
        { p: [(cabX1 + EX + openHalf) / 2, cabCeil / 2, cabZ0 + 0.02], s: [cabX1 - EX - openHalf, cabCeil, 0.04] },
        { p: [EX, (DOOR_H + cabCeil) / 2, cabZ0 + 0.02], s: [openHalf * 2, cabCeil - DOOR_H, 0.04] },
      ],
      1.2,
      1.2,
    )
    const dark = batch([
      { p: [CAB_CX, -0.02, CAB_CZ - 0.05], s: [CAB_W, 0.05, CAB_D + 0.1] },
      { p: [CAB_CX, cabCeil + 0.03, CAB_CZ], s: [CAB_W + 0.12, 0.06, CAB_D + 0.1] },
      { p: [CAB_CX, (cabCeil + CEIL_H) / 2, cabZ0 + 0.02], s: [CAB_W, CEIL_H - cabCeil, 0.04] },
      { p: [PANEL.x + 0.02, panelButtonY((FLOORS - 1) / 2), PANEL.z], s: [0.015, 0.16 * FLOORS + 0.14, 0.2] },
    ])
    const rail = batch([
      { p: [CAB_CX, 0.95, cabZ1 - 0.05], s: [CAB_W - 0.3, 0.04, 0.04] },
      { p: [cabX0 + 0.05, 0.95, CAB_CZ + 0.2], s: [0.04, 0.04, CAB_D - 0.8] },
    ])
    const leaf = new THREE.BoxGeometry(LEAF_W, DOOR_H, 0.04)
    const button = new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16)
    const plane = new THREE.PlaneGeometry(1, 1)
    return { facade, trim, cab, dark, rail, leaf, button, plane }
  }, [])
}

/** `concrete` swaps the yellow wallpaper facade for painted concrete (B1 lobby in the garage). */
export function Elevator({ floor, zone, yOffset, concrete = false }: { floor: number; zone: Zone; yOffset: number; concrete?: boolean }) {
  const mats = getMaterials()
  const tex = getTextures()
  const geo = useStaticGeometry()
  const leftRef = useRef<THREE.Mesh>(null)
  const rightRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  const local = useMemo(
    () => ({
      cabPanel: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      callBtn: new THREE.MeshBasicMaterial({ color: '#6b6250', toneMapped: false }),
      indicator: new THREE.MeshBasicMaterial({ map: tex.digits[0], toneMapped: false }),
      buttons: Array.from(
        { length: FLOORS },
        (_, i) => new THREE.MeshBasicMaterial({ map: tex.labels[i], color: '#9a978e', toneMapped: false }),
      ),
    }),
    [tex],
  )

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      local.cabPanel.dispose()
      local.callBtn.dispose()
      local.indicator.dispose()
      local.buttons.forEach((b) => b.dispose())
    },
    [geo, local],
  )

  useFrame(({ clock }) => {
    const open = doorFor(floor)
    const ease = open * open * (3 - 2 * open)
    if (leftRef.current) leftRef.current.position.x = EX - LEAF_W / 2 + 0.005 - ease * SLIDE
    if (rightRef.current) rightRef.current.position.x = EX + LEAF_W / 2 - 0.005 + ease * SLIDE

    const shown = elevator.phase === 'moving' && elevator.target !== null ? elevator.target : elevator.floor
    const digit = tex.digits[shown]
    if (local.indicator.map !== digit) {
      local.indicator.map = digit
      local.indicator.needsUpdate = true
    }
    const blink = elevator.phase === 'moving' ? 0.75 + 0.25 * Math.sin(clock.elapsedTime * 8) : 1
    local.indicator.color.setScalar(blink)

    const called = elevator.target === floor
    local.callBtn.color.set(called ? '#ffb347' : '#6b6250')
    local.buttons.forEach((m, i) => m.color.set(elevator.target === i ? '#ffc46b' : '#9a978e'))

    const l = elevator.light
    local.cabPanel.color.setScalar(0.25 + 0.75 * l)
    if (lightRef.current) lightRef.current.intensity = 3.2 * l
  })

  return (
    <group position={[0, yOffset, 0]}>
      <mesh geometry={geo.facade} material={concrete ? mats.paintedConcrete : mats.wall[zone]} />
      <mesh geometry={geo.trim} material={mats.props.metal} />
      <mesh geometry={geo.cab} material={mats.metalTex} />
      <mesh geometry={geo.dark} material={mats.props.darkMetal} />
      <mesh geometry={geo.rail} material={mats.props.metal} />
      <mesh ref={leftRef} geometry={geo.leaf} material={mats.metalTex} position={[EX - LEAF_W / 2, DOOR_H / 2, doorZ]} />
      <mesh ref={rightRef} geometry={geo.leaf} material={mats.metalTex} position={[EX + LEAF_W / 2, DOOR_H / 2, doorZ]} />

      <mesh
        geometry={geo.button}
        material={local.callBtn}
        position={[CALL_BUTTON.x, CALL_BUTTON.y, CALL_BUTTON.z - 0.004]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={geo.plane}
        material={local.indicator}
        position={[EX, DOOR_H + 0.3, frontZ0 - 0.018]}
        rotation={[0, Math.PI, 0]}
        scale={[0.18, 0.18, 1]}
      />

      <mesh
        geometry={geo.plane}
        material={local.cabPanel}
        position={[CAB_CX, cabCeil - 0.001, CAB_CZ]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1.1, 0.6, 1]}
      />
      {local.buttons.map((m, i) => (
        <mesh
          key={i}
          geometry={geo.plane}
          material={m}
          position={[PANEL.x, panelButtonY(i), PANEL.z]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[0.09, 0.09, 1]}
        />
      ))}
      <pointLight ref={lightRef} position={[CAB_CX, cabCeil - 0.3, CAB_CZ]} intensity={3.2} distance={4} decay={1.5} color="#fff3d6" />
    </group>
  )
}

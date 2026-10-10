'use client'

import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { RenderStats } from '@/components/world/render-stats'
import { WorldScene } from '@/components/world/world-scene'
import { game, loadWorld, randomSeed, setUi, useUi } from '@/lib/backrooms/store'
import { ZONES, type ZoneId } from '@/lib/world/zones'
import { Effects } from './effects'
import { Flashlight } from './flashlight'
import { FoundFootageOverlay } from './found-footage-overlay'
import { HideSpotHighlight } from './hide-spot-highlight'
import { HidingHud } from './hiding-hud'
import { Hud, StartOverlay, ZoneCard } from './hud'
import { InputController } from './input-controller'
import { FOOTAGE_FOV, LevelEnvironment } from './level-environment'
import { Player } from './player'
import { TouchControls } from './touch-controls'
import { WaterOverlay } from './water-overlay'

function Scene() {
  const [debug] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1')
  return (
    <>
      {debug && <RenderStats />}
      <LevelEnvironment />
      <WorldScene />
      <Flashlight />
      <HideSpotHighlight />
      <Player />
      <InputController />
      <Effects />
    </>
  )
}

function initialSeed() {
  const fromUrl = Number(new URLSearchParams(window.location.search).get('seed'))
  return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : randomSeed()
}

/** ?debug=1&zone=garage starts in a given zone. */
function initialZone(): ZoneId {
  const params = new URLSearchParams(window.location.search)
  const zone = params.get('zone') as ZoneId | null
  return params.get('debug') === '1' && zone && ZONES[zone] ? zone : 'yellow-1'
}

export default function BackroomsGame() {
  const [ready] = useState(() => {
    if (!game.floors.length) loadWorld(initialSeed(), initialZone())
    // Debug console access for play-testing (e.g. __game.player.x = 57).
    if (new URLSearchParams(window.location.search).get('debug') === '1') Object.assign(window, { __game: game })
    return true
  })
  const isTouch = useUi((s) => s.isTouch)

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const touchOnly = navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches
    setUi({ isTouch: coarse || touchOnly })
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {ready && (
        <Canvas
          dpr={[1, 1.5]}
          flat
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          camera={{ fov: FOOTAGE_FOV, near: 0.05, far: 80 }}
        >
          <Scene />
        </Canvas>
      )}
      <WaterOverlay />
      <HidingHud />
      <FoundFootageOverlay />
      {isTouch && <TouchControls />}
      <Hud />
      <ZoneCard />
      <StartOverlay />
    </div>
  )
}

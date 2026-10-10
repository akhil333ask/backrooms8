'use client'

import { useEffect, useRef } from 'react'
import { audio } from '@/lib/backrooms/audio'
import { toggleCrouch, toggleFlashlight, usePlayer } from '@/lib/backrooms/player-store'
import { game } from '@/lib/backrooms/store'

const JOY_RADIUS = 56
const LOOK_SENS = 0.0055

/** Left half: floating joystick. Right half: drag to look. */
export function TouchControls() {
  const zoneRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const crouching = usePlayer((s) => s.crouching)
  const flashlightOn = usePlayer((s) => s.flashlightOn)

  useEffect(() => {
    const zone = zoneRef.current
    const base = baseRef.current
    const knob = knobRef.current
    if (!zone || !base || !knob) return
    let joyId: number | null = null
    let lookId: number | null = null
    let ox = 0
    let oy = 0
    let lx = 0
    let ly = 0

    const showJoy = (x: number, y: number) => {
      base.style.opacity = '1'
      base.style.transform = `translate(${x - JOY_RADIUS}px, ${y - JOY_RADIUS}px)`
      knob.style.transform = 'translate(0px, 0px)'
    }
    const hideJoy = () => {
      base.style.opacity = '0'
      game.input.joyX = 0
      game.input.joyY = 0
    }

    const down = (e: PointerEvent) => {
      audio.init()
      if (e.clientX < window.innerWidth / 2 && joyId === null) {
        joyId = e.pointerId
        ox = e.clientX
        oy = e.clientY
        showJoy(ox, oy)
      } else if (lookId === null) {
        lookId = e.pointerId
        lx = e.clientX
        ly = e.clientY
      }
      zone.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId === joyId) {
        let dx = e.clientX - ox
        let dy = e.clientY - oy
        const len = Math.hypot(dx, dy)
        if (len > JOY_RADIUS) {
          dx = (dx / len) * JOY_RADIUS
          dy = (dy / len) * JOY_RADIUS
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`
        game.input.joyX = dx / JOY_RADIUS
        game.input.joyY = -dy / JOY_RADIUS
      } else if (e.pointerId === lookId) {
        game.input.lookDX += (e.clientX - lx) * LOOK_SENS
        game.input.lookDY += (e.clientY - ly) * LOOK_SENS
        lx = e.clientX
        ly = e.clientY
      }
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === joyId) {
        joyId = null
        hideJoy()
      } else if (e.pointerId === lookId) lookId = null
    }

    zone.addEventListener('pointerdown', down)
    zone.addEventListener('pointermove', move)
    zone.addEventListener('pointerup', up)
    zone.addEventListener('pointercancel', up)
    return () => {
      zone.removeEventListener('pointerdown', down)
      zone.removeEventListener('pointermove', move)
      zone.removeEventListener('pointerup', up)
      zone.removeEventListener('pointercancel', up)
      hideJoy()
    }
  }, [])

  return (
    <>
      <div ref={zoneRef} className="absolute inset-0 touch-none" aria-hidden="true">
        <div
          ref={baseRef}
          className="pointer-events-none absolute left-0 top-0 rounded-full border border-white/30 bg-white/5 opacity-0 transition-opacity"
          style={{ width: JOY_RADIUS * 2, height: JOY_RADIUS * 2 }}
        >
          <div className="absolute inset-0 m-auto size-12">
            <div ref={knobRef} className="size-12 rounded-full bg-white/40" />
          </div>
        </div>
      </div>
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation()
          game.input.interactQueued = true
        }}
        className="absolute bottom-8 right-8 flex size-16 touch-none items-center justify-center rounded-full border border-white/40 bg-black/40 font-mono text-sm font-bold text-white/90 active:bg-white/30"
      >
        USE
      </button>
      <ToggleButton
        label="CROUCH"
        active={crouching}
        onPress={toggleCrouch}
        className="bottom-28 right-6"
      />
      <ToggleButton label="LIGHT" active={flashlightOn} onPress={toggleFlashlight} className="bottom-8 right-28" />
    </>
  )
}

function ToggleButton({
  label,
  active,
  onPress,
  className,
}: {
  label: string
  active: boolean
  onPress: () => void
  className: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onPointerDown={(e) => {
        e.stopPropagation()
        onPress()
      }}
      className={`absolute flex size-14 touch-none items-center justify-center rounded-full border font-mono text-[10px] font-bold tracking-wider ${
        active ? 'border-[#f3ecc4] bg-[#f3ecc4]/30 text-white' : 'border-white/40 bg-black/40 text-white/80'
      } ${className}`}
    >
      {label}
    </button>
  )
}

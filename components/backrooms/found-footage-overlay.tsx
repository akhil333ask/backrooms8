'use client'

import { useEffect, useRef } from 'react'
import { useUi } from '@/lib/backrooms/store'

const GRAIN_W = 640
const GRAIN_H = 360

const pad = (n: number) => String(n).padStart(2, '0')

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
}

/** VHS camcorder overlay: grain, scanlines, tracking roll, vignette, REC + timecode. Pure DOM, no WebGL cost. */
export function FoundFootageOverlay() {
  const footage = useUi((s) => s.footage)
  const started = useUi((s) => s.started)
  const grainRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const elapsed = useRef(0)

  useEffect(() => {
    const canvas = grainRef.current
    const ctx = canvas?.getContext('2d')
    if (!footage || !canvas || !ctx) return
    const img = ctx.createImageData(GRAIN_W, GRAIN_H)
    const data = img.data
    let raf = 0
    let frame = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      // ~30fps grain is plenty and halves the CPU cost.
      if (frame++ % 2) return
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [footage])

  useEffect(() => {
    if (!footage || !started) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      elapsed.current += now - last
      last = now
      if (timeRef.current) timeRef.current.textContent = formatTime(elapsed.current)
    }, 250)
    return () => window.clearInterval(id)
  }, [footage, started])

  if (!footage) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true">
      <canvas
        ref={grainRef}
        width={GRAIN_W}
        height={GRAIN_H}
        className="absolute inset-0 size-full opacity-[0.06] mix-blend-overlay"
      />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,rgba(0,0,0,0.07)_0px,rgba(0,0,0,0.07)_1px,transparent_1px,transparent_4px)]" />
      <div className="ff-tracking absolute inset-x-0 h-[10%] bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.025)_40%,rgba(255,255,255,0.045)_50%,rgba(255,255,255,0.025)_60%,transparent)]" />
      <div className="absolute inset-0 shadow-[inset_3px_0_8px_rgba(255,40,60,0.07),inset_-3px_0_8px_rgba(40,200,255,0.07)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_62%,rgba(0,0,0,0.3)_88%,rgba(0,0,0,0.55)_100%)]" />

      <div className="absolute left-4 top-14 flex items-center gap-2 font-mono text-sm font-bold tracking-widest text-white/90 [text-shadow:0_0_4px_rgba(255,255,255,0.5)] md:text-base">
        <span className="ff-blink inline-block size-3 rounded-full bg-[#ff2a2a] shadow-[0_0_8px_#ff2a2a]" />
        REC
      </div>
      <div className="absolute right-4 top-14 font-mono text-sm tracking-widest text-white/90 [text-shadow:0_0_4px_rgba(255,255,255,0.5)] md:text-base">
        {'PLAY ► '}
        <span ref={timeRef}>00:00:00</span>
      </div>
    </div>
  )
}

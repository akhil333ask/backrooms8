'use client'

import { Waves } from 'lucide-react'
import { useUi } from '@/lib/backrooms/store'
import { useWater } from '@/lib/backrooms/water-state'

const DROPS = Array.from({ length: 22 }, (_, i) => {
  const h = (n: number) => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  return { left: h(1) * 96, top: h(2) * 92, size: 10 + h(3) * 38, delay: h(4) * 0.5, stretch: 1 + h(5) * 0.5 }
})

/** Blue underwater tint, the "submerged" status, and droplets on the lens after surfacing. */
export function WaterOverlay() {
  const started = useUi((s) => s.started)
  const submerged = useWater((s) => s.submerged)
  const surfacedAt = useWater((s) => s.surfacedAt)
  if (!started) return null

  return (
    <>
      {submerged && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-[3] bg-[radial-gradient(ellipse_at_center,rgba(20,110,130,0.45)_0%,rgba(6,48,66,0.82)_100%)] backdrop-blur-[2px]"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute left-1/2 top-12 z-10 -translate-x-1/2 select-none">
            <span className="flex items-center gap-1.5 rounded bg-[#06303f]/70 px-2.5 py-1 font-mono text-[11px] text-[#cdf3f5]" aria-live="polite">
              <Waves className="size-3.5" aria-hidden="true" />
              SUBMERGED · HIDDEN
            </span>
          </div>
        </>
      )}
      {!submerged && surfacedAt > 0 && (
        <div key={surfacedAt} className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden="true">
          {DROPS.map((d, i) => (
            <span
              key={i}
              className="lens-drop absolute rounded-full backdrop-blur-[1.5px]"
              style={{
                left: `${d.left}%`,
                top: `${d.top}%`,
                width: d.size,
                height: d.size * d.stretch,
                animationDelay: `${d.delay}s`,
                background:
                  'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55) 0%, rgba(200,235,240,0.18) 40%, rgba(0,20,30,0.14) 68%, transparent 72%)',
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}

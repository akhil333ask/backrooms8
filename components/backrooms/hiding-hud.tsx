'use client'

import { Eye, EyeOff, Flashlight } from 'lucide-react'
import { HIDE_SPOT_INFO, type HideView } from '@/lib/backrooms/hide-spot'
import { LOW_BATTERY, usePlayer } from '@/lib/backrooms/player-store'
import { useUi } from '@/lib/backrooms/store'

const chip = 'flex items-center gap-1.5 rounded bg-black/45 px-2.5 py-1 font-mono text-[11px] text-[#f3ecc4] backdrop-blur-sm'

const VIEW_MASKS: Record<HideView, string> = {
  under: 'bg-[linear-gradient(to_bottom,rgba(5,5,5,0.9)_0%,rgba(5,5,5,0.9)_18%,rgba(5,5,5,0.4)_28%,transparent_38%)]',
  slats:
    'bg-[repeating-linear-gradient(to_bottom,rgba(5,5,5,0.55)_0px,rgba(5,5,5,0.55)_3px,transparent_3px,transparent_16px),linear-gradient(to_bottom,rgba(5,5,5,0.85)_0%,transparent_22%,transparent_78%,rgba(5,5,5,0.85)_100%),radial-gradient(ellipse_at_center,transparent_55%,rgba(5,5,5,0.7)_100%)]',
  crack:
    'bg-[linear-gradient(to_right,rgba(5,5,5,0.92)_0%,rgba(5,5,5,0.92)_20%,rgba(5,5,5,0.35)_28%,transparent_34%,transparent_66%,rgba(5,5,5,0.35)_72%,rgba(5,5,5,0.92)_80%,rgba(5,5,5,0.92)_100%)]',
  grate:
    'bg-[repeating-linear-gradient(90deg,rgba(8,8,8,0.55)_0px,rgba(8,8,8,0.55)_5px,transparent_5px,transparent_26px),radial-gradient(ellipse_at_center,transparent_45%,rgba(5,5,5,0.9)_90%)]',
  open: 'bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]',
}

function NoiseMeter({ noise }: { noise: number }) {
  const bars = 5
  const lit = Math.round(noise * bars)
  return (
    <span className="flex items-end gap-0.5" aria-label={`Noise ${Math.round(noise * 100)}%`} role="img">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${i < lit ? (lit >= 4 ? 'bg-[#ff5a4a]' : 'bg-[#f3ecc4]') : 'bg-white/20'}`}
          style={{ height: 4 + i * 2 }}
        />
      ))}
    </span>
  )
}

export function HidingHud() {
  const started = useUi((s) => s.started)
  const isHidden = usePlayer((s) => s.isHidden)
  const spot = usePlayer((s) => s.currentHideSpot)
  const crouching = usePlayer((s) => s.crouching)
  const noise = usePlayer((s) => s.noise)
  const flashlightOn = usePlayer((s) => s.flashlightOn)
  const battery = usePlayer((s) => s.battery)
  if (!started) return null
  const info = spot ? HIDE_SPOT_INFO[spot.type] : null

  return (
    <>
      {isHidden && info && (
        <div className={`pointer-events-none absolute inset-0 z-[4] ${VIEW_MASKS[info.view]}`} aria-hidden="true" />
      )}
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 select-none">
        {isHidden && spot && info ? (
          <span className={chip} aria-live="polite">
            <EyeOff className="size-3.5" aria-hidden="true" />
            HIDDEN · {spot.label ?? info.label} · {Math.round(spot.concealment * 100)}%
          </span>
        ) : (
          <span className={chip}>
            <Eye className="size-3.5" aria-hidden="true" />
            {crouching ? 'CROUCH' : 'STAND'}
          </span>
        )}
        <span className={chip}>
          NOISE <NoiseMeter noise={noise} />
        </span>
        <span className={`${chip} ${flashlightOn && battery < LOW_BATTERY ? 'text-[#ff5a4a]' : ''}`}>
          <Flashlight className={`size-3.5 ${flashlightOn ? '' : 'opacity-40'}`} aria-hidden="true" />
          {Math.round(battery * 100)}%
        </span>
      </div>
    </>
  )
}

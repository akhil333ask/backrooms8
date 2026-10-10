'use client'

import { useSyncExternalStore } from 'react'
import { Film, RefreshCw, Volume2, VolumeX } from 'lucide-react'
import { audio } from '@/lib/backrooms/audio'
import { FLOOR_LABELS } from '@/lib/backrooms/constants'
import { resetElevator } from '@/lib/backrooms/elevator-state'
import { getUi, loadWorld, randomSeed, setUi, teleportToZone, useUi } from '@/lib/backrooms/store'
import { ZONE_IDS, ZONES, type ZoneId } from '@/lib/world/zones'
import { requestLock } from './input-controller'

const chip = 'pointer-events-auto flex items-center gap-2 rounded bg-black/45 px-3 py-1.5 font-mono text-xs text-[#f3ecc4] backdrop-blur-sm'

export function Hud() {
  const seed = useUi((s) => s.seed)
  const floor = useUi((s) => s.floor)
  const muted = useUi((s) => s.muted)
  const target = useUi((s) => s.target)
  const isTouch = useUi((s) => s.isTouch)
  const started = useUi((s) => s.started)
  const locked = useUi((s) => s.locked)
  const footage = useUi((s) => s.footage)
  const zone = useUi((s) => s.zone)
  const debug = useDebug()

  const regenerate = () => {
    const s = randomSeed()
    resetElevator()
    loadWorld(s, getUi().zone)
    const url = new URL(window.location.href)
    url.searchParams.set('seed', String(s))
    window.history.replaceState(null, '', url)
  }

  const toggleMute = () => {
    audio.init()
    audio.setMuted(!muted)
    setUi({ muted: !muted })
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div className="absolute left-3 top-3 flex items-center gap-2">
        {debug && (
          <>
            <label htmlFor="zone-select" className="sr-only">
              Teleport to zone
            </label>
            <select
              id="zone-select"
              value={zone}
              onChange={(e) => {
                resetElevator()
                teleportToZone(e.target.value as ZoneId)
                e.currentTarget.blur()
              }}
              className={`${chip} max-w-[46vw] cursor-pointer appearance-none truncate pr-3 hover:bg-black/65 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#f3ecc4]`}
            >
              {ZONE_IDS.map((id) => (
                <option key={id} value={id} className="bg-neutral-900">
                  {ZONES[id].title}: {ZONES[id].name}
                </option>
              ))}
            </select>
          </>
        )}
        <span className={chip}>Seed: {seed}</span>
        <button type="button" onClick={regenerate} className={`${chip} hover:bg-black/65`} aria-label="Generate a new seed">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          New
        </button>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2">
        <span className={chip} aria-live="polite">
          Floor {FLOOR_LABELS[floor]}
        </span>
        <button
          type="button"
          onClick={() => setUi({ footage: !footage })}
          className={`${chip} hover:bg-black/65 ${footage ? '' : 'opacity-60'}`}
          aria-label={footage ? 'Turn off found-footage effect' : 'Turn on found-footage effect'}
          aria-pressed={footage}
        >
          <Film className="size-4" aria-hidden="true" />
          VHS
        </button>
        <button
          type="button"
          onClick={toggleMute}
          className={`${chip} hover:bg-black/65`}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          aria-pressed={muted}
        >
          {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
      {target && (
        <div className="absolute left-1/2 top-1/2 mt-6 -translate-x-1/2 rounded bg-black/50 px-2 py-1 font-mono text-xs text-[#f3ecc4]">
          {isTouch ? 'USE' : '[E]'} {target}
        </div>
      )}

      {started && !isTouch && !locked && (
        <button
          type="button"
          onClick={requestLock}
          className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 rounded bg-black/45 px-3 py-1.5 font-mono text-xs text-[#f3ecc4]/80"
        >
          Click to capture mouse (or drag to look)
        </button>
      )}
    </div>
  )
}

const noop = () => () => {}
/** Debug tools (zone teleport) only with ?debug=1. */
function useDebug() {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get('debug') === '1',
    () => false,
  )
}

/** Briefly shows the zone name in the corner whenever the player walks into a new zone. */
export function ZoneCard() {
  const started = useUi((s) => s.started)
  const zone = useUi((s) => s.zone)
  const seed = useUi((s) => s.seed)
  if (!started) return null
  const { title, name: subtitle } = ZONES[zone]

  return (
    <div
      key={`${zone}-${seed}`}
      className="level-card pointer-events-none absolute left-4 top-14 z-10 select-none border-l-2 border-[#f3ecc4]/70 bg-black/35 py-1.5 pl-3 pr-4 font-mono text-[#f3ecc4] backdrop-blur-sm"
      role="status"
    >
      <p className="text-[11px] uppercase tracking-[0.3em] opacity-70">{title}</p>
      {subtitle && <p className="text-base uppercase tracking-[0.12em] md:text-lg">{subtitle}</p>}
    </div>
  )
}

export function StartOverlay() {
  const started = useUi((s) => s.started)
  const isTouch = useUi((s) => s.isTouch)
  const levelName = useUi((s) => ZONES[s.zone].name)
  if (started) return null

  const start = () => {
    audio.init()
    setUi({ started: true })
    requestLock()
  }

  return (
    <button
      type="button"
      onClick={start}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/55 text-center font-mono text-[#f3ecc4]"
    >
      <span className="text-3xl font-bold uppercase tracking-[0.3em] md:text-5xl">{levelName}</span>
      <span className="text-sm opacity-80">{isTouch ? 'Tap to enter' : 'Click to enter'}</span>
      <span className="max-w-sm text-xs leading-relaxed opacity-60">
        {isTouch
          ? 'Left thumb: move. Right thumb: look. USE: press buttons / hide. CROUCH and LIGHT toggle.'
          : 'WASD move · Mouse look · Shift run · C / Ctrl crouch · F flashlight · E interact / hide · Esc release mouse'}
      </span>
    </button>
  )
}

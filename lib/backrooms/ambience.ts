import type { AmbienceKind } from '@/levels/types'
import { audio } from './audio'

/**
 * Per-level ambience layered on the shared audio engine (Web Audio synthesis only).
 * Everything routes through the master gain, so the existing mute toggle applies.
 */
class Ambience {
  private kind: AmbienceKind | null = null
  private bus: GainNode | null = null
  private echo: DelayNode | null = null
  private sources: AudioScheduledSourceNode[] = []
  private nextEvent = 0
  private volume = 1

  /** Zone blending: 0..1 loudness of the current ambience bed. */
  setVolume(v: number) {
    if (Math.abs(v - this.volume) < 0.01) return
    this.volume = v
    if (this.bus && audio.context) this.bus.gain.setTargetAtTime(v, audio.context.currentTime, 0.25)
  }

  set(kind: AmbienceKind | null) {
    const ctx = audio.context
    if (!ctx || !audio.output) kind = null
    if (kind === this.kind) return
    this.stop()
    this.kind = kind
    if (!kind || !ctx) return
    this.build(ctx, kind)
  }

  private stop() {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {}
      s.disconnect()
    }
    this.sources = []
    if (this.bus && audio.context) {
      const bus = this.bus
      bus.gain.setTargetAtTime(0, audio.context.currentTime, 0.1)
      setTimeout(() => bus.disconnect(), 600)
    }
    this.bus = null
    this.echo = null
  }

  private osc(ctx: AudioContext, type: OscillatorType, freq: number) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.start()
    this.sources.push(o)
    return o
  }

  private noiseLoop(ctx: AudioContext, rate = 1) {
    const s = ctx.createBufferSource()
    s.buffer = audio.noiseBuffer
    s.loop = true
    s.playbackRate.value = rate
    s.start()
    this.sources.push(s)
    return s
  }

  private gain(ctx: AudioContext, v: number) {
    const g = ctx.createGain()
    g.gain.value = v
    return g
  }

  private filter(ctx: AudioContext, type: BiquadFilterType, f: number, q = 0.7) {
    const b = ctx.createBiquadFilter()
    b.type = type
    b.frequency.value = f
    b.Q.value = q
    return b
  }

  /** Slow amplitude wobble on a gain param. */
  private lfo(ctx: AudioContext, target: AudioParam, rate: number, depth: number) {
    const o = this.osc(ctx, 'sine', rate)
    const g = this.gain(ctx, depth)
    o.connect(g).connect(target)
  }

  private build(ctx: AudioContext, kind: AmbienceKind) {
    const bus = this.gain(ctx, 0)
    bus.connect(audio.output!)
    bus.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.8)
    this.bus = bus

    const echo = ctx.createDelay(1.5)
    const fb = this.gain(ctx, kind === 'pool' ? 0.55 : 0.4)
    const tone = this.filter(ctx, 'lowpass', kind === 'pool' ? 2600 : 1400)
    echo.delayTime.value = kind === 'pool' ? 0.37 : kind === 'garage' ? 0.29 : 0.18
    echo.connect(tone).connect(fb).connect(echo)
    tone.connect(bus)
    this.echo = echo

    if (kind === 'garage') {
      // Distant machinery: detuned low saws, heavily low-passed, slowly breathing
      const drone = this.gain(ctx, 0.05)
      const lp = this.filter(ctx, 'lowpass', 130)
      this.osc(ctx, 'sawtooth', 41).connect(lp)
      this.osc(ctx, 'sawtooth', 55.4).connect(lp)
      lp.connect(drone).connect(bus)
      this.lfo(ctx, drone.gain, 0.07, 0.025)
      // Ventilation rush
      const vent = this.gain(ctx, 0.022)
      this.noiseLoop(ctx, 0.5).connect(this.filter(ctx, 'bandpass', 320, 0.6)).connect(vent).connect(bus)
      this.lfo(ctx, vent.gain, 0.03, 0.01)
      // Tube light buzz
      const buzz = this.gain(ctx, 0.005)
      this.osc(ctx, 'square', 120).connect(this.filter(ctx, 'bandpass', 2400, 3)).connect(buzz).connect(bus)
      this.lfo(ctx, buzz.gain, 0.4, 0.004)
    } else if (kind === 'pool') {
      // Soft electrical hum with a humid room tone
      const hum = this.gain(ctx, 0.018)
      this.osc(ctx, 'sine', 60).connect(hum)
      this.osc(ctx, 'sine', 120).connect(this.gain(ctx, 0.5)).connect(hum)
      hum.connect(bus)
      hum.connect(echo)
      const room = this.gain(ctx, 0.014)
      this.noiseLoop(ctx, 0.35).connect(this.filter(ctx, 'lowpass', 480)).connect(room).connect(bus)
      this.lfo(ctx, room.gain, 0.05, 0.008)
    } else {
      // CRT: static hiss, faint flyback whine and mains hum
      const hiss = this.gain(ctx, 0.01)
      this.noiseLoop(ctx, 1).connect(this.filter(ctx, 'highpass', 2200)).connect(hiss).connect(bus)
      this.lfo(ctx, hiss.gain, 0.21, 0.005)
      const whine = this.gain(ctx, 0.0018)
      this.osc(ctx, 'sine', 15734).connect(whine).connect(bus)
      const mains = this.gain(ctx, 0.012)
      this.osc(ctx, 'sine', 50).connect(mains).connect(bus)
    }
    this.nextEvent = ctx.currentTime + 2
  }

  /** Schedules sparse one-shots (drips, clanks, clock ticks). Call every frame. */
  tick() {
    const ctx = audio.context
    if (!ctx || !this.bus || !this.echo || !this.kind) return
    const t = ctx.currentTime
    if (t < this.nextEvent) return
    const r = Math.random()
    if (this.kind === 'pool') {
      if (r < 0.8) this.drip(ctx, t)
      else this.lap(ctx, t)
      this.nextEvent = t + 1.2 + Math.random() * 3
    } else if (this.kind === 'garage') {
      if (r < 0.55) this.clank(ctx, t)
      else this.ping(ctx, t)
      this.nextEvent = t + 4 + Math.random() * 8
    } else {
      if (r < 0.75) this.tickTock(ctx, t)
      else this.murmur(ctx, t)
      this.nextEvent = t + (r < 0.75 ? 1 : 3 + Math.random() * 4)
    }
  }

  private env(ctx: AudioContext, t: number, peak: number, attack: number, decay: number) {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay)
    g.connect(this.bus!)
    g.connect(this.echo!)
    return g
  }

  private burst(ctx: AudioContext, t: number, dur: number) {
    const s = ctx.createBufferSource()
    s.buffer = audio.noiseBuffer
    s.start(t, Math.random())
    s.stop(t + dur)
    return s
  }

  private drip(ctx: AudioContext, t: number) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    const f = 900 + Math.random() * 900
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.06)
    o.connect(this.env(ctx, t, 0.05 + Math.random() * 0.04, 0.004, 0.12))
    o.start(t)
    o.stop(t + 0.2)
  }

  private lap(ctx: AudioContext, t: number) {
    const s = this.burst(ctx, t, 2)
    s.connect(this.filter(ctx, 'lowpass', 600)).connect(this.env(ctx, t, 0.03, 0.7, 1.1))
  }

  private clank(ctx: AudioContext, t: number) {
    const s = this.burst(ctx, t, 0.4)
    s.connect(this.filter(ctx, 'bandpass', 700 + Math.random() * 900, 5)).connect(this.env(ctx, t, 0.07, 0.005, 0.35))
  }

  private ping(ctx: AudioContext, t: number) {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = 160 + Math.random() * 180
    o.connect(this.env(ctx, t, 0.03, 0.01, 1.4))
    o.start(t)
    o.stop(t + 1.5)
  }

  private tickTock(ctx: AudioContext, t: number) {
    const s = this.burst(ctx, t, 0.03)
    s.connect(this.filter(ctx, 'highpass', 3000)).connect(this.env(ctx, t, 0.025, 0.001, 0.025))
  }

  /** Muffled TV voices through a wall. */
  private murmur(ctx: AudioContext, t: number) {
    const s = this.burst(ctx, t, 2.4)
    const bp = this.filter(ctx, 'bandpass', 420, 2.5)
    const am = ctx.createGain()
    am.gain.value = 0.5
    const mod = ctx.createOscillator()
    mod.frequency.value = 4 + Math.random() * 3
    const modDepth = ctx.createGain()
    modDepth.gain.value = 0.5
    mod.connect(modDepth).connect(am.gain)
    mod.start(t)
    mod.stop(t + 2.4)
    s.connect(bp).connect(am).connect(this.env(ctx, t, 0.04, 0.3, 1.9))
  }
}

export const ambience = new Ambience()

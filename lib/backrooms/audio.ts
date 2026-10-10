/** All sounds are synthesized with the Web Audio API — no audio files. */
class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private hum: GainNode | null = null
  private buzz: GainNode | null = null
  private noise: AudioBuffer | null = null
  private muted = false

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(ctx.destination)

    const len = ctx.sampleRate * 2
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    // Fluorescent hum: mains fundamental + harmonics, low-passed
    this.hum = ctx.createGain()
    this.hum.gain.value = 0.04
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    lp.connect(this.hum)
    this.hum.connect(this.master)
    const tones: [OscillatorType, number, number][] = [
      ['sine', 60, 0.5],
      ['sawtooth', 120, 0.12],
      ['square', 180, 0.03],
    ]
    for (const [type, freq, gain] of tones) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.value = gain
      o.connect(g).connect(lp)
      o.start()
    }

    // Flicker buzz layer (band-passed noise)
    this.buzz = ctx.createGain()
    this.buzz.gain.value = 0
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2400
    bp.Q.value = 4
    src.connect(bp).connect(this.buzz).connect(this.master)
    src.start()
  }

  /** Shared graph access for layered level ambience (routes through master, so mute applies). */
  get context() {
    return this.ctx
  }
  get output() {
    return this.master
  }
  get noiseBuffer() {
    return this.noise
  }

  /** Wading splash / swim stroke. */
  splash(volume = 1) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(1400 + Math.random() * 600, t)
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.3)
    bp.Q.value = 0.9
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.2 * volume, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38)
    src.connect(bp).connect(g).connect(this.master)
    src.start(t, Math.random() * 1.5)
    src.stop(t + 0.42)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  private humBase = 0.025
  private humRange = 0.11
  private buzzGain = 0.025

  /** Per-level ambience parameters. */
  configure(p: { humBase: number; humRange: number; buzzGain: number }) {
    this.humBase = p.humBase
    this.humRange = p.humRange
    this.buzzGain = p.buzzGain
  }

  /** level 0..1 proximity to working lights, flicker 0..1 */
  setHum(level: number, flicker: number) {
    if (!this.ctx || !this.hum || !this.buzz) return
    const t = this.ctx.currentTime
    this.hum.gain.setTargetAtTime(this.humBase + level * this.humRange, t, 0.15)
    this.buzz.gain.setTargetAtTime(flicker * this.buzzGain, t, 0.03)
  }

  /** Relay clunk when a zone's lights cut out. */
  blackoutCut() {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(90, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.35, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.4)
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(0.25, t)
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(cg).connect(this.master)
    src.start(t, Math.random())
    src.stop(t + 0.06)
  }

  /** Stuttering electrical buzz as the lights come back. */
  buzzReturn() {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 120
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    for (let i = 0; i < 6; i++) g.gain.setValueAtTime(i % 2 ? 0.02 : 0.12, t + i * 0.07)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
    o.connect(g)
    src.connect(bp).connect(g)
    g.connect(this.master)
    o.start(t)
    src.start(t, Math.random())
    o.stop(t + 0.75)
    src.stop(t + 0.75)
  }

  footstep(fast: boolean, volume = 1) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.6 + Math.random() * 0.3
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380 + Math.random() * 120
    const g = ctx.createGain()
    const peak = (fast ? 0.22 : 0.15) * volume
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    src.connect(lp).connect(g).connect(this.master)
    src.start(t, Math.random() * 1.5)
    src.stop(t + 0.2)
  }

  ding() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const notes: [number, number][] = [
      [1318.5, 0],
      [1046.5, 0.45],
    ]
    for (const [f, delay] of notes) {
      for (const [mult, amp] of [
        [1, 0.18],
        [2.76, 0.03],
      ]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f * mult
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t + delay)
        g.gain.linearRampToValueAtTime(amp, t + delay + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0005, t + delay + 1.6)
        o.connect(g).connect(this.master)
        o.start(t + delay)
        o.stop(t + delay + 1.7)
      }
    }
  }

  rumble(duration: number) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 140
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.5, t + 0.5)
    g.gain.setValueAtTime(0.5, t + duration - 0.6)
    g.gain.linearRampToValueAtTime(0, t + duration)
    src.connect(lp).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + duration + 0.1)
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = 42
    const og = ctx.createGain()
    og.gain.setValueAtTime(0, t)
    og.gain.linearRampToValueAtTime(0.12, t + 0.4)
    og.gain.linearRampToValueAtTime(0, t + duration)
    o.connect(og).connect(this.master)
    o.start(t)
    o.stop(t + duration + 0.1)
  }
}

export const audio = new AudioEngine()

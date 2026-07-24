import type { Game } from './game';
import type { WeaponKind } from './types';

/**
 * Punchy, fully-synthesized sound. Every effect is generated at runtime with
 * the Web Audio API — no audio files. The engine subscribes to the game's
 * event bus, so gameplay code never calls it directly.
 */

const MUTE_KEY = 'lane-pusher.muted';
const MASTER_GAIN = 0.5;

function readMuted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage unavailable; preference simply won't persist
  }
}

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  dur: number;
  gain: number;
  /** Target frequency to glide to over the note. */
  to?: number;
  delay?: number;
}

interface NoiseOpts {
  dur: number;
  gain: number;
  type?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  delay?: number;
}

/**
 * A light loop over 16 eighth-notes: an Am–F–C–G feel. BASS is the low root
 * support; LEAD is a mid/high melody that carries on small speakers. 0 = rest.
 */
const BASS = [
  110, 0, 110, 0, 87.31, 0, 87.31, 0,
  130.81, 0, 130.81, 0, 98, 0, 98, 0,
];
const LEAD = [
  440, 523.25, 659.25, 523.25, 349.23, 440, 523.25, 440,
  523.25, 659.25, 783.99, 659.25, 392, 493.88, 587.33, 493.88,
];
const STEP_SECONDS = 60 / 96 / 2; // eighth-notes at 96 bpm

export class SoundEngine {
  muted = readMuted();

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;

  /** Whether the audio clock is actually running (iOS unlocks lazily). */
  isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must be called from a user gesture to unlock audio in the browser. */
  resume() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.8;
      this.musicGain.connect(this.master);
      this.noiseBuffer = this.makeNoise();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();

    // iOS Safari needs a real (silent) buffer played inside the gesture before
    // it will actually route audio to the output.
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      // ignore — best-effort unlock
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : MASTER_GAIN,
        this.ctx.currentTime,
        0.01,
      );
    }
    writeMuted(this.muted);
  }

  /** Subscribe to every gameplay event and voice it. */
  attach(game: Game) {
    const e = game.events;
    e.on('fire', ({ weapon }) => this.fire(weapon));
    e.on('kill', ({ boss }) => this.kill(boss));
    e.on('playerHit', () => this.playerHit());
    e.on('shieldBlock', () => this.shieldBlock());
    e.on('dampened', () => this.dampened());
    e.on('pickup', () => this.pickup());
    e.on('weaponSwitch', () => this.weaponSwitch());
    e.on('buffUp', () => this.buffUp());
    e.on('bomb', () => this.bomb());
    e.on('ability', () => this.ability());
    e.on('enemyFire', () => this.enemyFire());
    e.on('waveStart', ({ boss }) => this.waveStart(boss));
    e.on('waveClear', () => this.waveClear());
    e.on('gameOver', () => {
      this.gameOver();
      this.stopMusic();
    });
    e.on('gameStart', () => {
      this.uiConfirm();
      this.startMusic();
    });
  }

  // ----------------------------------------------------------------- music

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  private stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Lookahead scheduler: queue notes a little ahead of the audio clock. */
  private scheduleMusic() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      const step = this.musicStep;
      const t = this.nextNoteTime;
      if (BASS[step] > 0) this.musicBass(BASS[step], t);
      if (LEAD[step] > 0) this.musicLead(LEAD[step], t);
      if (step % 4 === 0) this.musicKick(t);
      if (step % 2 === 1) this.musicHat(t);
      this.nextNoteTime += STEP_SECONDS;
      this.musicStep = (step + 1) % LEAD.length;
    }
  }

  private musicBass(freq: number, t: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  /** The audible melody line; a plucky filtered saw sits well on any speaker. */
  private musicLead(freq: number, t: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private musicKick(t: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  private musicHat(t: number) {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.06);
  }

  // ---------------------------------------------------------------- effects

  private fire(weapon: WeaponKind) {
    switch (weapon) {
      case 'blaster':
        this.tone({ freq: 720, to: 940, type: 'square', dur: 0.06, gain: 0.1 });
        break;
      case 'scatter':
        this.noise({ dur: 0.05, gain: 0.09, type: 'highpass', freq: 1600 });
        break;
      case 'railgun':
        this.tone({ freq: 260, to: 70, type: 'sawtooth', dur: 0.2, gain: 0.16 });
        this.noise({ dur: 0.14, gain: 0.1, type: 'lowpass', freq: 900 });
        break;
    }
  }

  private kill(boss: boolean) {
    if (boss) {
      this.noise({ dur: 0.6, gain: 0.4, type: 'lowpass', freq: 1400, to: 120 });
      this.tone({ freq: 140, to: 40, type: 'sine', dur: 0.55, gain: 0.35 });
      return;
    }
    this.noise({ dur: 0.12, gain: 0.18, type: 'bandpass', freq: 1200, q: 1 });
    this.tone({ freq: 420, to: 160, type: 'triangle', dur: 0.1, gain: 0.12 });
  }

  private playerHit() {
    this.tone({ freq: 180, to: 70, type: 'square', dur: 0.18, gain: 0.28 });
    this.noise({ dur: 0.16, gain: 0.16, type: 'lowpass', freq: 800 });
  }

  private shieldBlock() {
    this.tone({ freq: 900, type: 'triangle', dur: 0.12, gain: 0.2 });
    this.tone({ freq: 1350, type: 'sine', dur: 0.1, gain: 0.12, delay: 0.01 });
  }

  private dampened() {
    this.tone({ freq: 520, to: 110, type: 'sawtooth', dur: 0.32, gain: 0.24 });
  }

  private pickup() {
    this.tone({ freq: 660, type: 'square', dur: 0.07, gain: 0.16 });
    this.tone({ freq: 990, type: 'square', dur: 0.09, gain: 0.16, delay: 0.07 });
  }

  private weaponSwitch() {
    this.noise({ dur: 0.22, gain: 0.16, type: 'bandpass', freq: 500, to: 2600, q: 1.2 });
  }

  private buffUp() {
    this.tone({ freq: 523, type: 'triangle', dur: 0.08, gain: 0.14 });
    this.tone({ freq: 659, type: 'triangle', dur: 0.08, gain: 0.14, delay: 0.07 });
    this.tone({ freq: 784, type: 'triangle', dur: 0.12, gain: 0.15, delay: 0.14 });
  }

  private bomb() {
    this.noise({ dur: 0.5, gain: 0.42, type: 'lowpass', freq: 1800, to: 90 });
    this.tone({ freq: 90, to: 30, type: 'sine', dur: 0.5, gain: 0.4 });
  }

  private ability() {
    this.noise({ dur: 0.4, gain: 0.34, type: 'lowpass', freq: 2600, to: 220 });
    this.tone({ freq: 180, to: 520, type: 'sine', dur: 0.35, gain: 0.28 });
  }

  private enemyFire() {
    this.tone({ freq: 300, to: 210, type: 'sine', dur: 0.06, gain: 0.06 });
  }

  private waveStart(boss: boolean) {
    if (boss) {
      this.tone({ freq: 110, to: 70, type: 'sawtooth', dur: 0.5, gain: 0.3 });
      this.tone({ freq: 220, type: 'square', dur: 0.4, gain: 0.14, delay: 0.05 });
      return;
    }
    this.tone({ freq: 330, type: 'square', dur: 0.09, gain: 0.14 });
    this.tone({ freq: 494, type: 'square', dur: 0.12, gain: 0.14, delay: 0.09 });
  }

  private waveClear() {
    // A short rising major triad.
    this.tone({ freq: 523, type: 'triangle', dur: 0.1, gain: 0.16 });
    this.tone({ freq: 659, type: 'triangle', dur: 0.1, gain: 0.16, delay: 0.08 });
    this.tone({ freq: 784, type: 'triangle', dur: 0.16, gain: 0.18, delay: 0.16 });
  }

  private gameOver() {
    this.tone({ freq: 440, to: 110, type: 'sawtooth', dur: 0.7, gain: 0.3 });
    this.tone({ freq: 220, to: 60, type: 'sine', dur: 0.8, gain: 0.22, delay: 0.1 });
  }

  private uiConfirm() {
    this.tone({ freq: 540, to: 720, type: 'square', dur: 0.09, gain: 0.14 });
  }

  // --------------------------------------------------------------- synthesis

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(o: ToneOpts) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
  }

  private noise(o: NoiseOpts) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.type ?? 'bandpass';
    filter.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.to !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    }
    filter.Q.value = o.q ?? 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + o.dur + 0.03);
  }
}

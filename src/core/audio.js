// Procedural Web Audio: SFX + generative war-drum score. No asset files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = false;
    this.intensity = 0.4;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.45; this.musicBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.5);
    const rv = ctx.createGain(); rv.gain.value = 0.25;
    this.reverb.connect(rv).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.plucks = this.makePlucks();
  }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  // Karplus-Strong guzheng-like plucks, pentatonic
  makePlucks() {
    const sr = this.ctx.sampleRate;
    const notes = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25];
    return notes.map((f) => {
      const len = Math.floor(sr * 2.2);
      const b = this.ctx.createBuffer(1, len, sr);
      const d = b.getChannelData(0);
      const N = Math.floor(sr / f);
      const ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const nx = (idx + 1) % N;
        const v = (ring[idx] + ring[nx]) * 0.4985;
        d[i] = ring[idx] * (1 - i / len);
        ring[idx] = v;
        idx = nx;
      }
      return b;
    });
  }

  env(g, t, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }

  noise(t, dur, { type = 'bandpass', f0 = 2000, f1 = 600, q = 1, gain = 0.5, attack = 0.005, out = this.sfxBus, rev = 0 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this.env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(out);
    if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r).connect(this.reverb); }
    src.start(t, Math.random() * 1.5); src.stop(t + dur + attack + 0.05);
  }

  tone(t, dur, { type = 'sine', f0 = 100, f1 = 40, gain = 0.6, attack = 0.003, out = this.sfxBus, rev = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain(); this.env(g, t, attack, gain, dur);
    o.connect(g).connect(out);
    if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r).connect(this.reverb); }
    o.start(t); o.stop(t + dur + attack + 0.05);
  }

  play(name, vol = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = vol;
    switch (name) {
      case 'swing': this.noise(t, 0.2, { f0: 3800, f1: 500, q: 1.4, gain: 0.32 * v, attack: 0.03 }); break;
      case 'thrust': this.noise(t, 0.12, { f0: 2400, f1: 900, q: 2, gain: 0.28 * v, attack: 0.01 }); break;
      case 'heavy': this.noise(t, 0.32, { f0: 1800, f1: 220, q: 1, gain: 0.45 * v, attack: 0.04 }); this.tone(t, 0.25, { f0: 160, f1: 70, gain: 0.15 * v }); break;
      case 'dash': this.noise(t, 0.28, { f0: 900, f1: 2600, q: 0.8, gain: 0.2 * v, attack: 0.05 }); break;
      case 'jump': this.noise(t, 0.2, { f0: 600, f1: 1800, q: 0.8, gain: 0.15 * v, attack: 0.03 }); break;
      case 'hit':
        this.noise(t, 0.09, { type: 'lowpass', f0: 3000, f1: 400, gain: 0.5 * v });
        this.tone(t, 0.14, { f0: 140 + Math.random() * 30, f1: 45, gain: 0.55 * v });
        this.tone(t, 0.05, { type: 'square', f0: 1800 + Math.random() * 600, f1: 900, gain: 0.04 * v });
        break;
      case 'clash':
        for (const [f, gn] of [[1870, 0.12], [2730, 0.08], [3410, 0.06], [5230, 0.04]]) this.tone(t, 0.7, { type: 'sine', f0: f, f1: f * 0.98, gain: gn * v, rev: 0.6 });
        this.noise(t, 0.06, { type: 'highpass', f0: 3000, f1: 2000, gain: 0.4 * v });
        break;
      case 'slam':
        this.tone(t, 0.6, { f0: 90, f1: 28, gain: 0.9 * v, rev: 0.4 });
        this.noise(t, 0.5, { type: 'lowpass', f0: 1200, f1: 80, gain: 0.6 * v, rev: 0.4 });
        break;
      case 'boom':
        this.tone(t, 1.4, { f0: 70, f1: 22, gain: 1.0 * v, rev: 0.8 });
        this.noise(t, 1.2, { type: 'lowpass', f0: 2600, f1: 60, gain: 0.8 * v, rev: 0.8 });
        this.noise(t, 0.6, { f0: 6000, f1: 1500, q: 0.5, gain: 0.3 * v, rev: 0.5 });
        break;
      case 'musou':
        this.noise(t, 1.0, { f0: 300, f1: 5000, q: 1.2, gain: 0.35 * v, attack: 0.5, rev: 0.6 });
        for (const f of [146.8, 220, 293.7, 440]) this.tone(t, 1.6, { type: 'sawtooth', f0: f, f1: f * 1.01, gain: 0.05 * v, attack: 0.3, rev: 0.8 });
        this.tone(t, 0.8, { f0: 60, f1: 40, gain: 0.6 * v });
        break;
      case 'pickup': [0, 2, 4, 7].forEach((n, i) => this.pluck(n, t + i * 0.07, 0.5 * v)); break;
      case 'ui': this.tone(t, 0.08, { type: 'triangle', f0: 880, f1: 660, gain: 0.08 * v }); break;
      case 'gong':
        for (const [f, gn] of [[110, 0.4], [164, 0.2], [233, 0.15], [311, 0.1], [415, 0.06]]) this.tone(t, 3.5, { f0: f * 1.02, f1: f, gain: gn * v, attack: 0.01, rev: 1 });
        break;
      case 'step': this.noise(t, 0.06, { type: 'lowpass', f0: 600, f1: 200, gain: 0.07 * v }); break;
      case 'officer': this.play('gong', 0.6); this.drumHit(t, 0.9); this.drumHit(t + 0.18, 0.7); break;
      case 'hurt': this.noise(t, 0.15, { type: 'lowpass', f0: 1500, f1: 300, gain: 0.4 * v }); this.tone(t, 0.18, { f0: 110, f1: 60, gain: 0.4 * v }); break;
    }
  }

  pluck(n, t, gain = 0.3) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.plucks[Math.max(0, Math.min(this.plucks.length - 1, n))];
    const g = this.ctx.createGain(); g.gain.value = gain;
    const r = this.ctx.createGain(); r.gain.value = 0.5;
    s.connect(g).connect(this.musicBus); g.connect(r).connect(this.reverb);
    s.start(t);
  }

  drumHit(t, v = 1, low = true) {
    const out = this.musicBus;
    this.tone(t, low ? 0.5 : 0.22, { f0: low ? 95 : 190, f1: low ? 42 : 90, gain: 0.9 * v, out, rev: 0.25 });
    this.noise(t, low ? 0.18 : 0.08, { type: 'lowpass', f0: low ? 900 : 2500, f1: 150, gain: 0.35 * v, out });
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const bpm = 104, beat = 60 / bpm;
    let next = this.ctx.currentTime + 0.1;
    let step = 0;
    let note = 4;
    // drone
    const drone = this.ctx.createGain(); drone.gain.value = 0.0; drone.connect(this.musicBus);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(drone);
    for (const f of [73.4, 73.9, 110, 146.8]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start();
    }
    this.drone = drone;
    const pattern = [1, 0, 0.4, 0, 0.8, 0, 0.5, 0.3, 1, 0, 0.4, 0.3, 0.9, 0.5, 0.7, 0.6];
    const tick = () => {
      if (!this.musicOn) return;
      const now = this.ctx.currentTime;
      while (next < now + 0.25) {
        const i = this.intensity;
        const s = step % 16;
        const pv = pattern[s];
        if (pv > 0 && (pv > 0.6 || i > 0.45)) this.drumHit(next, pv * (0.35 + i * 0.6), pv > 0.6);
        if (i > 0.6 && s % 2 === 1) this.drumHit(next, 0.2 * i, false);
        // guzheng phrase
        if ((s % 4 === 0 && Math.random() < 0.55) || (s % 2 === 0 && i > 0.7 && Math.random() < 0.3)) {
          note = Math.max(0, Math.min(9, note + [-2, -1, 1, 2, 0][Math.floor(Math.random() * 5)]));
          this.pluck(note, next, 0.22 + i * 0.12);
          if (Math.random() < 0.3) this.pluck(Math.min(9, note + 2), next + beat / 4, 0.14);
        }
        next += beat / 2;
        step++;
      }
      this.drone.gain.setTargetAtTime(0.03 + this.intensity * 0.05, now, 0.5);
      setTimeout(tick, 60);
    };
    tick();
  }
}

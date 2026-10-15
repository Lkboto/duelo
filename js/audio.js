'use strict';
// ─────────────────────────────────────────────────────────────
//  Sonido 100% sintetizado con WebAudio (sin archivos)
// ─────────────────────────────────────────────────────────────

const Sfx = {
  ctx: null, master: null, noiseBuf: null, enabled: true, volume: 0.7,
  silent: 0,          // > 0: no suena nada (previsualizaciones, partida de fondo)

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6;
    comp.attack.value = 0.002; comp.release.value = 0.15;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.volume = Store.get('volume', 0.7);
    this.master.gain.value = this.volume;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolume(v) {
    this.volume = v; Store.set('volume', v);
    if (this.master) this.master.gain.value = v;
  },

  // ── primitivas ──
  _noise(t0, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.5, attack = 0.005 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = rand(0.9, 1.1);
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t0, rand(0, 1)); src.stop(t0 + dur + 0.05);
  },
  _tone(t0, dur, { type = 'sine', f0 = 440, f1 = f0, gain = 0.4, attack = 0.003, curve = 'exp' } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
    else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

  play(name, p = 1) {
    if (!this.enabled || !this.ctx || this.volume <= 0 || this.silent > 0) return;
    // evita saturar con decenas de sonidos idénticos en el mismo instante
    const now = this.ctx.currentTime, key = name;
    this._last = this._last || {};
    if (this._last[key] && now - this._last[key] < 0.012 && name !== 'hit' && name !== 'slash') return;
    this._last[key] = now;
    const t = this.ctx.currentTime + 0.001;
    const fn = this.lib[name];
    if (fn) fn.call(this, t, p);
  },

  lib: {
    swish(t, p) {      // p = 0.5 (rápido) … 1.5 (pesado)
      const d = 0.09 + 0.08 * p;
      this._noise(t, d, { f0: 900 + 900 / p, f1: 3500 / p, q: 1.6, gain: 0.18 + 0.08 * p, attack: d * 0.4 });
    },
    blade(t, p) {
      this.lib.swish.call(this, t, p);
      this._noise(t, 0.08, { type: 'highpass', f0: 5000, f1: 9000, q: 0.7, gain: 0.05 });
    },
    hit(t, p) {        // p = fuerza 0.5 … 2
      this._tone(t, 0.12 + 0.06 * p, { f0: 180 + 40 * p, f1: 45, gain: 0.55 + 0.15 * p });
      this._noise(t, 0.06 + 0.04 * p, { type: 'lowpass', f0: 4000, f1: 600, q: 0.8, gain: 0.45 + 0.1 * p });
      this._noise(t, 0.025, { type: 'highpass', f0: 3000, f1: 3000, gain: 0.25 });
    },
    slash(t, p) {
      this.lib.hit.call(this, t, p * 0.8);
      this._noise(t, 0.12, { type: 'bandpass', f0: 6000, f1: 2500, q: 2, gain: 0.25 });
    },
    heavy(t, p) {
      this._tone(t, 0.35, { f0: 140, f1: 30, gain: 0.8 });
      this._tone(t, 0.18, { type: 'square', f0: 90, f1: 40, gain: 0.12 });
      this._noise(t, 0.3, { type: 'lowpass', f0: 3000, f1: 150, q: 0.5, gain: 0.7 });
      this._noise(t, 0.04, { type: 'highpass', f0: 2500, gain: 0.35 });
    },
    jump(t) {
      this._noise(t, 0.08, { type: 'bandpass', f0: 600, f1: 1800, q: 1.2, gain: 0.12 });
      this._tone(t, 0.07, { type: 'triangle', f0: 260, f1: 520, gain: 0.05 });
    },
    djump(t) {
      this._noise(t, 0.12, { type: 'bandpass', f0: 800, f1: 2600, q: 2, gain: 0.14 });
      this._tone(t, 0.09, { type: 'triangle', f0: 400, f1: 800, gain: 0.05 });
    },
    land(t, p) {
      this._noise(t, 0.07 + 0.05 * p, { type: 'lowpass', f0: 900, f1: 120, q: 0.6, gain: 0.15 + 0.15 * p });
    },
    step(t) {
      this._noise(t, 0.04, { type: 'lowpass', f0: 700, f1: 200, gain: 0.05 });
    },
    dash(t) {
      this._noise(t, 0.18, { type: 'bandpass', f0: 3000, f1: 500, q: 0.9, gain: 0.25, attack: 0.01 });
    },
    blink(t) {
      this._tone(t, 0.15, { type: 'sine', f0: 1600, f1: 300, gain: 0.15 });
      this._noise(t, 0.12, { type: 'highpass', f0: 4000, f1: 8000, gain: 0.08 });
    },
    shoot(t) {
      this._noise(t, 0.12, { type: 'lowpass', f0: 6000, f1: 400, q: 0.7, gain: 0.7, attack: 0.001 });
      this._tone(t, 0.09, { f0: 220, f1: 50, gain: 0.5 });
    },
    shotgun(t) {
      this._noise(t, 0.35, { type: 'lowpass', f0: 5000, f1: 120, q: 0.4, gain: 0.9, attack: 0.001 });
      this._tone(t, 0.25, { f0: 120, f1: 30, gain: 0.7 });
    },
    throw(t) {
      this._noise(t, 0.14, { type: 'bandpass', f0: 2500, f1: 4500, q: 4, gain: 0.15 });
    },
    zap(t) {
      for (let i = 0; i < 4; i++) {
        this._tone(t + i * 0.025, 0.06, { type: 'sawtooth', f0: rand(300, 1400), f1: rand(60, 200), gain: 0.12 });
      }
      this._noise(t, 0.4, { type: 'highpass', f0: 1500, f1: 300, q: 0.4, gain: 0.45 });
      this._tone(t, 0.4, { f0: 90, f1: 30, gain: 0.5 });
    },
    orb(t) {
      this._tone(t, 0.25, { type: 'sine', f0: 300, f1: 900, gain: 0.18 });
      this._tone(t, 0.25, { type: 'triangle', f0: 305, f1: 880, gain: 0.08 });
    },
    boom(t, p) {
      this._noise(t, 0.6 * p, { type: 'lowpass', f0: 2500, f1: 60, q: 0.4, gain: 0.9 });
      this._tone(t, 0.5 * p, { f0: 110, f1: 25, gain: 0.9 });
    },
    parry(t) {
      [1320, 1980, 2640, 1760].forEach((f, i) =>
        this._tone(t, 0.5 - i * 0.07, { type: 'sine', f0: f, f1: f * 0.99, gain: 0.12, attack: 0.001 }));
      this._noise(t, 0.05, { type: 'highpass', f0: 5000, gain: 0.3 });
    },
    stance(t) {
      this._tone(t, 0.25, { type: 'sine', f0: 880, f1: 1760, gain: 0.08 });
    },
    sheath(t) {
      this._noise(t, 0.2, { type: 'bandpass', f0: 4000, f1: 7000, q: 6, gain: 0.12 });
    },
    smoke(t) {
      this._noise(t, 0.3, { type: 'lowpass', f0: 1800, f1: 300, q: 0.5, gain: 0.3 });
    },
    shock(t) {
      this._tone(t, 0.6, { f0: 70, f1: 25, gain: 0.9 });
      this._noise(t, 0.5, { type: 'lowpass', f0: 1200, f1: 80, q: 0.5, gain: 0.8 });
    },
    ko(t) {
      this._tone(t, 1.2, { f0: 90, f1: 20, gain: 0.9 });
      this._noise(t, 1.0, { type: 'lowpass', f0: 4000, f1: 60, q: 0.3, gain: 0.8 });
      this._noise(t, 0.08, { type: 'highpass', f0: 3000, gain: 0.5 });
    },
    tech(t) {
      this._tone(t, 0.08, { type: 'square', f0: 900, f1: 1400, gain: 0.06 });
    },
    move(t) { this._tone(t, 0.05, { type: 'square', f0: 660, f1: 680, gain: 0.04 }); },
    ok(t) {
      this._tone(t, 0.08, { type: 'square', f0: 660, f1: 660, gain: 0.05 });
      this._tone(t + 0.07, 0.12, { type: 'square', f0: 990, f1: 990, gain: 0.05 });
    },
    back(t) { this._tone(t, 0.1, { type: 'square', f0: 440, f1: 300, gain: 0.05 }); },
    lock(t) {
      this._tone(t, 0.12, { type: 'square', f0: 523, f1: 523, gain: 0.05 });
      this._tone(t + 0.06, 0.2, { type: 'square', f0: 1046, f1: 1046, gain: 0.05 });
      this._noise(t, 0.15, { type: 'bandpass', f0: 2000, f1: 5000, q: 2, gain: 0.1 });
    },
    beep(t) { this._tone(t, 0.15, { type: 'square', f0: 440, f1: 440, gain: 0.06 }); },
    go(t) {
      this._tone(t, 0.4, { type: 'square', f0: 880, f1: 880, gain: 0.07 });
      this._tone(t, 0.4, { type: 'sawtooth', f0: 440, f1: 445, gain: 0.04 });
    },
  },
};

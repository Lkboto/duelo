'use strict';
// ─────────────────────────────────────────────────────────────
//  Arranque y bucle principal: lógica a 60 Hz fijos, render a la
//  frecuencia de la pantalla con interpolación, cámara lenta real.
// ─────────────────────────────────────────────────────────────

const App = {
  canvas: null, ctx: null, w: 1280, h: 720, dpr: 1,
  match: null,        // partida en juego
  bg: null,           // partida de fondo (bots peleando detrás de los menús)
  lastCfg: null,
  acc: 0, bgAcc: 0, last: 0, alpha: 0,
  paused: false,

  init() {
    loadSettings();
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.tabIndex = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    Input.init(this.canvas);
    UI.init();
    const unlock = () => { Sfx.init(); Sfx.resume(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.startAttract();
    // enlace directo a una sala: ?sala=CODIGO
    const code = new URLSearchParams(location.search).get('sala');
    if (location.hash === '#espectador') setTimeout(() => this.spectate(), 300);
    if (code) { UI.show('online'); UI.resetOnlineBox(); UI.netStatus('Pulsa «Unirse» para entrar en la sala ' + code.toUpperCase()); }
    window.addEventListener('beforeunload', () => { if (Net.t) Net.close(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.match && this.match.mode !== 'online' && UI.cur === 'fight') this.pause();
    });
    requestAnimationFrame((t) => { this.last = t; this.loop(t); });
  },

  resize() {
    this.dpr = Math.min(this.maxDpr || 2, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  },

  toggleFullscreen() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) { UI.toast('Tu navegador no permite pantalla completa aquí'); }
  },

  // partida de exhibición detrás del menú
  startAttract() {
    const r = VISUAL_RNG;
    const a = r.pick(CHARACTERS).id;
    let b = r.pick(CHARACTERS).id;
    if (b === a) b = CHARACTERS[(CHARACTERS.findIndex((c) => c.id === a) + 1) % CHARACTERS.length].id;
    this.bg = new Match({
      mode: 'attract', stage: r.pick(STAGES), firstTo: 3,
      players: [{ charId: a, source: 'bot', level: 'hard', slot: 0 }, { charId: b, source: 'bot', level: 'hard', slot: 1 }],
    });
    this.bgAcc = 0;
  },

  startMatch(cfg) {
    this.lastCfg = cfg;
    const def = STAGES.find((s) => s.id === cfg.stage) || STAGES[0];
    const m = new Match({
      mode: cfg.mode, stage: def, firstTo: cfg.firstTo, seed: cfg.seed, players: cfg.players,
      onEnd: (champ, mm) => this.matchEnded(champ, mm),
    });
    if (cfg.mode === 'training') m.fighters.forEach((F) => { if (F.bot) F.dummy = true; });
    this.match = m;
    this.acc = 0; this.paused = false;
    this.bg = null;
    UI.show('fight');
    this.canvas.focus({ preventScroll: true });
    Sfx.init(); Sfx.resume();
    return m;
  },

  startOnline(cfg) {
    const me = Net.role === 'host' ? 0 : 1;
    const tags = me === 0 ? ['TÚ', 'RIVAL'] : ['RIVAL', 'TÚ'];
    const players = cfg.chars.map((charId, i) => ({ charId, source: 'net', slot: i, tag: tags[i], team: i }));
    UI.sel.lastPlayers = players;
    const m = this.startMatch({ mode: 'online', stage: cfg.stage, seed: cfg.seed, firstTo: cfg.firstTo, players });
    Net.begin(m, me, cfg.delay, cfg.window != null ? cfg.window : ROLLBACK_WINDOW);
  },

  stopMatch() {
    this.spectating = false;
    if (this.match && this.match.mode === 'online') Net.end();
    this.match = null; this.paused = false;
    if (!this.bg) this.startAttract();
  },

  restart() {
    if (!this.lastCfg || this.lastCfg.mode === 'online') return;
    const cfg = Object.assign({}, this.lastCfg);
    // los bots aleatorios vuelven a sortear personaje
    if (UI.sel && UI.sel.slots) {
      cfg.players = cfg.players.map((p, i) => {
        const s = UI.sel.slots[i];
        if (s && s.kind === 'bot' && !s.charId) return Object.assign({}, p, { charId: VISUAL_RNG.pick(CHARACTERS).id });
        return p;
      });
    }
    this.startMatch(cfg);
  },

  pause() {
    if (!this.match) return;
    const online = this.match.mode === 'online';
    if (!online) this.match.paused = true;
    this.paused = true;
    const scr = UI.screens.pause;
    scr.querySelector('[data-p=restart]').hidden = online;
    scr.querySelector('[data-p=select]').hidden = online;
    scr.querySelector('h3').textContent = online ? 'Menú' : 'Pausa';
    Sfx.play('back');
    UI.show('pause');
  },
  resume() {
    if (!this.match) return;
    this.match.paused = false; this.paused = false;
    UI.show('fight');
    this.canvas.focus({ preventScroll: true });
  },

  // bots contra bots en bucle, con HUD completo
  spectate() {
    this.spectating = true;
    const r = VISUAL_RNG, a = r.pick(CHARACTERS).id;
    let b = r.pick(CHARACTERS).id;
    if (b === a) b = CHARACTERS[(CHARACTERS.findIndex((c) => c.id === a) + 1) % CHARACTERS.length].id;
    this.startMatch({ mode: 'bots', stage: r.pick(STAGES).id, firstTo: 2, players: [
      { charId: a, source: 'bot', level: 'hard', slot: 0, tag: 'CLAUDE A' },
      { charId: b, source: 'bot', level: 'hard', slot: 1, tag: 'CLAUDE B' }] });
  },
  matchEnded(champ, m) {
    if (this.spectating) { setTimeout(() => { if (this.match === m) this.spectate(); }, 3500); return; }
    // deja ver la cámara lenta del K.O. y después enseña los resultados
    setTimeout(() => { if (this.match === m) UI.showResults(champ, m); }, 900);
  },

  // ── bucle ──
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    Input.pollPads();
    UI.frame(dt);
    Input.clearMenu();

    const m = this.match;
    if (m) {
      if (m.mode === 'online' && Net.match === m) {
        this.alpha = Net.step(m, dt);
        const w = document.getElementById('wait-net');
        if (w) w.classList.toggle('show', Net.stall > 20);
      } else if (!m.paused) {
        this.alpha = this.stepFixed(m, dt, 'acc');
      }
    } else if (this.bg) {
      Sfx.silent++;
      try { this.stepFixed(this.bg, dt, 'bgAcc'); } finally { Sfx.silent--; }
    }
    this.render();
  },

  stepFixed(m, dt, accKey) {
    this[accKey] += dt;
    let n = 0;
    for (;;) {
      const stepLen = STEP / m.timeScale;
      if (this[accKey] < stepLen) break;
      this[accKey] -= stepLen;
      m.update();
      Input.endTick();
      if (++n >= 5) { this[accKey] = 0; break; }
      if (m !== this.match && m !== this.bg) break;
    }
    const a = this[accKey] / (STEP / m.timeScale);
    if (m === this.bg) this.bgAlpha = a;
    return clamp(a, 0, 1);
  },

  // si el render va lento de forma sostenida, baja la resolución interna
  watchPerf(ms) {
    this.perfAcc = (this.perfAcc || 0) + ms; this.perfN = (this.perfN || 0) + 1;
    if (this.perfN < 120) return;
    const avg = this.perfAcc / this.perfN;
    this.perfAcc = 0; this.perfN = 0;
    if (avg > 11 && (this.maxDpr || 2) > 1 && this.dpr > 1) { this.maxDpr = 1; this.resize(); }
    else if (avg > 14 && this.dpr === 1 && !this.lowRes) { this.lowRes = true; this.maxDpr = 0.75; this.resize(); }
  },
  render() {
    const t0 = performance.now();
    this._render();
    this.watchPerf(performance.now() - t0);
  },
  _render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const m = this.match || this.bg;
    if (!m) { ctx.fillStyle = '#0b0b12'; ctx.fillRect(0, 0, this.w, this.h); return; }
    const alpha = m === this.match ? this.alpha : clamp(this.bgAlpha || 0, 0, 1);
    m.draw(ctx, alpha, this.w, this.h);
    if (m.mode === 'online' && Net.match === m) this.drawNetInfo(ctx);
  },

  drawNetInfo(ctx) {
    ctx.save();
    ctx.font = '600 14px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const ping = Net.rtt ? Math.round(Net.rtt) + ' ms' : '—';
    const mode = Net.window > 0 ? `rollback ≤${Net.window}` : 'lockstep';
    ctx.fillText(`ONLINE · sala ${Net.code} · ping ${ping} · retardo ${Net.delay} (${Math.round(Net.delay * 1000 / 60)} ms) · ${mode}${Net.resyncs ? ' · resinc. ' + Net.resyncs : ''}`, 16, 24);
    ctx.restore();
  },
};

const boot = () => App.init();
if (document.fonts && document.fonts.ready) {
  // espera a las fuentes (máx. 1,5 s) para que los textos del canvas salgan bien
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(boot);
} else boot();

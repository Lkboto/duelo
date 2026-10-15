'use strict';
// ─────────────────────────────────────────────────────────────
//  Previsualizaciones: el personaje elegido enseña sus golpes en
//  bucle en la tarjeta de selección, y retratos estáticos.
// ─────────────────────────────────────────────────────────────

const SHOWCASE_STAGE = {
  id: 'showcase', name: 'Showcase', center: [0, -60],
  plats: [{ x: -30000, y: 0, w: 60000, h: 600 }],
  spawns: [[0, 0]],
  blast: { x: -40000, y: -40000, w: 80000, h: 80000 },
  drawBg(ctx, cam) {
    ctx.clearRect(0, 0, cam.w, cam.h);
  },
  drawPlats(ctx) {
    // suelo: línea con brillo que se desvanece a los lados
    const g = ctx.createLinearGradient(-500, 0, 500, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-500, 0, 1000, 2);
  },
};

// Secuencia de demostración: combos, fuertes, habilidades y aire
const SHOW_SEQ = [
  { home: true },
  { press: 'light' }, { wait: 9 }, { press: 'light' }, { wait: 10 }, { press: 'light' }, { wait: 46 },
  { press: 'heavy' }, { wait: 50 },
  { home: true },
  { press: 'skill1' }, { wait: 70 },
  { home: true },
  { hold: 'up', press: 'heavy', for: 6 }, { wait: 46 },
  { press: 'jump', for: 12 }, { wait: 10 }, { press: 'light' }, { wait: 22 }, { press: 'heavy' }, { wait: 60 },
  { home: true },
  { press: 'skill2' }, { wait: 100 },
  { home: true },
  { hold: 'down', press: 'heavy', for: 6 }, { wait: 50 },
  { press: 'jump', for: 12 }, { wait: 14 }, { hold: 'down', press: 'heavy', for: 4 }, { wait: 70 },
  { home: true },
  { press: 'dash', dir: -1 }, { wait: 26 }, { press: 'dash', dir: 1 }, { wait: 50 },
  { idle: 70 },
];

class Showcase {
  constructor(canvas, facing = 1) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.facing = facing;
    this.charId = null;
    this.match = null;
    this.acc = 0;
    this.alpha = 0;
    this.color = null;
  }
  setChar(id, color) {
    if (id === this.charId && color === this.color) return;
    this.charId = id; this.color = color || null;
    if (!id) { this.match = null; return; }
    this.match = new Match({ mode: 'showcase', stage: SHOWCASE_STAGE, seed: 7, players: [{ charId: id, source: 'script', slot: 0 }] });
    const F = this.F = this.match.fighters[0];
    if (color) { F.color = color; F.shade = mixColor(color, '#000000', 0.35); }
    F.reset(0, 0, this.facing);
    F.idleT = 0;
    this.match.cam.x = 0; this.match.cam.y = -62;
    this.seqI = 0; this.waitT = 30; this.holdT = {}; this.homeT = 0; this.idleT = 0;
    this.acc = 0;
  }
  script() {
    const F = this.F, c = F.ctrl;
    c.clear();
    for (const k in this.holdT) if (this.holdT[k] > 0) { c.held[k] = true; this.holdT[k]--; }
    if (this.waitT > 0) { this.waitT--; return; }
    if (this.idleT > 0) { this.idleT--; return; }
    const step = SHOW_SEQ[this.seqI];
    if (step.home) {
      // vuelve al centro andando y mira al frente
      const busy = F.state !== 'ground' && F.state !== 'land';
      if (busy && this.homeT < 160) { this.homeT++; return; }
      if (Math.abs(F.x) > 14 && this.homeT < 160) {
        this.homeT++;
        const d = -sign(F.x);
        if (Math.abs(F.x) < 40 && sign(F.vx) === d) return;   // deja que frene
        c.held[d > 0 ? 'right' : 'left'] = true;
        return;
      }
      if (Math.abs(F.vx) > 0.5 && this.homeT < 160) { this.homeT++; return; }
      this.homeT = 0;
      F.facing = this.facing;
      this.next(); return;
    }
    if (step.wait) { this.waitT = step.wait; this.next(); return; }
    if (step.idle) { this.idleT = step.idle; this.next(); return; }
    if (step.press) {
      const dir = (step.dir || 0) * this.facing;
      if (dir) { c.held[dir > 0 ? 'right' : 'left'] = true; c.pressed[dir > 0 ? 'right' : 'left'] = true; }
      c.held[step.press] = true; c.pressed[step.press] = true;
      if (step.for) this.holdT[step.press] = step.for;
      if (step.hold) { c.held[step.hold] = true; this.holdT[step.hold] = (step.for || 4) + 2; }
      this.next();
    }
  }
  next() { this.seqI = (this.seqI + 1) % SHOW_SEQ.length; }
  update(dt) {
    if (!this.match) return;
    this.acc += Math.min(dt, 0.1);
    Sfx.silent++;
    try {
      let n = 0;
      while (this.acc >= STEP / this.match.timeScale && n < 4) {
        this.acc -= STEP / this.match.timeScale;
        this.script();
        this.match.update();
        n++;
      }
      if (n >= 4) this.acc = 0;
    } finally { Sfx.silent--; }
    this.alpha = this.acc / (STEP / this.match.timeScale);
  }
  draw() {
    const cv = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!this.match) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.match.draw(ctx, this.alpha, w, h);
  }
}

// Retrato estático (busto con el arma) para la cuadrícula
function drawPortrait(canvas, ch, opts = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 96, h = canvas.clientHeight || 96;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const F = new Fighter({ id: 0, slot: 0, char: ch, ctrl: new Controller('script') });
  F.reset(0, 0, 1);
  // pose de retrato: guardia un poco más marcada
  const p = mergePose(ch.stancePose, opts.pose || {});
  F.pose.snap(p);
  F.ground = 1;
  F.computeJoints(); copyJoints(F.Jprev, F.J);
  // tela asentada
  for (let i = 0; i < 40; i++) F.updateChains(F.J, -0.6);
  const z = h / 92;
  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  ctx.scale(z, z);
  ctx.translate(-F.J.neck.x + 2, -F.J.neck.y + 6);
  F.draw(ctx, 1, null);
  ctx.restore();
}

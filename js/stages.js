'use strict';
// ─────────────────────────────────────────────────────────────
//  Escenarios: plataformas, zonas de muerte y fondos con parallax
// ─────────────────────────────────────────────────────────────

// Generador pseudoaleatorio con semilla (fondos estables)
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

class Stage {
  constructor(def) {
    Object.assign(this, def);
    this.plats = def.plats.map((p) => Object.assign({ h: 14, dx: 0, dy: 0 }, p, { ox: p.x, oy: p.y, prevY: p.y }));
    this.time = 0;
    this.cx = def.center[0]; this.cy = def.center[1];
    this.solids = this.plats.filter((p) => !p.oneWay);
    if (def.setup) def.setup.call(this);
  }
  update() {
    this.time++;
    for (const p of this.plats) {
      p.prevY = p.y;
      if (!p.move) { p.dx = 0; p.dy = 0; continue; }
      const ph = (this.time / p.move.period) * TAU;
      const nx = p.ox + Math.sin(ph) * (p.move.ax || 0);
      const ny = p.oy + Math.sin(ph * (p.move.fy || 1)) * (p.move.ay || 0);
      p.dx = nx - p.x; p.dy = ny - p.y;
      p.x = nx; p.y = ny;
    }
    if (this.tick) this.tick();
  }
  solidAt(x, y) {
    for (const p of this.solids) if (x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) return p;
    return null;
  }
  // plataforma sólida más cercana (para que los bots vuelvan)
  nearestSolid(x) {
    let best = null, bd = Infinity;
    for (const p of this.solids) {
      const d = x < p.x ? p.x - x : x > p.x + p.w ? x - (p.x + p.w) : 0;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  // capa de parallax: dibuja en coordenadas "de mundo" desplazadas
  layer(ctx, cam, p, fn) {
    const z = lerp(cam.refZoom, cam.zoom, p);
    const camX = lerp(this.cx, cam.x, p), camY = lerp(this.cy, cam.y, p);
    ctx.save();
    ctx.translate(cam.w / 2, cam.h / 2);
    ctx.scale(z, z);
    ctx.translate(-camX, -camY);
    fn(ctx);
    ctx.restore();
  }
}

const STAGES = [];

// ═══════════════════ DOJO AL ANOCHECER ═══════════════════
STAGES.push({
  id: 'dojo', name: 'Dojo al anochecer', center: [800, 520],
  plats: [
    { x: 300, y: 700, w: 1000, h: 520, kind: 'wood' },
    { x: 425, y: 530, w: 210, oneWay: true },
    { x: 965, y: 530, w: 210, oneWay: true },
    { x: 695, y: 375, w: 210, oneWay: true },
  ],
  spawns: [[520, 700], [1080, 700], [690, 700], [910, 700]],
  blast: { x: -380, y: -480, w: 2360, h: 1760 },
  setup() {
    const r = seeded(7);
    this.mtn = []; for (let i = 0; i < 14; i++) this.mtn.push([i * 260 - 800, 560 - r() * 260]);
    this.trees = []; for (let i = 0; i < 26; i++) this.trees.push([r() * 3000 - 700, 0.7 + r() * 0.6]);
    this.petals = []; for (let i = 0; i < 46; i++) this.petals.push({ x: r() * 2400 - 400, y: r() * 1200 - 300, s: 2 + r() * 3, ph: r() * TAU, v: 0.4 + r() * 0.8 });
  },
  tick() {
    for (const p of this.petals) {
      p.x += Math.sin(this.time * 0.01 + p.ph) * 0.6 + 0.5 * p.v; p.y += p.v;
      if (p.y > 1200) { p.y = -300; p.x = Math.random() * 2400 - 400; }
      if (p.x > 2100) p.x = -400;
    }
  },
  drawBg(ctx, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, cam.h);
    g.addColorStop(0, '#140e2b'); g.addColorStop(0.45, '#40204a'); g.addColorStop(0.75, '#b5513e'); g.addColorStop(1, '#f08a46');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
    this.layer(ctx, cam, 0.05, (c) => {
      const gl = c.createRadialGradient(1180, 170, 10, 1180, 170, 260);
      gl.addColorStop(0, 'rgba(255,236,200,0.5)'); gl.addColorStop(1, 'rgba(255,236,200,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(1180, 170, 260, 0, TAU); c.fill();
      c.fillStyle = '#fbe9cf'; c.beginPath(); c.arc(1180, 170, 78, 0, TAU); c.fill();
    });
    this.layer(ctx, cam, 0.18, (c) => {
      c.fillStyle = '#3a1f3f';
      c.beginPath(); c.moveTo(-900, 1400);
      for (const [x, y] of this.mtn) c.lineTo(x, y + 120);
      c.lineTo(3000, 1400); c.closePath(); c.fill();
    });
    this.layer(ctx, cam, 0.38, (c) => {
      c.fillStyle = '#26152c';
      // pagoda
      const px = 1240, py = 640;
      c.fillRect(px - 8, py - 300, 16, 300);
      for (let i = 0; i < 4; i++) {
        const w = 150 - i * 28, y = py - 60 - i * 70;
        c.beginPath(); c.moveTo(px - w, y); c.quadraticCurveTo(px, y - 34, px + w, y); c.lineTo(px + w * 0.7, y + 14); c.lineTo(px - w * 0.7, y + 14); c.closePath(); c.fill();
        c.fillRect(px - w * 0.55, y + 10, w * 1.1, 46);
      }
      for (const [x, s] of this.trees) {
        c.beginPath(); c.moveTo(x, 760); c.lineTo(x + 6 * s, 600 - 80 * s); c.lineTo(x + 12 * s, 760); c.fill();
        c.beginPath(); c.arc(x + 6 * s, 600 - 90 * s, 46 * s, 0, TAU); c.fill();
      }
      c.fillRect(-1000, 700, 4000, 900);
    });
    this.layer(ctx, cam, 0.72, (c) => {
      // farolillos colgando
      c.strokeStyle = 'rgba(20,10,20,0.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-200, 160); c.quadraticCurveTo(800, 300, 1800, 160); c.stroke();
      for (let i = 0; i < 9; i++) {
        const t = i / 8, x = lerp(-100, 1700, t), y = 160 + Math.sin(t * Math.PI) * 110 + 30;
        const sw = Math.sin(this.time * 0.03 + i) * 4;
        const gl = c.createRadialGradient(x + sw, y, 2, x + sw, y, 60);
        gl.addColorStop(0, 'rgba(255,140,80,0.55)'); gl.addColorStop(1, 'rgba(255,140,80,0)');
        c.fillStyle = gl; c.beginPath(); c.arc(x + sw, y, 60, 0, TAU); c.fill();
        c.fillStyle = i % 2 ? '#ff5a3c' : '#ffb347';
        c.beginPath(); c.ellipse(x + sw, y, 12, 16, 0, 0, TAU); c.fill();
      }
    });
  },
  drawPlats(ctx) {
    for (const p of this.plats) {
      if (p.oneWay) {
        ctx.fillStyle = '#1f1410'; ctx.fillRect(p.x + 14, p.y + 6, 8, 40); ctx.fillRect(p.x + p.w - 22, p.y + 6, 8, 40);
        ctx.fillStyle = '#8a5a36'; ctx.fillRect(p.x, p.y, p.w, 10);
        ctx.fillStyle = '#c08552'; ctx.fillRect(p.x, p.y, p.w, 3);
        ctx.fillStyle = '#5a3a24'; ctx.fillRect(p.x - 6, p.y + 8, p.w + 12, 5);
      } else {
        const g = ctx.createLinearGradient(0, p.y, 0, p.y + 300);
        g.addColorStop(0, '#3b2a20'); g.addColorStop(1, '#120c0c');
        ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#7a5134'; ctx.fillRect(p.x, p.y, p.w, 18);
        ctx.fillStyle = '#b07a4c'; ctx.fillRect(p.x, p.y, p.w, 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
        for (let x = p.x + 60; x < p.x + p.w; x += 80) { ctx.beginPath(); ctx.moveTo(x, p.y + 4); ctx.lineTo(x, p.y + 18); ctx.stroke(); }
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let x = p.x + 40; x < p.x + p.w - 20; x += 160) ctx.fillRect(x, p.y + 18, 18, p.h);
      }
    }
  },
  drawFg(ctx) {
    ctx.fillStyle = 'rgba(255,170,190,0.85)';
    for (const p of this.petals) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.time * 0.03 + p.ph);
      ctx.beginPath(); ctx.ellipse(0, 0, p.s * 1.6, p.s, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  },
});

// ═══════════════════ AZOTEA NEÓN ═══════════════════
STAGES.push({
  id: 'azotea', name: 'Azotea neón', center: [810, 540],
  plats: [
    { x: 170, y: 720, w: 570, h: 700, kind: 'roof' },
    { x: 890, y: 660, w: 540, h: 760, kind: 'roof' },
    { x: 290, y: 555, w: 170, oneWay: true },
    { x: 1080, y: 500, w: 190, oneWay: true },
    { x: 740, y: 470, w: 150, oneWay: true, move: { ax: 120, period: 420 }, kind: 'girder' },
  ],
  spawns: [[400, 720], [1160, 660], [610, 720], [1320, 660]],
  blast: { x: -420, y: -480, w: 2460, h: 1800 },
  setup() {
    const r = seeded(21);
    this.sky = [];
    for (let L = 0; L < 2; L++) {
      const arr = []; let x = -1200;
      while (x < 3000) {
        const w = 80 + r() * 160, h = 200 + r() * (L ? 380 : 520);
        const wins = [];
        for (let wy = 30; wy < h - 20; wy += 26) for (let wx = 14; wx < w - 14; wx += 22) if (r() < 0.35) wins.push([wx, wy, r() < 0.15]);
        arr.push({ x, w, h, wins, neon: r() < 0.3 ? (r() < 0.5 ? '#ff3fa4' : '#2ee6d6') : null });
        x += w + 10 + r() * 40;
      }
      this.sky.push(arr);
    }
    this.rain = []; for (let i = 0; i < 90; i++) this.rain.push({ x: r(), y: r(), v: 0.6 + r() * 0.6 });
  },
  tick() { for (const d of this.rain) { d.y += 0.018 * d.v; d.x -= 0.004 * d.v; if (d.y > 1) { d.y = 0; d.x = Math.random() * 1.2; } } },
  drawBg(ctx, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, cam.h);
    g.addColorStop(0, '#05071a'); g.addColorStop(0.6, '#1c0f3d'); g.addColorStop(1, '#4a1747');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
    const layers = [[0.16, '#0d0b25', 1040], [0.4, '#130f30', 980]];
    layers.forEach(([p, col, base], L) => {
      this.layer(ctx, cam, p, (c) => {
        for (const b of this.sky[L]) {
          c.fillStyle = col; c.fillRect(b.x, base - b.h, b.w, b.h + 900);
          c.fillStyle = L ? 'rgba(255,214,120,0.55)' : 'rgba(150,170,255,0.35)';
          for (const [wx, wy, lit] of b.wins) { c.fillStyle = lit ? 'rgba(255,90,190,0.7)' : (L ? 'rgba(255,214,120,0.45)' : 'rgba(150,170,255,0.3)'); c.fillRect(b.x + wx, base - b.h + wy, 10, 12); }
          if (b.neon) {
            c.shadowColor = b.neon; c.shadowBlur = 18; c.fillStyle = b.neon;
            c.fillRect(b.x + 6, base - b.h - 4, b.w - 12, 4); c.shadowBlur = 0;
          }
        }
      });
    });
  },
  drawPlats(ctx) {
    for (const p of this.plats) {
      if (p.kind === 'girder') {
        ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x + p.w / 2, p.y); ctx.lineTo(p.x + p.w / 2, p.y - 600); ctx.stroke();
        ctx.fillStyle = '#e8a33d'; ctx.fillRect(p.x, p.y, p.w, 14);
        ctx.fillStyle = '#1a1a24';
        for (let x = p.x + 6; x < p.x + p.w - 6; x += 18) { ctx.beginPath(); ctx.moveTo(x, p.y + 2); ctx.lineTo(x + 9, p.y + 12); ctx.lineTo(x + 12, p.y + 12); ctx.lineTo(x + 3, p.y + 2); ctx.fill(); }
      } else if (p.oneWay) {
        ctx.fillStyle = '#3a3d52'; ctx.fillRect(p.x + 10, p.y, p.w - 20, 60);
        ctx.fillStyle = '#555a76'; ctx.fillRect(p.x, p.y, p.w, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = p.x + 20; x < p.x + p.w - 20; x += 12) ctx.fillRect(x, p.y + 18, 6, 34);
      } else {
        const g = ctx.createLinearGradient(0, p.y, 0, p.y + 400);
        g.addColorStop(0, '#2a2c3c'); g.addColorStop(1, '#0a0a14');
        ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#4b4f68'; ctx.fillRect(p.x, p.y, p.w, 14);
        ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 14; ctx.fillStyle = '#ff3fa4';
        ctx.fillRect(p.x, p.y + 14, p.w, 3); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,214,120,0.18)';
        for (let y = p.y + 60; y < p.y + p.h; y += 70) for (let x = p.x + 30; x < p.x + p.w - 30; x += 60) if ((x * 7 + y * 3) % 5 < 2) ctx.fillRect(x, y, 24, 30);
      }
    }
  },
  drawFg(ctx, cam) {
    ctx.save(); if (cam.base) ctx.setTransform(cam.base); else ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(160,180,255,0.18)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const d of this.rain) { const x = d.x * cam.w, y = d.y * cam.h; ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 22); }
    ctx.stroke(); ctx.restore();
  },
});

// ═══════════════════ ISLAS FLOTANTES ═══════════════════
STAGES.push({
  id: 'islas', name: 'Islas flotantes', center: [800, 520],
  plats: [
    { x: 460, y: 700, w: 680, h: 120, kind: 'island' },
    { x: 140, y: 585, w: 210, h: 60, kind: 'island' },
    { x: 1250, y: 585, w: 210, h: 60, kind: 'island' },
    { x: 555, y: 520, w: 170, oneWay: true },
    { x: 875, y: 520, w: 170, oneWay: true },
    { x: 715, y: 370, w: 170, oneWay: true, move: { ay: 22, period: 300 } },
  ],
  spawns: [[600, 700], [1000, 700], [245, 585], [1355, 585]],
  blast: { x: -400, y: -500, w: 2400, h: 1720 },
  setup() {
    const r = seeded(99);
    this.clouds = []; for (let i = 0; i < 18; i++) this.clouds.push({ x: r() * 3600 - 1000, y: 100 + r() * 700, s: 0.5 + r() * 1.3, L: r() < 0.5 ? 0 : 1 });
    this.rocks = []; for (let i = 0; i < 9; i++) this.rocks.push({ x: r() * 3000 - 700, y: 200 + r() * 700, s: 0.4 + r() * 0.9, ph: r() * TAU });
  },
  tick() { for (const c of this.clouds) { c.x += 0.15 * c.s; if (c.x > 2700) c.x = -1100; } },
  drawBg(ctx, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, cam.h);
    g.addColorStop(0, '#2b5f9e'); g.addColorStop(0.55, '#79a8d4'); g.addColorStop(0.85, '#f0b98a'); g.addColorStop(1, '#f5d6a5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
    const cloud = (c, x, y, s, col) => {
      c.fillStyle = col;
      for (const [dx, dy, r] of [[0, 0, 50], [50, 10, 40], [-50, 12, 38], [24, -24, 36], [-22, -18, 32]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, TAU); c.fill(); }
    };
    this.layer(ctx, cam, 0.1, (c) => { for (const cl of this.clouds) if (cl.L === 0) cloud(c, cl.x, cl.y, cl.s, 'rgba(255,255,255,0.45)'); });
    this.layer(ctx, cam, 0.3, (c) => {
      for (const rk of this.rocks) {
        const y = rk.y + Math.sin(this.time * 0.01 + rk.ph) * 10, s = rk.s;
        c.fillStyle = '#6d7fa3';
        c.beginPath(); c.moveTo(rk.x - 70 * s, y); c.lineTo(rk.x + 70 * s, y); c.lineTo(rk.x + 20 * s, y + 110 * s); c.lineTo(rk.x - 10 * s, y + 130 * s); c.closePath(); c.fill();
        c.fillStyle = '#8fb0a0'; c.fillRect(rk.x - 70 * s, y - 8 * s, 140 * s, 10 * s);
      }
    });
    this.layer(ctx, cam, 0.55, (c) => { for (const cl of this.clouds) if (cl.L === 1) cloud(c, cl.x, cl.y + 300, cl.s * 1.2, 'rgba(255,248,240,0.6)'); });
  },
  drawPlats(ctx) {
    for (const p of this.plats) {
      if (p.oneWay) {
        ctx.fillStyle = '#d9c7a3'; ctx.fillRect(p.x, p.y, p.w, 10);
        ctx.fillStyle = '#a8916a'; ctx.fillRect(p.x, p.y + 10, p.w, 4);
        ctx.fillStyle = 'rgba(80,60,40,0.4)'; ctx.fillRect(p.x + 8, p.y + 14, 6, 16); ctx.fillRect(p.x + p.w - 14, p.y + 14, 6, 16);
      } else {
        // roca flotante
        ctx.fillStyle = '#5b4a3f';
        ctx.beginPath(); ctx.moveTo(p.x, p.y + 8); ctx.lineTo(p.x + p.w, p.y + 8);
        ctx.lineTo(p.x + p.w * 0.82, p.y + p.h * 1.4); ctx.lineTo(p.x + p.w * 0.55, p.y + p.h * 2.6); ctx.lineTo(p.x + p.w * 0.35, p.y + p.h * 1.9); ctx.lineTo(p.x + p.w * 0.12, p.y + p.h * 1.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3f332c';
        ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.55, p.y + 8); ctx.lineTo(p.x + p.w * 0.82, p.y + p.h * 1.4); ctx.lineTo(p.x + p.w * 0.55, p.y + p.h * 2.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6fbf5a'; ctx.fillRect(p.x - 4, p.y, p.w + 8, 14);
        ctx.fillStyle = '#9be07f'; ctx.fillRect(p.x - 4, p.y, p.w + 8, 4);
        ctx.fillStyle = '#58a046';
        for (let x = p.x; x < p.x + p.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, p.y + 14); ctx.lineTo(x + 6, p.y + 24); ctx.lineTo(x + 12, p.y + 14); ctx.fill(); }
      }
    }
  },
});

'use strict';
// ─────────────────────────────────────────────────────────────
//  Efectos: chispas, polvo, ondas, destellos, textos flotantes,
//  líneas de impacto, rayos y estelas de armas.
// ─────────────────────────────────────────────────────────────

const FXProto = {
  max: 900,
  alpha: 1,          // interpolación entre ticks (lo fija el render)

  clear() { this.parts.length = 0; this.texts.length = 0; },

  add(p) {
    if (this.parts.length > this.max) this.parts.shift();
    p.age = 0;
    this.parts.push(p);
    return p;
  },

  // ── emisores ──
  sparks(x, y, dirX, dirY, color, n = 10, power = 1) {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = base + rand(-0.9, 0.9) * (i % 3 === 0 ? 1.6 : 1);
      const sp = rand(5, 15) * power;
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randi(10, 20), color, w: rand(1.8, 3.4) * Math.min(power, 1.6), drag: 0.86, g: 0.25 });
    }
    // chispas blancas al centro
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      const a = rand(0, TAU), sp = rand(3, 9) * power;
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randi(6, 11), color: '#ffffff', w: 2, drag: 0.82, g: 0 });
    }
  },
  hitFlash(x, y, color, size = 1) {
    this.add({ k: 'flash', x, y, life: 7, r: 46 * size, color });
    this.add({ k: 'ring', x, y, life: 12, r0: 8, r1: 60 * size, w: 5 * size, color: '#ffffff' });
  },
  impactLines(x, y, color, n = 14, size = 1) {
    this.add({ k: 'lines', x, y, life: 9, n, size, color, seed: Math.random() * 100 });
  },
  dust(x, y, n = 6, spread = 1, dir = 0) {
    for (let i = 0; i < n; i++) {
      this.add({
        k: 'dust', x: x + rand(-8, 8) * spread, y: y - rand(0, 4),
        vx: rand(-1.6, 1.6) * spread + dir * rand(1, 3), vy: rand(-1.6, -0.2),
        life: randi(18, 32), r: rand(4, 9), grow: rand(0.25, 0.5), color: 'rgba(220,214,206,',
      });
    }
  },
  landDust(x, y, power) {
    const n = Math.round(4 + power * 6);
    for (let i = 0; i < n; i++) {
      const d = i % 2 ? 1 : -1;
      this.add({ k: 'dust', x: x + d * rand(2, 10), y, vx: d * rand(1.5, 4.5) * power, vy: rand(-1.2, -0.1), life: randi(16, 28), r: rand(3, 7), grow: rand(0.3, 0.6), color: 'rgba(220,214,206,' });
    }
  },
  ring(x, y, color, r1 = 80, life = 16, w = 4) {
    this.add({ k: 'ring', x, y, life, r0: 6, r1, w, color });
  },
  shockwave(x, y, color, dir) {
    this.add({ k: 'wave', x, y, life: 22, dir, color });
  },
  smoke(x, y, color = 'rgba(40,30,60,', n = 16) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(0.5, 3.5);
      this.add({ k: 'dust', x: x + rand(-6, 6), y: y + rand(-30, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: randi(24, 40), r: rand(7, 14), grow: 0.4, color });
    }
  },
  debris(x, y, color, n = 8, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(4, 11) * power;
      this.add({ k: 'chunk', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randi(26, 46), s: rand(2.5, 5.5), rot: rand(0, TAU), vr: rand(-0.4, 0.4), color, g: 0.5 });
    }
  },
  bolt(x1, y1, x2, y2, color, life = 10, w = 4) {
    this.add({ k: 'bolt', x: x1, y: y1, x2, y2, life, color, w, seed: Math.random() * 1000 });
  },
  slashArc(x, y, r, a0, a1, color, life = 12, w = 10) {
    this.add({ k: 'arc', x, y, r, a0, a1, life, color, w });
  },
  speedLine(x, y, vx, vy, color) {
    this.add({ k: 'spark', x, y, vx, vy, life: 10, color, w: 1.5, drag: 0.9, g: 0 });
  },
  blast(x, y, nx, ny, color) {
    // explosión al salir del mapa (estilo ring-out)
    this.add({ k: 'blast', x, y, nx, ny, life: 40, color });
    for (let i = 0; i < 30; i++) {
      const a = Math.atan2(-ny, -nx) + rand(-0.8, 0.8), sp = rand(8, 24);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: randi(16, 30), color: i % 3 ? color : '#ffffff', w: rand(2, 5), drag: 0.9, g: 0 });
    }
  },

  text(x, y, str, color = '#fff', size = 22, life = 50, opts = {}) {
    this.texts.push({ x, y, str, color, size, life, age: 0, vy: opts.vy == null ? -1.2 : opts.vy, pop: opts.pop == null ? 1 : opts.pop, follow: opts.follow || null, key: opts.key || null });
  },
  // contador de combo pegado a un luchador; reemplaza el anterior
  combo(fighter, hits, dmg) {
    const key = 'combo' + fighter.id;
    let t = this.texts.find((q) => q.key === key);
    if (!t) {
      t = { key, follow: fighter, age: 0, vy: 0, pop: 1, size: 30, color: fighter.color, x: 0, y: 0 };
      this.texts.push(t);
    }
    t.str = hits + ' GOLPES'; t.sub = Math.round(dmg) + ' daño';
    t.age = 0; t.life = 70; t.punch = 1;
  },

  update() {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age++;
      if (p.age >= p.life) { ps.splice(i, 1); continue; }
      if (p.vx != null) {
        p.ox = p.x; p.oy = p.y;
        if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
        p.vy += p.g || 0;
        p.x += p.vx; p.y += p.vy;
      }
      if (p.k === 'dust') { p.r += p.grow; p.vx *= 0.92; p.vy *= 0.94; }
      if (p.k === 'chunk') p.rot += p.vr;
    }
    const ts = this.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      t.age++;
      if (t.age >= t.life) { ts.splice(i, 1); continue; }
      if (t.punch) t.punch *= 0.82;
      if (!t.follow) t.y += t.vy * Math.max(0, 1 - t.age / t.life);
    }
  },

  draw(ctx) {
    const al = this.alpha;
    for (const p of this.parts) {
      const u = Math.min(1, (p.age + al) / p.life), a = 1 - u;
      // posición interpolada (fluido a 120/144 Hz y en cámara lenta)
      const X = p.ox == null ? p.x : p.ox + (p.x - p.ox) * al;
      const Y = p.oy == null ? p.y : p.oy + (p.y - p.oy) * al;
      switch (p.k) {
        case 'spark': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = p.color; ctx.lineWidth = p.w * a + 0.4; ctx.lineCap = 'round';
          ctx.globalAlpha = Math.min(1, a * 1.5);
          ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - p.vx * 1.8, Y - p.vy * 1.8); ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'dust': {
          ctx.fillStyle = p.color + (0.5 * a * a).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(X, Y, p.r + p.grow * al, 0, TAU); ctx.fill();
          break;
        }
        case 'flash': {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (0.6 + u * 0.6));
          g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
          g.addColorStop(0.35, rgba(p.color, 0.6 * a));
          g.addColorStop(1, rgba(p.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + u * 0.6), 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'ring': {
          const r = lerp(p.r0, p.r1, Ease.outCubic(u));
          ctx.strokeStyle = p.color.startsWith('#') ? rgba(p.color, a) : p.color;
          ctx.lineWidth = p.w * a + 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
          break;
        }
        case 'lines': {
          ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineCap = 'round';
          for (let i = 0; i < p.n; i++) {
            const ang = (i / p.n) * TAU + Math.sin(p.seed + i * 7.1) * 0.3;
            const r0 = (30 + 30 * u) * p.size, r1 = r0 + (40 + 30 * Math.abs(Math.sin(p.seed + i))) * p.size * a;
            ctx.lineWidth = (3 + (i % 3)) * a;
            ctx.beginPath();
            ctx.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0);
            ctx.lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1);
            ctx.stroke();
          }
          break;
        }
        case 'wave': {
          // onda de choque que corre por el suelo
          const r = 20 + 160 * Ease.outCubic(u);
          ctx.strokeStyle = rgba(p.color, a); ctx.lineWidth = 6 * a + 1;
          for (const d of p.dir ? [p.dir] : [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(p.x + d * r * 0.2, p.y, r, r * 0.28, 0, d > 0 ? -Math.PI / 2 : Math.PI / 2, d > 0 ? Math.PI / 2 : Math.PI * 1.5, d < 0);
            ctx.stroke();
          }
          break;
        }
        case 'chunk': {
          ctx.save(); ctx.translate(X, Y); ctx.rotate(p.rot + p.vr * al);
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = p.color; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
          ctx.restore();
          break;
        }
        case 'bolt': {
          ctx.globalCompositeOperation = 'lighter';
          const segs = 9;
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass ? `rgba(255,255,255,${a})` : rgba(p.color, a);
            ctx.lineWidth = pass ? p.w * 0.4 : p.w * 1.8;
            ctx.beginPath(); ctx.moveTo(p.x, p.y);
            for (let i = 1; i <= segs; i++) {
              const t = i / segs;
              const jit = i === segs ? 0 : Math.sin(p.seed + i * 13.7 + p.age * 3.1) * 16;
              const dx = p.x2 - p.x, dy = p.y2 - p.y, L = Math.hypot(dx, dy) || 1;
              ctx.lineTo(p.x + dx * t + (-dy / L) * jit, p.y + dy * t + (dx / L) * jit);
            }
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'arc': {
          ctx.globalCompositeOperation = 'lighter';
          const grow = Ease.outCubic(Math.min(1, u * 2.5));
          ctx.strokeStyle = rgba(p.color, a); ctx.lineWidth = p.w * a + 1; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, p.a0, lerp(p.a0, p.a1, grow), p.a1 < p.a0); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = p.w * 0.35 * a + 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, p.a0, lerp(p.a0, p.a1, grow), p.a1 < p.a0); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'blast': {
          ctx.globalCompositeOperation = 'lighter';
          const len = 520 * Ease.outCubic(Math.min(1, u * 3)), wid = 120 * a;
          const ang = Math.atan2(-p.ny, -p.nx);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.3, rgba(p.color, 0.8 * a)); g.addColorStop(1, rgba(p.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, -wid * 0.2); ctx.lineTo(len, -wid); ctx.lineTo(len, wid); ctx.lineTo(0, wid * 0.2); ctx.closePath(); ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }
  },

  drawTexts(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const u = t.age / t.life;
      let x = t.x, y = t.y;
      if (t.follow) { x = t.follow.rx; y = t.follow.ry - 140; }
      const pop = t.pop ? 1 + Ease.outBack(Math.min(1, t.age / 8)) * 0 + (t.age < 6 ? (1 - t.age / 6) * 0.5 : 0) : 1;
      const sc = pop + (t.punch || 0) * 0.5;
      const alpha = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = alpha;
      ctx.font = `${t.size}px "Bebas Neue", Impact, sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(8,8,14,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color; ctx.fillText(t.str, 0, 0);
      if (t.sub) {
        ctx.font = `600 ${Math.round(t.size * 0.48)}px "Barlow Condensed", sans-serif`;
        ctx.lineWidth = 4; ctx.strokeText(t.sub, 0, t.size * 0.62);
        ctx.fillStyle = '#ffffff'; ctx.fillText(t.sub, 0, t.size * 0.62);
      }
      ctx.restore();
    }
  },
};

function makeFX() {
  const o = Object.create(FXProto);
  o.parts = []; o.texts = [];
  return o;
}
// FX apunta al sistema de efectos activo (la partida o una previsualización)
var FX = makeFX();

// Estela del arma: guarda (mano, ángulo, largo) de los últimos ticks y la
// dibuja como un arco subdividido, así un tajo rápido se ve curvo y continuo.
class Trail {
  constructor(maxAge = 6) { this.maxAge = maxAge; this.pts = []; this.seg = 0; }
  cut() { this.seg++; }          // el siguiente golpe empieza una estela nueva
  push(hx, hy, ang, len, inner) {
    this.pts.push({ hx, hy, ang, len, inner, age: 0, seg: this.seg });
    if (this.pts.length > 12) this.pts.shift();
  }
  age() {
    for (const p of this.pts) p.age++;
    while (this.pts.length && this.pts[0].age > this.maxAge) this.pts.shift();
  }
  clear() { this.pts.length = 0; }
  // head: muestra interpolada que sustituye a la más reciente (render suave)
  draw(ctx, color, s = 1, head) {
    let P = this.pts;
    if (P.length < 1) return;
    if (head && P[P.length - 1].age === 0) P = P.slice(0, -1).concat([Object.assign({}, P[P.length - 1], head)]);
    if (P.length < 2) return;
    // subdivisión angular (máx. ~8° por tramo)
    const S = [];
    for (let i = 0; i < P.length; i++) {
      const b = P[i];
      if (i === 0) { S.push(b); continue; }
      const a = P[i - 1];
      if (a.seg !== b.seg) { S.push(Object.assign({ brk: true }, b)); continue; }
      const d = angDiff(a.ang, b.ang);
      const n = Math.max(1, Math.min(14, Math.ceil(Math.abs(d) / (8 * DEG))));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        S.push({ hx: lerp(a.hx, b.hx, t), hy: lerp(a.hy, b.hy, t), ang: a.ang + d * t, len: lerp(a.len, b.len, t), inner: lerp(a.inner, b.inner, t), age: lerp(a.age, b.age, t), seg: b.seg });
      }
    }
    const tip = (q) => [q.hx + Math.cos(q.ang) * q.len, q.hy + Math.sin(q.ang) * q.len];
    const inn = (q) => [q.hx + Math.cos(q.ang) * q.len * q.inner, q.hy + Math.sin(q.ang) * q.len * q.inner];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const N = S.length;
    for (let i = 1; i < N; i++) {
      const a = S[i - 1], b = S[i];
      if (b.brk) continue;
      const t = i / (N - 1);
      const fade = clamp(1 - b.age / (this.maxAge + 1), 0, 1);
      const al = 0.62 * Math.pow(t, 1.3) * fade;
      if (al < 0.01) continue;
      const [ax, ay] = tip(a), [bx, by] = tip(b), [aix, aiy] = inn(a), [bix, biy] = inn(b);
      ctx.fillStyle = rgba(color, al);
      ctx.beginPath(); ctx.moveTo(aix, aiy); ctx.lineTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bix, biy); ctx.closePath(); ctx.fill();
    }
    // filo brillante que recorre la punta
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < N; i++) {
      const a = S[i - 1], b = S[i];
      if (b.brk) continue;
      const t = i / (N - 1);
      const fade = clamp(1 - b.age / (this.maxAge + 1), 0, 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * t * fade})`;
      ctx.lineWidth = (1 + 2.6 * t) * s;
      const [ax, ay] = tip(a), [bx, by] = tip(b);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.restore();
  }
}

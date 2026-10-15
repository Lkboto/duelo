// Dibujo del combate en un <canvas>. Solo lee el estado de la partida.

import { STAGE_W, STAGE_H, GROUND, worldHitbox, projBox } from './sim.js';
import { controlName } from './input.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - t, 3);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.t = 0;
    this.trail = [null, null]; // barra de vida "fantasma"
    this.stars = Array.from({ length: 60 }, (_, i) => ({
      x: (i * 157.3) % STAGE_W, y: (i * 61.7) % 260, r: (i % 3) * 0.5 + 0.5, p: i * 0.7,
    }));
  }

  consume(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const n = 8 + e.strength * 6;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU;
            const s = 3 + Math.random() * (4 + e.strength * 3);
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 18 + Math.random() * 10, max: 28, color: i % 3 ? '#fff3b0' : '#ff9a3c', kind: 'spark' });
          }
          this.particles.push({ x: e.x, y: e.y, life: 10, max: 10, r: 18 + e.strength * 14, kind: 'ring', color: '#ffffff' });
          this.texts.push({ text: String(e.damage), x: e.x + (Math.random() * 20 - 10), y: e.y - 10, life: 45, max: 45, color: '#ffe08a', size: 18 + e.strength * 4 });
          if (e.combo >= 2) this.texts.push({ text: `${e.combo} GOLPES`, x: e.x, y: e.y - 45, life: 40, max: 40, color: '#ffffff', size: 16 });
          this.shake = Math.max(this.shake, 3 + e.strength * 3);
          break;
        }
        case 'block':
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * TAU;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 14, max: 14, color: '#8fd3ff', kind: 'spark' });
          }
          this.particles.push({ x: e.x, y: e.y, life: 8, max: 8, r: 26, kind: 'ring', color: '#8fd3ff' });
          this.shake = Math.max(this.shake, 2);
          break;
        case 'dust':
          for (let i = 0; i < 4; i++) {
            this.particles.push({ x: e.x + Math.random() * 20 - 10, y: e.y - 2, vx: Math.random() * 2 - 1, vy: -Math.random() * 1.5, life: 22, max: 22, color: 'rgba(200,190,170,0.5)', kind: 'dust', r: 4 + Math.random() * 5 });
          }
          break;
        case 'slam':
          this.shake = Math.max(this.shake, 8);
          for (let i = 0; i < 16; i++) {
            this.particles.push({ x: e.x + Math.random() * 60 - 30, y: e.y, vx: Math.random() * 6 - 3, vy: -2 - Math.random() * 6, life: 30, max: 30, color: '#8a7358', kind: 'rock', r: 2 + Math.random() * 4, g: 0.35 });
          }
          break;
        case 'text':
          this.texts.push({ text: e.text, x: e.x, y: e.y, life: 60, max: 60, color: e.color, size: 22, bold: true });
          break;
        case 'roundEnd':
          this.shake = Math.max(this.shake, 10);
          break;
      }
    }
    events.length = 0;
  }

  draw(match, opts = {}) {
    const ctx = this.ctx;
    this.t++;
    ctx.save();
    if (this.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.86;
    }
    this.drawStage(ctx);
    if (match) {
      for (const p of match.projectiles) this.drawProjectile(ctx, p, match);
      // El que ataca se dibuja delante
      const order = [...match.fighters].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
      for (const f of order) this.drawFighter(ctx, f);
      if (opts.showHitboxes) this.drawDebug(ctx, match);
    }
    this.updateParticles(ctx);
    ctx.restore();
    if (match) {
      this.drawHud(ctx, match, opts);
      this.drawAnnouncer(ctx, match);
    }
  }

  // ---------- Escenario ----------
  drawStage(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#0d0b1f');
    sky.addColorStop(0.55, '#2a1740');
    sky.addColorStop(1, '#6b2f3f');
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, STAGE_W + 40, GROUND + 20);

    for (const s of this.stars) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(this.t * 0.03 + s.p);
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // Luna
    const moon = ctx.createRadialGradient(760, 110, 10, 760, 110, 90);
    moon.addColorStop(0, 'rgba(255,220,190,0.9)');
    moon.addColorStop(0.35, 'rgba(255,200,170,0.35)');
    moon.addColorStop(1, 'rgba(255,200,170,0)');
    ctx.fillStyle = moon;
    ctx.beginPath(); ctx.arc(760, 110, 90, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe2c8';
    ctx.beginPath(); ctx.arc(760, 110, 34, 0, TAU); ctx.fill();

    // Montañas lejanas
    ctx.fillStyle = '#2b1a3a';
    ctx.beginPath();
    ctx.moveTo(-20, GROUND);
    const peaks = [[0, 330], [90, 270], [180, 320], [290, 240], [400, 310], [520, 260], [640, 330], [760, 250], [880, 300], [980, 280]];
    for (const [x, y] of peaks) ctx.lineTo(x, y);
    ctx.lineTo(980, GROUND);
    ctx.fill();

    ctx.fillStyle = '#1e1229';
    ctx.beginPath();
    ctx.moveTo(-20, GROUND);
    const hills = [[0, 390], [120, 360], [250, 395], [380, 350], [500, 385], [640, 355], [780, 390], [900, 360], [980, 380]];
    for (const [x, y] of hills) ctx.lineTo(x, y);
    ctx.lineTo(980, GROUND);
    ctx.fill();

    // Columnas del templo
    for (const x of [70, 890]) {
      ctx.fillStyle = '#2d2036';
      ctx.fillRect(x - 18, 250, 36, GROUND - 250);
      ctx.fillStyle = '#3a2a45';
      ctx.fillRect(x - 26, 240, 52, 16);
      ctx.fillRect(x - 26, GROUND - 14, 52, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 6, 256, 12, GROUND - 270);
    }

    // Suelo
    const floor = ctx.createLinearGradient(0, GROUND, 0, STAGE_H);
    floor.addColorStop(0, '#4a3640');
    floor.addColorStop(1, '#1b1218');
    ctx.fillStyle = floor;
    ctx.fillRect(-20, GROUND, STAGE_W + 40, STAGE_H - GROUND + 20);
    ctx.strokeStyle = 'rgba(255,200,170,0.12)';
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(STAGE_W / 2 + i * 60, GROUND);
      ctx.lineTo(STAGE_W / 2 + i * 140, STAGE_H);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,210,180,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(STAGE_W, GROUND); ctx.stroke();
  }

  // ---------- Personajes ----------
  pose(f) {
    const t = this.t;
    const p = {
      lean: 0, crouch: 0, weapon: -0.9, arm: 0.35, reach: 0, legA: 0.12, legB: -0.12,
      bob: Math.sin(t * 0.08 + f.index) * 1.5, rot: 0, aura: 0, shield: false,
    };
    switch (f.state) {
      case 'walk': {
        const s = Math.sin(f.stateTime * 0.28);
        p.legA = s * 0.45; p.legB = -s * 0.45; p.bob = Math.abs(s) * -2;
        break;
      }
      case 'crouch': p.crouch = 0.38; p.weapon = -0.4; p.legA = 0.6; p.legB = -0.5; break;
      case 'block': p.weapon = -1.45; p.arm = 0.9; p.lean = -0.08; p.shield = true; p.legA = 0.3; p.legB = -0.25; break;
      case 'jump': p.legA = 0.9; p.legB = 0.2; p.crouch = 0.08; p.weapon = -1.2; break;
      case 'hitstun': p.lean = -0.35; p.weapon = -2.0; p.arm = -0.3; p.legA = 0.35; p.legB = -0.1; break;
      case 'blockstun': p.weapon = -1.45; p.arm = 0.9; p.lean = -0.18; p.shield = true; break;
      case 'ko': p.rot = f.grounded ? -Math.PI / 2 : -Math.min(Math.PI / 2, f.stateTime * 0.12); p.weapon = 0.3; break;
      case 'attack': this.attackPose(f, p); break;
    }
    if (!f.grounded && f.state !== 'ko') { p.legA = 0.9; p.legB = 0.25; }
    return p;
  }

  attackPose(f, p) {
    const m = f.move;
    const ph = f.phase();
    const fr = f.moveFrame;
    let k;
    if (ph === 'startup') k = fr / Math.max(1, m.startup);
    else if (ph === 'active') k = (fr - m.startup) / Math.max(1, m.active);
    else k = (fr - m.startup - m.active) / Math.max(1, m.recovery);
    k = Math.min(1, Math.max(0, k));

    const seq = (wind, strike, rest) => {
      if (ph === 'startup') return lerp(rest, wind, ease(k));
      if (ph === 'active') return lerp(wind, strike, ease(k));
      return lerp(strike, rest, ease(k));
    };

    switch (m.anim) {
      case 'slash':
        p.weapon = seq(-2.1, 0.7, -0.9);
        p.arm = seq(-0.4, 1.1, 0.35);
        p.lean = seq(-0.08, 0.15, 0);
        p.legA = 0.4; p.legB = -0.35;
        break;
      case 'overhead':
        p.weapon = seq(-3.4, 1.0, -0.9);
        p.arm = seq(-1.4, 1.2, 0.35);
        p.lean = seq(-0.15, 0.25, 0);
        p.legA = 0.55; p.legB = -0.45;
        break;
      case 'thrust':
        p.weapon = seq(0.1, 0, -0.9);
        p.arm = seq(0.2, 1.5, 0.35);
        p.reach = ph === 'active' ? 12 : ph === 'startup' ? -6 * k : 12 * (1 - k);
        p.lean = seq(-0.05, 0.3, 0);
        p.legA = 0.7; p.legB = -0.6;
        break;
      case 'cast':
        p.weapon = seq(-2.4, 0.2, -0.9);
        p.arm = seq(-0.6, 1.4, 0.35);
        p.aura = ph === 'startup' ? k : ph === 'active' ? 1 : 1 - k;
        p.legA = 0.4; p.legB = -0.4;
        break;
      case 'guard':
        p.weapon = -1.25; p.arm = 1.0; p.lean = -0.05;
        p.aura = ph === 'active' ? 0.8 + 0.2 * Math.sin(this.t * 0.6) : 0;
        p.legA = 0.35; p.legB = -0.3;
        break;
      case 'charge':
        p.weapon = seq(-0.4, 0.1, -0.9);
        p.arm = seq(0.4, 1.0, 0.35);
        p.lean = seq(0.1, 0.45, 0);
        p.legA = Math.sin(f.moveFrame * 0.6) * 0.6; p.legB = -p.legA;
        p.aura = ph === 'recovery' ? 0 : 0.5;
        break;
      case 'slam':
        p.weapon = seq(-3.6, 1.45, -0.9);
        p.arm = seq(-1.6, 1.0, 0.35);
        p.lean = seq(-0.2, 0.4, 0);
        p.crouch = ph === 'active' ? 0.2 : ph === 'recovery' ? 0.2 * (1 - k) : 0;
        p.legA = 0.6; p.legB = -0.5;
        break;
    }
  }

  drawFighter(ctx, f) {
    const d = f.def;
    const s = d.height / 120;
    const p = this.pose(f);
    const bulk = d.width / 48;

    // Sombra
    const airH = GROUND - f.y;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND + 3, (d.width * 0.8) * Math.max(0.4, 1 - airH / 300), 7, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.facing * s, s);
    if (p.rot) { ctx.translate(0, -10); ctx.rotate(p.rot); }

    const hip = -55 * (1 - p.crouch) + p.bob;
    const legLen = 30;
    const flash = f.flash > 0 && f.flash % 2 === 0;
    const body = flash ? '#ffffff' : d.color;
    const dark = flash ? '#dddddd' : d.dark;

    // Aura
    if (p.aura > 0) {
      const g = ctx.createRadialGradient(0, hip - 25, 5, 0, hip - 25, 80);
      g.addColorStop(0, hexA(d.color, 0.45 * p.aura));
      g.addColorStop(1, hexA(d.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, hip - 25, 80, 0, TAU); ctx.fill();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Piernas
    const drawLeg = (ang, col) => {
      const kneeX = Math.sin(ang) * legLen;
      const kneeY = hip + Math.cos(ang) * legLen * (1 - p.crouch * 0.5);
      const footX = kneeX + Math.sin(ang * 0.3) * 8 - (p.crouch * 10);
      const footY = Math.min(0, kneeY + legLen * (1 - p.crouch * 0.6));
      ctx.strokeStyle = col;
      ctx.lineWidth = 11 * bulk;
      ctx.beginPath(); ctx.moveTo(0, hip); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, footY + (f.grounded ? 0 : -6)); ctx.stroke();
      ctx.fillStyle = '#20161c';
      ctx.fillRect(footX - 4, footY - 4 + (f.grounded ? 0 : -6), 14, 6);
    };
    drawLeg(p.legB, dark);
    drawLeg(p.legA, '#3a2c38');

    // Torso
    ctx.save();
    ctx.translate(0, hip);
    ctx.rotate(p.lean);
    const tw = 26 * bulk;
    ctx.fillStyle = body;
    roundRect(ctx, -tw / 2, -44, tw, 48, 9);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(-tw / 2, -8, tw, 7); // cinturón
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -tw / 2 + 3, -41, 6, 30, 3);
    ctx.fill();

    // Cabeza
    ctx.fillStyle = d.skin;
    ctx.beginPath(); ctx.arc(2, -56, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = d.hair;
    ctx.beginPath(); ctx.arc(0, -60, 12.5, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ctx.fillRect(-12, -62, 7, 12);
    // Cinta / pañuelo
    ctx.strokeStyle = body;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-11, -61); ctx.lineTo(13, -61); ctx.stroke();
    const flutter = Math.sin(this.t * 0.25 + f.index) * 4;
    ctx.beginPath(); ctx.moveTo(-11, -61); ctx.quadraticCurveTo(-22, -62 + flutter, -30, -56 + flutter); ctx.stroke();
    ctx.fillStyle = '#1a1014';
    ctx.fillRect(7, -58, 3, 3); // ojo

    // Brazo + arma
    const shoulderX = 4, shoulderY = -36;
    const armLen = 26;
    const handX = shoulderX + Math.cos(p.arm) * armLen + p.reach;
    const handY = shoulderY + Math.sin(p.arm) * armLen;
    this.drawWeapon(ctx, d, handX, handY, p.weapon, f);
    ctx.strokeStyle = body;
    ctx.lineWidth = 9 * bulk;
    ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(handX, handY); ctx.stroke();
    ctx.fillStyle = d.skin;
    ctx.beginPath(); ctx.arc(handX, handY, 5 * bulk, 0, TAU); ctx.fill();

    // Escudo de bloqueo
    if (p.shield) {
      ctx.strokeStyle = `rgba(140,210,255,${0.55 + 0.25 * Math.sin(this.t * 0.4)})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(10, -25, 52, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(140,210,255,0.2)';
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(10, -25, 52, -1.0, 1.0); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  drawWeapon(ctx, d, hx, hy, ang, f) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    const swinging = f.state === 'attack' && f.phase() === 'active' && f.move.hitbox;
    if (d.weaponType === 'sword') {
      if (swinging) {
        ctx.fillStyle = hexA(d.color, 0.35);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 78, -1.2, 0.1); ctx.fill();
      }
      ctx.fillStyle = '#3b2a1c';
      ctx.fillRect(-12, -3, 14, 6); // empuñadura
      ctx.fillStyle = '#d9b44a';
      ctx.fillRect(1, -9, 5, 18); // guarda
      const g = ctx.createLinearGradient(0, -4, 0, 4);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9fb4c8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(6, -4); ctx.lineTo(70, -3); ctx.lineTo(80, 0); ctx.lineTo(70, 3); ctx.lineTo(6, 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexA(d.color, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(70, 0); ctx.stroke();
    } else {
      if (swinging) {
        ctx.fillStyle = hexA(d.color, 0.3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 80, -1.3, 0.15); ctx.fill();
      }
      ctx.fillStyle = '#5a3d26';
      ctx.fillRect(-14, -4, 72, 8); // mango
      ctx.fillStyle = '#3b2a1c';
      for (let i = 0; i < 3; i++) ctx.fillRect(-10 + i * 6, -4.5, 3, 9);
      ctx.fillStyle = '#6f7a85';
      roundRect(ctx, 48, -17, 26, 34, 4); ctx.fill();
      ctx.fillStyle = '#9aa6b2';
      ctx.fillRect(50, -15, 8, 30);
      ctx.fillStyle = d.color;
      ctx.fillRect(60, -3, 10, 6);
    }
    ctx.restore();
  }

  drawProjectile(ctx, p, match) {
    const owner = match.fighters[p.owner].def;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.spec.style === 'wave') {
      const dir = Math.sign(p.vx);
      ctx.scale(dir, 1);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hexA(owner.color, 0.9 - i * 0.28);
        ctx.lineWidth = 6 - i * 1.5;
        ctx.beginPath();
        ctx.arc(-i * 12, 0, p.h / 2, -1.1, 1.1);
        ctx.stroke();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, p.h / 2, -0.9, 0.9); ctx.stroke();
    } else {
      // Onda sísmica: rocas que brotan del suelo
      for (let i = 0; i < 4; i++) {
        const h = 14 + ((p.age * 3 + i * 17) % 34);
        const x = -p.w / 2 + i * (p.w / 4);
        ctx.fillStyle = i % 2 ? '#7b6448' : '#9b8061';
        ctx.beginPath();
        ctx.moveTo(x, p.h / 2);
        ctx.lineTo(x + 6, p.h / 2 - h);
        ctx.lineTo(x + 13, p.h / 2);
        ctx.fill();
      }
      ctx.fillStyle = hexA(owner.color, 0.35);
      ctx.fillRect(-p.w / 2, p.h / 2 - 6, p.w, 6);
      if (p.age % 3 === 0) {
        this.particles.push({ x: p.x, y: GROUND, vx: Math.random() * 2 - 1, vy: -2 - Math.random() * 3, life: 18, max: 18, color: '#8a7358', kind: 'rock', r: 2 + Math.random() * 2, g: 0.3 });
      }
    }
    ctx.restore();
  }

  updateParticles(ctx) {
    for (const p of this.particles) {
      p.life--;
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        ctx.strokeStyle = hexA(p.color, a);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - a * 0.6), 0, TAU); ctx.stroke();
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      if (p.g) p.vy += p.g;
      else { p.vx *= 0.9; p.vy *= 0.9; }
      ctx.globalAlpha = a;
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.kind === 'dust' ? 1.5 - a * 0.5 : 1), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    for (const t of this.texts) {
      t.life--;
      t.y -= 0.8;
      const a = Math.min(1, t.life / 15);
      ctx.globalAlpha = a;
      ctx.font = `${t.bold ? '900' : '800'} ${t.size}px "Bebas Neue", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.globalAlpha = 1;
    }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  drawDebug(ctx, match) {
    ctx.lineWidth = 2;
    for (const f of match.fighters) {
      const h = f.hurtbox();
      ctx.strokeStyle = 'rgba(80,255,120,0.9)';
      ctx.strokeRect(h.x, h.y, h.w, h.h);
      if (f.state === 'attack' && f.move.hitbox) {
        const b = worldHitbox(f, f.move.hitbox);
        const active = f.phase() === 'active';
        ctx.strokeStyle = active ? 'rgba(255,60,60,0.95)' : 'rgba(255,60,60,0.3)';
        ctx.fillStyle = active ? 'rgba(255,60,60,0.2)' : 'transparent';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
    }
    for (const p of match.projectiles) {
      const b = projBox(p);
      ctx.strokeStyle = 'rgba(255,60,60,0.95)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    match.fighters.forEach((f, i) => {
      const txt = `${f.state}${f.move ? ' ' + f.moveKey + ' ' + f.phase() + ' ' + f.moveFrame : ''}`;
      ctx.fillText(txt, i === 0 ? 20 : STAGE_W - 240, STAGE_H - 12);
    });
  }

  // ---------- Interfaz ----------
  drawHud(ctx, match, opts) {
    const W = STAGE_W;
    const barW = 370, barH = 22, top = 26;
    match.fighters.forEach((f, i) => {
      const left = i === 0;
      const x = left ? 24 : W - 24 - barW;
      const ratio = Math.max(0, f.hp / f.def.maxHp);
      if (this.trail[i] === null || match.phase === 'intro') this.trail[i] = ratio;
      if (this.trail[i] > ratio) this.trail[i] = Math.max(ratio, this.trail[i] - 0.004);
      else this.trail[i] = ratio;

      // Marco
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      skew(ctx, x - 4, top - 4, barW + 8, barH + 8, left);
      ctx.fill();
      // Rastro
      ctx.fillStyle = '#ff4f4f';
      const tw = barW * this.trail[i];
      skew(ctx, left ? x + barW - tw : x, top, tw, barH, left);
      ctx.fill();
      // Vida
      const hw = barW * ratio;
      const g = ctx.createLinearGradient(0, top, 0, top + barH);
      const col = ratio > 0.5 ? ['#ffe27a', '#f0a92c'] : ratio > 0.25 ? ['#ffb36b', '#e86a22'] : ['#ff7a7a', '#c92a2a'];
      g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
      ctx.fillStyle = g;
      skew(ctx, left ? x + barW - hw : x, top, hw, barH, left);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      skew(ctx, left ? x + barW - hw : x, top, hw, 5, left);
      ctx.fill();

      // Nombre y arma
      ctx.font = '26px "Bebas Neue", Impact, sans-serif';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillStyle = '#fff';
      const label = opts.labels?.[i] ?? '';
      ctx.fillText(f.def.name.toUpperCase(), left ? x : x + barW, top + barH + 26);
      ctx.font = '13px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(`${f.def.weapon}${label ? ' · ' + label : ''}`, left ? x : x + barW, top + barH + 44);

      // Rondas ganadas
      for (let r = 0; r < match.winsNeeded; r++) {
        const cx = left ? x + barW - 10 - r * 22 : x + 10 + r * 22;
        ctx.beginPath(); ctx.arc(cx, top + barH + 16, 7, 0, TAU);
        ctx.fillStyle = r < f.wins ? '#ffd54a' : 'rgba(0,0,0,0.5)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Habilidades
      const isBot = opts.botIndex === i;
      const skillKey = opts.bindings ? controlName(opts.bindings[i]?.skill) : 'J';
      const fwd = left ? '→' : '←';
      const dirs = { neutral: '', forward: fwd + '+', down: '↓+' };
      const keys = ['neutral', 'forward', 'down'];
      keys.forEach((k, j) => {
        const sk = f.def.skills[k];
        const cw = 112, ch = 30;
        const sx = left ? x + j * (cw + 8) : x + barW - cw - j * (cw + 8);
        const sy = top + barH + 54;
        const cd = f.cooldowns[k];
        const ready = cd <= 0;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, sx, sy, cw, ch, 6); ctx.fill();
        if (!ready) {
          ctx.fillStyle = hexA(f.def.color, 0.25);
          roundRect(ctx, sx, sy, cw * (1 - cd / sk.cooldown), ch, 6); ctx.fill();
        } else {
          ctx.strokeStyle = hexA(f.def.color, 0.9);
          ctx.lineWidth = 1.5;
          roundRect(ctx, sx, sy, cw, ch, 6); ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.45)';
        ctx.fillText(sk.name, sx + 8, sy + 13);
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = ready ? hexA(f.def.color, 1) : 'rgba(255,255,255,0.4)';
        ctx.fillText(ready ? (isBot ? 'Lista' : `${dirs[k]}${skillKey}`) : `${Math.ceil(cd / 60)} s`, sx + 8, sy + 25);
      });
    });

    // Temporizador
    const secs = Math.max(0, Math.ceil(match.timer / 60));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.arc(W / 2, top + 14, 30, 0, TAU); ctx.fill();
    ctx.strokeStyle = secs <= 10 ? '#ff6b6b' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '36px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = secs <= 10 ? '#ff8080' : '#fff';
    ctx.fillText(String(secs), W / 2, top + 27);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`RONDA ${match.round}`, W / 2, top + 62);
  }

  drawAnnouncer(ctx, match) {
    let text = null, sub = null, color = '#fff';
    const pt = match.phaseTime;
    if (match.phase === 'intro') {
      if (pt < 70) { text = `RONDA ${match.round}`; }
      else { text = '¡LUCHA!'; color = '#ffd54a'; }
    } else if (match.phase === 'fight' && pt < 30) {
      text = '¡LUCHA!'; color = '#ffd54a';
    } else if (match.phase === 'ko') {
      text = match.roundEndReason === 'time' ? 'TIEMPO' : 'K.O.';
      color = '#ff5a4a';
      if (pt > 60) sub = match.roundWinner ? `${match.roundWinner.def.name.toUpperCase()} GANA LA RONDA` : 'EMPATE';
    } else if (match.phase === 'matchover' && pt < 90) {
      text = `¡${match.matchWinner.def.name.toUpperCase()} GANA!`;
      color = '#ffd54a';
    }
    if (!text) return;
    const intro = match.phase === 'intro' ? (pt < 70 ? pt : pt - 70) : pt;
    const scale = 1 + Math.max(0, 1 - intro / 10) * 0.6;
    ctx.save();
    ctx.translate(STAGE_W / 2, STAGE_H / 2 - 30);
    ctx.scale(scale, scale);
    ctx.font = '96px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, 0, 30);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 30);
    ctx.restore();
    if (sub) {
      ctx.font = '30px "Bebas Neue", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(sub, STAGE_W / 2, STAGE_H / 2 + 40);
      ctx.fillStyle = '#fff';
      ctx.fillText(sub, STAGE_W / 2, STAGE_H / 2 + 40);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function skew(ctx, x, y, w, h, left) {
  const k = 8;
  ctx.beginPath();
  if (w <= 0) return;
  if (left) {
    ctx.moveTo(x + k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x, y + h);
  } else {
    ctx.moveTo(x, y); ctx.lineTo(x + w - k, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + k, y + h);
  }
  ctx.closePath();
}

function hexA(hex, a) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

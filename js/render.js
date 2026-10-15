// Dibujo del combate en un <canvas> con estética de muñecos de palo.
// Solo lee el estado de la partida; no modifica nada de la simulación.

import { STAGE_W, STAGE_H, GROUND, worldHitbox, projBox, shade } from './sim.js';
import { controlName } from './input.js';

const TAU = Math.PI * 2;
const OUT = '#17131c';
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - t, 3);
const polar = (a, r) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });

// ---------- Escenarios ----------
export const STAGES = [
  {
    name: 'Atardecer',
    sky: ['#ffd3a5', '#fd8a8a'], sun: '#fff1d6', far: '#e77b86', mid: '#c4566b',
    floor: '#2b2533', floorTop: '#4a3f57', deco: 'pillars', text: '#2b2533',
  },
  {
    name: 'Bosque',
    sky: ['#c8f3e1', '#7cc6a8'], sun: '#f6fff4', far: '#5fae8e', mid: '#3e8a6d',
    floor: '#263a33', floorTop: '#3f5d50', deco: 'trees', text: '#1f2f29',
  },
  {
    name: 'Nieve',
    sky: ['#eef4fb', '#b7cbe2'], sun: '#ffffff', far: '#c9d7e8', mid: '#9fb3cc',
    floor: '#343a52', floorTop: '#e9eef6', deco: 'peaks', text: '#2c3147',
  },
  {
    name: 'Noche',
    sky: ['#2b2d5c', '#141530'], sun: '#f4f1ff', far: '#3a3c74', mid: '#25264f',
    floor: '#0f0f1f', floorTop: '#2d2e5a', deco: 'city', text: '#ffffff',
  },
];

// ---------- Pose (ángulos del muñeco según su estado) ----------
function pose(f, t) {
  const p = {
    lean: 0, crouch: 0, weapon: -0.95, arm: 0.45, reach: 0, legA: 0.18, legB: -0.18,
    bob: Math.sin(t * 0.08 + f.index * 2) * 1.5, rot: 0, aura: 0, auraColor: null,
    shield: false, back: null, alpha: 1, air: false,
  };
  switch (f.state) {
    case 'walk': {
      const s = Math.sin(f.stateTime * 0.3);
      p.legA = s * 0.55; p.legB = -s * 0.55; p.bob = -Math.abs(s) * 2.5;
      p.arm = 0.45 + s * 0.12;
      break;
    }
    case 'crouch': p.crouch = 0.36; p.weapon = -0.35; p.legA = 0.5; p.legB = -0.35; break;
    case 'block': p.weapon = -1.5; p.arm = 0.1; p.lean = -0.1; p.shield = true; p.legA = 0.35; p.legB = -0.3; break;
    case 'blockstun': p.weapon = -1.5; p.arm = 0.1; p.lean = -0.2; p.shield = true; p.legA = 0.35; p.legB = -0.3; break;
    case 'jump': p.weapon = -1.2; break;
    case 'hitstun': p.lean = -0.4; p.weapon = -2.2; p.arm = -0.6; p.legA = 0.4; p.legB = -0.15; break;
    case 'ko': {
      const k = f.grounded ? 1 : Math.min(1, f.stateTime * 0.07);
      p.rot = -Math.PI / 2 * k; p.weapon = 0.6; p.arm = 1.4; p.legA = 0.25; p.legB = -0.05;
      break;
    }
    case 'attack': attackPose(f, p, t); break;
  }
  if (!f.grounded && f.state !== 'ko') p.air = true;
  return p;
}

function attackPose(f, p, t) {
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
  const stance = () => { p.legA = 0.5; p.legB = -0.42; };

  switch (m.anim) {
    case 'slash':
      p.weapon = seq(-2.2, 0.8, -0.95); p.arm = seq(-0.9, 0.7, 0.45); p.lean = seq(-0.1, 0.18, 0); stance();
      if (f.def.weaponType === 'daggers') p.back = { arm: seq(0.9, -0.4, 1.0), weapon: seq(0.4, -1.6, -0.5) };
      break;
    case 'overhead':
      p.weapon = seq(-3.5, 1.05, -0.95); p.arm = seq(-1.9, 0.75, 0.45); p.lean = seq(-0.18, 0.28, 0); stance();
      break;
    case 'thrust':
      p.weapon = seq(0.15, 0, -0.95); p.arm = seq(0.3, 0.1, 0.45);
      p.reach = ph === 'active' ? 16 : ph === 'startup' ? -8 * k : 16 * (1 - k);
      p.lean = seq(-0.05, 0.3, 0); p.legA = 0.75; p.legB = -0.6;
      break;
    case 'sweep':
      p.weapon = seq(-0.2, 1.2, -0.95); p.arm = seq(-0.5, 1.0, 0.45); p.crouch = 0.22;
      p.lean = seq(-0.2, 0.35, 0); p.legA = 0.8; p.legB = -0.6;
      break;
    case 'cast':
      p.weapon = seq(-2.4, 0.1, -0.95); p.arm = seq(-1.0, 0.2, 0.45); stance();
      p.aura = ph === 'startup' ? k : ph === 'active' ? 1 : 1 - k;
      break;
    case 'shoot':
      p.weapon = seq(0, 0, -0.95); p.arm = seq(0.05, 0, 0.45); p.reach = 4; stance();
      p.lean = seq(-0.08, -0.04, 0);
      break;
    case 'shootUp':
      p.weapon = seq(-0.8, -0.8, -0.95); p.arm = seq(-0.8, -0.8, 0.45); p.reach = 4; stance(); p.lean = -0.15;
      break;
    case 'guard':
      p.weapon = -1.3; p.arm = 0.2; p.lean = -0.05; stance();
      p.aura = ph === 'active' ? 0.75 + 0.25 * Math.sin(t * 0.6) : 0;
      break;
    case 'charge':
      p.weapon = seq(-0.5, 0.05, -0.95); p.arm = seq(0.4, 0.2, 0.45); p.lean = seq(0.15, 0.5, 0);
      p.legA = Math.sin(fr * 0.7) * 0.7; p.legB = -p.legA; p.aura = ph === 'recovery' ? 0 : 0.5;
      break;
    case 'slam':
      p.weapon = seq(-3.6, 1.45, -0.95); p.arm = seq(-2.0, 0.9, 0.45); p.lean = seq(-0.2, 0.42, 0);
      p.crouch = ph === 'active' ? 0.22 : ph === 'recovery' ? 0.22 * (1 - k) : 0; stance();
      break;
    case 'vault':
      p.weapon = seq(1.3, 1.45, -0.95); p.arm = seq(0.9, 1.2, 0.45); p.legA = 0.9; p.legB = 0.5;
      break;
    case 'punch':
      p.arm = seq(0.6, 0.05, 0.45); p.reach = ph === 'active' ? 20 : ph === 'startup' ? -4 : 20 * (1 - k);
      p.lean = seq(-0.05, 0.2, 0); stance();
      break;
    case 'uppercut':
      p.arm = seq(1.3, -1.3, 0.45); p.reach = seq(0, 8, 0); p.crouch = ph === 'startup' ? 0.25 * k : 0;
      p.lean = seq(0.1, -0.2, 0); stance();
      break;
    case 'barrage': {
      const alt = Math.floor(fr / 3) % 2;
      p.arm = ph === 'active' ? (alt ? -0.1 : 0.3) : 0.45; p.reach = ph === 'active' ? (alt ? 18 : 4) : 0;
      p.back = ph === 'active' ? { arm: alt ? 0.3 : -0.1, reach: alt ? 4 : 18 } : null;
      p.lean = 0.15; stance();
      break;
    }
    case 'grab':
      p.arm = seq(0.4, 0, 0.45); p.reach = ph === 'active' ? 14 : 0; p.back = { arm: 0.1, reach: ph === 'active' ? 12 : 0 };
      p.lean = seq(0, 0.3, 0); stance();
      break;
    case 'teleport': {
      const at = m.teleport.at;
      p.alpha = fr < at ? 1 - fr / at : Math.min(1, (fr - at) / 6);
      if (m.hitbox) { p.weapon = seq(-2.2, 0.8, -0.95); p.arm = seq(-0.9, 0.7, 0.45); }
      stance();
      break;
    }
    case 'dodge':
      p.lean = -0.35; p.alpha = 0.55; p.legA = 0.6; p.legB = -0.2;
      break;
    case 'heal':
      p.weapon = -1.6; p.arm = -0.9; p.aura = ph === 'recovery' ? 1 - k : 1; p.auraColor = '#5dff9d';
      break;
  }
}

// ---------- Dibujo del muñeco ----------
function ik(a, b, l1, l2, prefer) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  let bx = b.x, by = b.y;
  if (d > max) { bx = a.x + dx / d * max; by = a.y + dy / d * max; d = max; }
  if (d < 0.01) return { joint: { x: a.x, y: a.y + l1 }, end: { x: bx, y: by } };
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const ux = (bx - a.x) / d, uy = (by - a.y) / d;
  const mx = a.x + ux * along, my = a.y + uy * along;
  const j1 = { x: mx - uy * h, y: my + ux * h };
  const j2 = { x: mx + uy * h, y: my - ux * h };
  const joint = prefer(j1) >= prefer(j2) ? j1 : j2;
  return { joint, end: { x: bx, y: by } };
}

function limb(ctx, pts, color, w) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [c, lw] of [[OUT, w + 4], [color, w]]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

const TWO_HANDED = { hammer: -18, spear: -28, scythe: -22, staff: -24 };

export function drawFigure(ctx, f, t, opts = {}) {
  const d = f.def;
  const s = d.height / 120;
  const p = pose(f, t);
  const flash = f.flash > 0 && f.flash % 2 === 0;
  const col = flash ? '#ffffff' : f.color;
  const back = flash ? '#e8e8e8' : shade(f.color, -0.28);
  const bulk = 0.85 + (d.width - 40) / 60;
  const lw = 6.5 * bulk;

  ctx.save();
  ctx.globalAlpha = p.alpha;

  if (!opts.noShadow) {
    const airH = GROUND - f.y;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND + 2, d.width * 0.75 * Math.max(0.4, 1 - airH / 300), 6, 0, 0, TAU);
    ctx.fill();
  }

  ctx.translate(f.x, f.y);
  ctx.scale(f.facing * s, s);
  if (p.rot) { ctx.translate(0, -8); ctx.rotate(p.rot); }

  const hipY = -54 * (1 - p.crouch) + p.bob;
  const hip = { x: 0, y: hipY };

  // Aura
  if (p.aura > 0) {
    const ac = p.auraColor || f.color;
    const g = ctx.createRadialGradient(0, hipY - 20, 4, 0, hipY - 20, 78);
    g.addColorStop(0, hexA(ac, 0.5 * p.aura));
    g.addColorStop(1, hexA(ac, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, hipY - 20, 78, 0, TAU); ctx.fill();
  }

  // Piernas (rodillas siempre hacia delante)
  const feet = p.air
    ? [{ x: 14, y: hipY + 34 }, { x: -6, y: hipY + 42 }]
    : [{ x: Math.sin(p.legA) * 26, y: 0 }, { x: Math.sin(p.legB) * 26, y: 0 }];
  if (f.state === 'ko' && f.grounded) { feet[0] = { x: 12, y: hipY + 52 }; feet[1] = { x: -4, y: hipY + 53 }; }
  const legs = feet.map(ft => ik(hip, ft, 28, 28, j => j.x));
  limb(ctx, [hip, legs[1].joint, legs[1].end], back, lw);

  // Tren superior (inclinado)
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(p.lean);
  const neck = { x: 0, y: -38 };
  const shoulder = { x: 0, y: -34 };
  const head = { x: 1, y: -52 };

  const wt = d.weaponType;
  const handT = { x: shoulder.x + Math.cos(p.arm) * 34 + p.reach, y: shoulder.y + Math.sin(p.arm) * 34 };
  const front = ik(shoulder, handT, 21, 21, j => j.y);
  const hand = front.end;

  // Mano trasera según el arma
  let backT;
  if (TWO_HANDED[wt] !== undefined) {
    backT = { x: hand.x + Math.cos(p.weapon) * TWO_HANDED[wt], y: hand.y + Math.sin(p.weapon) * TWO_HANDED[wt] };
  } else if (wt === 'bow') {
    const drawn = f.state === 'attack' && (f.move.anim === 'shoot' || f.move.anim === 'shootUp') && f.phase() === 'startup';
    backT = drawn ? { x: shoulder.x + Math.cos(p.weapon) * 4, y: shoulder.y + Math.sin(p.weapon) * 4 }
      : { x: hand.x - Math.cos(p.weapon) * 10, y: hand.y - Math.sin(p.weapon) * 10 };
  } else if (p.back) {
    backT = { x: shoulder.x + Math.cos(p.back.arm) * 34 + (p.back.reach || 0), y: shoulder.y + Math.sin(p.back.arm) * 34 };
  } else if (wt === 'fists') {
    backT = f.state === 'hitstun' || f.state === 'ko' ? { x: -14, y: -6 } : { x: 18, y: -46 };
  } else if (wt === 'daggers') {
    backT = { x: shoulder.x + Math.cos(p.arm + 0.7) * 32 - 8, y: shoulder.y + Math.sin(p.arm + 0.7) * 32 };
  } else {
    backT = { x: -12, y: -6 + Math.sin(t * 0.08 + f.index) * 1.5 };
  }
  const backArm = ik(shoulder, backT, 21, 21, j => j.y);

  // Brazo trasero
  limb(ctx, [shoulder, backArm.joint, backArm.end], back, lw * 0.9);
  if (wt === 'daggers') drawDagger(ctx, backArm.end, p.back ? p.back.weapon : p.weapon + 0.5, col);
  if (wt === 'fists') dot(ctx, backArm.end.x, backArm.end.y, 6.5 * bulk, back);

  // Pierna delantera
  ctx.restore();
  limb(ctx, [hip, legs[0].joint, legs[0].end], col, lw);
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(p.lean);

  // Torso y cabeza
  limb(ctx, [{ x: 0, y: 0 }, neck], col, lw * 1.15);
  dot(ctx, head.x, head.y, 11, col);

  // Arma y brazo delantero
  drawWeapon(ctx, f, hand, backArm.end, p.weapon, col);
  limb(ctx, [shoulder, front.joint, hand], col, lw * 0.9);
  if (wt === 'fists') dot(ctx, hand.x, hand.y, 6.5 * bulk, col);

  // Escudo de bloqueo
  if (p.shield) {
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.25 * Math.sin(t * 0.4)})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(10, -22, 50, -1.15, 1.15); ctx.stroke();
    ctx.strokeStyle = hexA(f.color, 0.35);
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(10, -22, 50, -1.05, 1.05); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawDagger(ctx, h, ang, col) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(ang);
  limb(ctx, [{ x: -4, y: 0 }, { x: 4, y: 0 }], col, 4);
  bladeShape(ctx, 4, 26, 3.5);
  ctx.restore();
}

function bladeShape(ctx, from, to, half) {
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.moveTo(from, -half - 2); ctx.lineTo(to, -2); ctx.lineTo(to + 8, 0); ctx.lineTo(to, 2); ctx.lineTo(from, half + 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eef2f7';
  ctx.beginPath();
  ctx.moveTo(from + 1, -half); ctx.lineTo(to, -1); ctx.lineTo(to + 5, 0); ctx.lineTo(to, 1); ctx.lineTo(from + 1, half);
  ctx.closePath(); ctx.fill();
}

function drawWeapon(ctx, f, hand, backHand, ang, col) {
  const wt = f.def.weaponType;
  const swinging = f.state === 'attack' && f.phase() === 'active' && f.move.hitbox;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);

  if (swinging && wt !== 'fists') {
    const r = { sword: 76, hammer: 78, spear: 100, daggers: 34, bow: 52, scythe: 90, staff: 70 }[wt] || 60;
    ctx.fillStyle = hexA(f.color, 0.28);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -1.3, 0.15); ctx.fill();
  }

  switch (wt) {
    case 'sword':
      limb(ctx, [{ x: -10, y: 0 }, { x: 2, y: 0 }], '#5b4636', 4);
      limb(ctx, [{ x: 3, y: -8 }, { x: 3, y: 8 }], col, 3.5);
      bladeShape(ctx, 5, 66, 4);
      break;
    case 'hammer':
      limb(ctx, [{ x: -24, y: 0 }, { x: 52, y: 0 }], '#7a5a40', 4.5);
      ctx.fillStyle = OUT; roundRect(ctx, 44, -19, 32, 38, 5); ctx.fill();
      ctx.fillStyle = '#9aa5b1'; roundRect(ctx, 46, -17, 28, 34, 4); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(56, -17, 7, 34);
      break;
    case 'spear':
      limb(ctx, [{ x: -36, y: 0 }, { x: 82, y: 0 }], '#7a5a40', 4);
      limb(ctx, [{ x: 74, y: -4 }, { x: 74, y: 4 }], col, 3);
      bladeShape(ctx, 80, 96, 5);
      break;
    case 'daggers':
      limb(ctx, [{ x: -4, y: 0 }, { x: 4, y: 0 }], col, 4);
      bladeShape(ctx, 4, 26, 3.5);
      break;
    case 'bow': {
      // Arco perpendicular a la dirección de tiro
      ctx.strokeStyle = OUT; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(-14, 0, 30, -1.05, 1.05); ctx.stroke();
      ctx.strokeStyle = '#8d6748'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-14, 0, 30, -1.05, 1.05); ctx.stroke();
      const top = polar(-1.05, 30), bot = polar(1.05, 30);
      ctx.restore();
      ctx.save();
      // Cuerda hasta la mano trasera (en coordenadas del torso)
      const c = Math.cos(ang), s = Math.sin(ang);
      const tx = hand.x + (top.x - 14) * c - top.y * s, ty = hand.y + (top.x - 14) * s + top.y * c;
      const bx = hand.x + (bot.x - 14) * c - bot.y * s, by = hand.y + (bot.x - 14) * s + bot.y * c;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(backHand.x, backHand.y); ctx.lineTo(bx, by); ctx.stroke();
      break;
    }
    case 'scythe':
      limb(ctx, [{ x: -30, y: 0 }, { x: 72, y: 0 }], '#5b4636', 4);
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.moveTo(70, -4); ctx.quadraticCurveTo(66, 36, 22, 46); ctx.quadraticCurveTo(54, 26, 62, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e6ebf2';
      ctx.beginPath(); ctx.moveTo(68, -1); ctx.quadraticCurveTo(64, 32, 28, 42); ctx.quadraticCurveTo(55, 25, 63, -1); ctx.closePath(); ctx.fill();
      break;
    case 'staff': {
      limb(ctx, [{ x: -34, y: 0 }, { x: 62, y: 0 }], '#6d4c33', 4);
      const g = ctx.createRadialGradient(68, 0, 1, 68, 0, 18);
      g.addColorStop(0, hexA(f.color, 0.9)); g.addColorStop(1, hexA(f.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(68, 0, 18, 0, TAU); ctx.fill();
      dot(ctx, 68, 0, 6, '#ffffff');
      break;
    }
  }
  ctx.restore();
}

// ---------- Renderizador del combate ----------
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
    this.trail = [null, null];
    this.stage = STAGES[0];
  }

  setStage(i) { this.stage = STAGES[i % STAGES.length]; }

  reset() {
    this.particles = [];
    this.texts = [];
    this.trail = [null, null];
    this.shake = 0;
  }

  consume(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const n = 8 + e.strength * 6;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU;
            const sp = 3 + Math.random() * (4 + e.strength * 3);
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 18 + Math.random() * 10, max: 28, color: i % 3 ? '#ffffff' : '#ffd166', kind: 'spark' });
          }
          this.particles.push({ x: e.x, y: e.y, life: 10, max: 10, r: 18 + e.strength * 14, kind: 'ring', color: '#ffffff' });
          this.texts.push({ text: String(e.damage), x: e.x + (Math.random() * 20 - 10), y: e.y - 10, life: 45, max: 45, color: '#ffffff', size: 20 + e.strength * 4 });
          if (e.combo >= 2) this.texts.push({ text: `${e.combo} GOLPES`, x: e.x, y: e.y - 45, life: 40, max: 40, color: '#ffd166', size: 18 });
          this.shake = Math.max(this.shake, 3 + e.strength * 3);
          break;
        }
        case 'block':
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * TAU;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 14, max: 14, color: '#cfe8ff', kind: 'spark' });
          }
          this.particles.push({ x: e.x, y: e.y, life: 8, max: 8, r: 26, kind: 'ring', color: '#cfe8ff' });
          this.shake = Math.max(this.shake, 2);
          break;
        case 'dust':
          for (let i = 0; i < 4; i++) {
            this.particles.push({ x: e.x + Math.random() * 20 - 10, y: e.y - 2, vx: Math.random() * 2 - 1, vy: -Math.random() * 1.5, life: 22, max: 22, color: 'rgba(255,255,255,0.55)', kind: 'dust', r: 4 + Math.random() * 5 });
          }
          break;
        case 'slam':
          this.shake = Math.max(this.shake, 8);
          for (let i = 0; i < 14; i++) {
            this.particles.push({ x: e.x + Math.random() * 60 - 30, y: e.y, vx: Math.random() * 6 - 3, vy: -2 - Math.random() * 6, life: 30, max: 30, color: this.stage.floorTop, kind: 'rock', r: 2 + Math.random() * 4, g: 0.35 });
          }
          break;
        case 'teleport':
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * TAU;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 4, life: 24, max: 24, color: e.color, kind: 'dust', r: 3 + Math.random() * 4 });
          }
          break;
        case 'heal':
          for (let i = 0; i < 16; i++) {
            this.particles.push({ x: e.x + Math.random() * 50 - 25, y: e.y + Math.random() * 50, vx: 0, vy: -1.5 - Math.random() * 2, life: 40, max: 40, color: '#5dff9d', kind: 'plus', r: 4 });
          }
          break;
        case 'text':
          this.texts.push({ text: e.text, x: e.x, y: e.y, life: 60, max: 60, color: e.color, size: 24, bold: true });
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
    drawStage(ctx, this.stage, this.t);
    if (match) {
      for (const p of match.projectiles) this.drawProjectile(ctx, p, match);
      const order = [...match.fighters].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
      for (const f of order) drawFigure(ctx, f, this.t);
      if (opts.showHitboxes) this.drawDebug(ctx, match);
    }
    this.updateParticles(ctx);
    ctx.restore();
    if (match) {
      this.drawHud(ctx, match, opts);
      this.drawAnnouncer(ctx, match);
    }
  }

  drawProjectile(ctx, p, match) {
    const owner = match.fighters[p.owner];
    const col = owner.color;
    const t = this.t;
    ctx.save();
    ctx.translate(p.x, p.y);
    const dir = p.vx !== 0 ? Math.sign(p.vx) : p.facing;
    switch (p.spec.style) {
      case 'wave':
        ctx.scale(dir, 1);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = hexA(col, 0.95 - i * 0.28);
          ctx.lineWidth = 7 - i * 2;
          ctx.beginPath(); ctx.arc(-i * 12, 0, p.h / 2, -1.1, 1.1); ctx.stroke();
        }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, p.h / 2, -0.9, 0.9); ctx.stroke();
        break;
      case 'quake':
        for (let i = 0; i < 4; i++) {
          const h = 14 + ((p.age * 3 + i * 17) % 34);
          const x = -p.w / 2 + i * (p.w / 4);
          ctx.fillStyle = OUT;
          ctx.beginPath(); ctx.moveTo(x - 2, p.h / 2); ctx.lineTo(x + 6, p.h / 2 - h - 3); ctx.lineTo(x + 15, p.h / 2); ctx.fill();
          ctx.fillStyle = i % 2 ? col : shade(col, -0.3);
          ctx.beginPath(); ctx.moveTo(x, p.h / 2); ctx.lineTo(x + 6, p.h / 2 - h); ctx.lineTo(x + 13, p.h / 2); ctx.fill();
        }
        break;
      case 'spear':
        ctx.scale(dir, 1);
        limb(ctx, [{ x: -p.w / 2, y: 0 }, { x: p.w / 2 - 10, y: 0 }], '#7a5a40', 4);
        bladeShape(ctx, p.w / 2 - 12, p.w / 2 + 2, 5);
        break;
      case 'dagger':
        ctx.rotate(p.age * 0.6 * dir);
        bladeShape(ctx, -8, 8, 3);
        break;
      case 'arrow': {
        ctx.rotate(Math.atan2(p.vy, p.vx));
        limb(ctx, [{ x: -18, y: 0 }, { x: 14, y: 0 }], '#8d6748', 2.5);
        bladeShape(ctx, 12, 18, 3);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-24, -6); ctx.lineTo(-14, 0); ctx.lineTo(-24, 6); ctx.fill();
        break;
      }
      case 'trap': {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.15);
        ctx.fillStyle = hexA(col, 0.25 + 0.25 * pulse);
        ctx.beginPath(); ctx.ellipse(0, p.h / 2 - 2, p.w / 2 + 4, 6, 0, 0, TAU); ctx.fill();
        for (let i = -2; i <= 2; i++) {
          ctx.fillStyle = OUT;
          ctx.beginPath(); ctx.moveTo(i * 9 - 5, p.h / 2); ctx.lineTo(i * 9, p.h / 2 - 14); ctx.lineTo(i * 9 + 5, p.h / 2); ctx.fill();
          ctx.fillStyle = '#d7dde6';
          ctx.beginPath(); ctx.moveTo(i * 9 - 3, p.h / 2); ctx.lineTo(i * 9, p.h / 2 - 11); ctx.lineTo(i * 9 + 3, p.h / 2); ctx.fill();
        }
        break;
      }
      case 'ghost': {
        ctx.scale(dir, 1);
        const wob = Math.sin(t * 0.2) * 4;
        ctx.fillStyle = hexA(col, 0.25);
        ctx.beginPath(); ctx.ellipse(-16, wob, 30, 22, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = hexA(col, 0.75);
        ctx.beginPath(); ctx.arc(4, wob, 18, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(9, wob - 4, 3.5, 0, TAU); ctx.arc(0, wob - 4, 3.5, 0, TAU); ctx.fill();
        break;
      }
      case 'orb': {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, hexA(col, 0.9)); g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
        break;
      }
      case 'bolt': {
        ctx.scale(dir, 1);
        for (const [c, w] of [[hexA(col, 0.5), 9], ['#ffffff', 3]]) {
          ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(-p.w / 2, 0);
          for (let i = 1; i <= 6; i++) ctx.lineTo(-p.w / 2 + i * p.w / 6, ((i * 7 + t * 3) % 11) - 5);
          ctx.stroke();
        }
        break;
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
      else if (p.kind !== 'plus') { p.vx *= 0.9; p.vy *= 0.9; }
      ctx.globalAlpha = a;
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.stroke();
      } else if (p.kind === 'plus') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 4, p.y - 1.5, 8, 3);
        ctx.fillRect(p.x - 1.5, p.y - 4, 3, 8);
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
      ctx.globalAlpha = Math.min(1, t.life / 15);
      ctx.font = `${t.size}px "Bebas Neue", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = OUT;
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
      ctx.strokeStyle = f.invulnerable ? 'rgba(80,160,255,0.9)' : 'rgba(40,220,90,0.95)';
      ctx.strokeRect(h.x, h.y, h.w, h.h);
      if (f.state === 'attack' && f.move.hitbox) {
        const b = worldHitbox(f, f.move.hitbox);
        const active = f.phase() === 'active';
        ctx.strokeStyle = active ? 'rgba(255,40,40,0.95)' : 'rgba(255,40,40,0.35)';
        ctx.fillStyle = active ? 'rgba(255,40,40,0.2)' : 'transparent';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
    }
    for (const p of match.projectiles) {
      const b = projBox(p);
      ctx.strokeStyle = 'rgba(255,40,40,0.95)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    ctx.fillStyle = OUT;
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

      ctx.fillStyle = OUT;
      skew(ctx, x - 4, top - 4, barW + 8, barH + 8, left); ctx.fill();
      ctx.fillStyle = '#ffffff';
      const tw = barW * this.trail[i];
      skew(ctx, left ? x + barW - tw : x, top, tw, barH, left); ctx.fill();
      const hw = barW * ratio;
      ctx.fillStyle = ratio > 0.25 ? f.color : '#ff3b3b';
      skew(ctx, left ? x + barW - hw : x, top, hw, barH, left); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      skew(ctx, left ? x + barW - hw : x, top, hw, 5, left); ctx.fill();

      // Nombre y arma
      ctx.textAlign = left ? 'left' : 'right';
      ctx.font = '28px "Bebas Neue", Impact, sans-serif';
      outlined(ctx, f.def.name.toUpperCase(), left ? x : x + barW, top + barH + 28, '#fff', 5);
      ctx.font = '600 13px Inter, sans-serif';
      const label = opts.labels?.[i] ?? '';
      outlined(ctx, `${f.def.weapon}${label ? ' · ' + label : ''}`, left ? x : x + barW, top + barH + 46, '#fff', 4);

      // Rondas
      for (let r = 0; r < match.winsNeeded; r++) {
        const cx = left ? x + barW - 10 - r * 22 : x + 10 + r * 22;
        ctx.beginPath(); ctx.arc(cx, top + barH + 16, 7, 0, TAU);
        ctx.fillStyle = r < f.wins ? '#ffd166' : 'rgba(255,255,255,0.5)';
        ctx.fill();
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.stroke();
      }

      // Habilidades
      const isBot = opts.botIndex === i;
      const skillKey = opts.bindings ? controlName(opts.bindings[i]?.skill) : 'J';
      const dirs = { neutral: '', forward: (left ? '→' : '←') + '+', down: '↓+' };
      ['neutral', 'forward', 'down'].forEach((k, j) => {
        const sk = f.def.skills[k];
        const cw = 116, ch = 30;
        const sx = left ? x + j * (cw + 6) : x + barW - cw - j * (cw + 6);
        const sy = top + barH + 56;
        const cd = f.cooldowns[k];
        const ready = cd <= 0;
        ctx.fillStyle = 'rgba(23,19,28,0.82)';
        roundRect(ctx, sx, sy, cw, ch, 6); ctx.fill();
        if (!ready) {
          ctx.fillStyle = hexA(f.color, 0.3);
          roundRect(ctx, sx, sy, Math.max(12, cw * (1 - cd / sk.cooldown)), ch, 6); ctx.fill();
        } else {
          ctx.strokeStyle = f.color; ctx.lineWidth = 2;
          roundRect(ctx, sx, sy, cw, ch, 6); ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.45)';
        ctx.fillText(fit(ctx, sk.name, cw - 14), sx + 7, sy + 13);
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = ready ? f.color : 'rgba(255,255,255,0.45)';
        ctx.fillText(ready ? (isBot ? 'Lista' : `${dirs[k]}${skillKey}`) : `${Math.ceil(cd / 60)} s`, sx + 7, sy + 25);
      });
    });

    const secs = Math.max(0, Math.ceil(match.timer / 60));
    ctx.fillStyle = OUT;
    ctx.beginPath(); ctx.arc(W / 2, top + 14, 30, 0, TAU); ctx.fill();
    ctx.strokeStyle = secs <= 10 ? '#ff5a5a' : '#ffffff';
    ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '36px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = secs <= 10 ? '#ff7a7a' : '#fff';
    ctx.fillText(String(secs), W / 2, top + 27);
    ctx.font = 'bold 12px Inter, sans-serif';
    outlined(ctx, `RONDA ${match.round}`, W / 2, top + 62, '#fff', 4);
  }

  drawAnnouncer(ctx, match) {
    let text = null, sub = null, color = '#fff';
    const pt = match.phaseTime;
    if (match.phase === 'intro') {
      if (pt < 70) text = `RONDA ${match.round}`;
      else { text = '¡LUCHA!'; color = '#ffd166'; }
    } else if (match.phase === 'fight' && pt < 30) {
      text = '¡LUCHA!'; color = '#ffd166';
    } else if (match.phase === 'ko') {
      text = match.roundEndReason === 'time' ? 'TIEMPO' : 'K.O.';
      color = '#ff4d4d';
      if (pt > 60) sub = match.roundWinner ? `${match.roundWinner.def.name.toUpperCase()} GANA LA RONDA` : 'EMPATE';
    } else if (match.phase === 'matchover' && pt < 90) {
      text = `¡${match.matchWinner.def.name.toUpperCase()} GANA!`;
      color = match.matchWinner.color;
    }
    if (!text) return;
    const intro = match.phase === 'intro' ? (pt < 70 ? pt : pt - 70) : pt;
    const scale = 1 + Math.max(0, 1 - intro / 10) * 0.6;
    ctx.save();
    ctx.translate(STAGE_W / 2, STAGE_H / 2 - 30);
    ctx.scale(scale, scale);
    ctx.font = '100px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center';
    outlined(ctx, text, 0, 30, color, 12);
    ctx.restore();
    if (sub) {
      ctx.font = '32px "Bebas Neue", Impact, sans-serif';
      ctx.textAlign = 'center';
      outlined(ctx, sub, STAGE_W / 2, STAGE_H / 2 + 42, '#fff', 7);
    }
  }
}

// ---------- Escenario ----------
export function drawStage(ctx, st, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, st.sky[0]);
  sky.addColorStop(1, st.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, STAGE_W + 40, GROUND + 20);

  // Sol / luna
  ctx.fillStyle = hexA(st.sun, 0.35);
  ctx.beginPath(); ctx.arc(720, 140, 86, 0, TAU); ctx.fill();
  ctx.fillStyle = st.sun;
  ctx.beginPath(); ctx.arc(720, 140, 56, 0, TAU); ctx.fill();

  // Nubes planas
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 290 + t * (0.15 + i * 0.05)) % (STAGE_W + 300)) - 150;
    const y = 70 + i * 38;
    roundRect(ctx, x, y, 140 - i * 15, 22, 11); ctx.fill();
    roundRect(ctx, x + 30, y - 12, 70, 22, 11); ctx.fill();
  }

  // Siluetas lejanas
  ctx.fillStyle = st.far;
  ctx.beginPath();
  ctx.moveTo(-20, GROUND);
  const far = [[0, 330], [110, 280], [220, 320], [330, 250], [450, 300], [560, 260], [680, 320], [800, 270], [910, 300], [980, 290]];
  for (const [x, y] of far) ctx.lineTo(x, y);
  ctx.lineTo(980, GROUND); ctx.fill();

  ctx.fillStyle = st.mid;
  switch (st.deco) {
    case 'pillars':
      for (const x of [60, 170, 790, 900]) {
        ctx.fillRect(x - 16, 290, 32, GROUND - 290);
        ctx.fillRect(x - 24, 280, 48, 14);
      }
      ctx.fillRect(140, 268, 60, 14);
      break;
    case 'trees':
      for (const [x, h] of [[50, 170], [130, 120], [820, 150], [910, 190], [260, 90], [700, 100]]) {
        ctx.fillRect(x - 5, GROUND - 40, 10, 40);
        ctx.beginPath(); ctx.moveTo(x - 38, GROUND - 30); ctx.lineTo(x, GROUND - 30 - h); ctx.lineTo(x + 38, GROUND - 30); ctx.fill();
      }
      break;
    case 'peaks':
      ctx.beginPath(); ctx.moveTo(-20, GROUND);
      for (const [x, y] of [[0, 400], [140, 330], [260, 390], [420, 345], [560, 395], [700, 335], [860, 385], [980, 350]]) ctx.lineTo(x, y);
      ctx.lineTo(980, GROUND); ctx.fill();
      break;
    case 'city':
      for (let i = 0; i < 14; i++) {
        const w = 50 + (i * 37) % 30, h = 70 + (i * 53) % 120, x = i * 72 - 10;
        ctx.fillStyle = st.mid;
        ctx.fillRect(x, GROUND - h, w, h);
        ctx.fillStyle = 'rgba(255,230,150,0.55)';
        for (let wy = GROUND - h + 12; wy < GROUND - 14; wy += 18) {
          for (let wx = x + 8; wx < x + w - 8; wx += 14) if ((wx * 7 + wy * 3 + i) % 5 < 2) ctx.fillRect(wx, wy, 5, 7);
        }
      }
      break;
  }

  // Plataforma
  ctx.fillStyle = st.floor;
  ctx.fillRect(-20, GROUND, STAGE_W + 40, STAGE_H - GROUND + 20);
  ctx.fillStyle = st.floorTop;
  ctx.fillRect(-20, GROUND, STAGE_W + 40, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < STAGE_W; x += 80) ctx.fillRect(x, GROUND + 18, 40, 4);
}

// ---------- Utilidades ----------
function outlined(ctx, text, x, y, color, w) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = OUT;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
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

export function hexA(hex, a) {
  if (!hex.startsWith('#')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

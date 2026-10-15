// Dibujo del combate al estilo de las animaciones de muñecos de palo:
// fondo gris plano, muñeco negro contra muñeco blanco, armas grandes,
// estelas en cada golpe, destellos, salpicaduras, humo y grietas.
// Solo lee el estado de la partida; no modifica nada de la simulación.

import { STAGE_W, STAGE_H, GROUND, worldHitbox, projBox } from './sim.js';
import { controlName } from './input.js';

const TAU = Math.PI * 2;
const OUT = '#141414';
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
const rand = (a, b) => a + Math.random() * (b - a);
const GROUND_SCREEN = 452;   // altura en pantalla a la que se dibuja el suelo

export const BODY = ['#121212', '#f2f2f2'];
const BODY_BACK = ['#2c2c2c', '#d2d2d2'];

export const STAGES = [
  { name: 'Estudio', top: '#d6d6d6', bottom: '#c1c1c1', floor: '#b4b4b4', band: 'rgba(0,0,0,0.07)' },
  { name: 'Niebla', top: '#c4c4c4', bottom: '#acacac', floor: '#a0a0a0', band: 'rgba(0,0,0,0.08)' },
  { name: 'Ceniza', top: '#b8b8b8', bottom: '#9c9c9c', floor: '#909090', band: 'rgba(0,0,0,0.09)' },
];

// ---------- Pose ----------
function pose(f, t) {
  const p = {
    lean: 0.05, crouch: 0.1, shift: 0, weapon: -0.95, arm: 0.45, reach: 0,
    legA: 0.36, legB: -0.32, bob: Math.sin(t * 0.09 + f.index * 2) * 1.6,
    rot: 0, aura: 0, auraColor: null, shield: false, back: null, alpha: 1, air: false, kick: null, airTuck: undefined,
  };
  switch (f.state) {
    case 'walk': {
      // Fase del paso según la distancia recorrida: nunca da saltos
      const ph = f.x * 0.085 * f.facing;
      const s = Math.sin(ph);
      const speed = Math.min(1, Math.abs(f.vx) / Math.max(1, f.def.walkSpeed));
      p.legA = s * 0.62 * speed + 0.1; p.legB = -s * 0.62 * speed - 0.1;
      p.bob = -Math.abs(Math.cos(ph)) * 3 * speed; p.lean = 0.06 + 0.1 * speed * Math.sign(f.vx * f.facing);
      p.arm = 0.45 + s * 0.18 * speed; p.crouch = 0.08;
      break;
    }
    case 'crouch': p.crouch = 0.42; p.weapon = -0.3; p.legA = 0.62; p.legB = -0.5; p.lean = 0.15; break;
    case 'block':
    case 'blockstun':
      p.weapon = -1.55; p.arm = 0.05; p.lean = f.state === 'blockstun' ? -0.25 : -0.08;
      p.shield = true; p.legA = 0.5; p.legB = -0.45; p.crouch = 0.18;
      break;
    case 'jump':
      p.weapon = -1.3; p.lean = 0.1;
      if (f.flipT < 18) { p.rot = -easeInOut(f.flipT / 18) * TAU; p.airTuck = 1; }
      break;
    case 'dash': {
      const fwd = f.dashDir === f.facing;
      p.lean = fwd ? 0.5 : -0.3; p.crouch = 0.22; p.legA = fwd ? 0.95 : 0.4; p.legB = fwd ? -0.8 : -0.9;
      p.weapon = fwd ? 2.6 : -1.2; p.arm = fwd ? 1.9 : 0.4;
      break;
    }
    case 'hitstun':
      if (f.knock && !f.grounded) {
        p.rot = -Math.min(Math.PI * 1.6, f.stateTime * 0.22);
        p.legA = Math.sin(t * 0.5) * 0.9; p.legB = -p.legA; p.arm = -1.2 + Math.sin(t * 0.4); p.weapon = -2.4;
      } else {
        p.lean = -0.5; p.weapon = -2.3; p.arm = -0.7; p.legA = 0.45; p.legB = -0.2; p.crouch = 0.08;
      }
      break;
    case 'down':
      p.rot = -Math.PI / 2; p.weapon = 0.8; p.arm = 1.5; p.legA = 0.2; p.legB = 0.05;
      break;
    case 'getup': {
      const k = 1 - f.stun / 16;
      p.rot = -Math.PI / 2 * (1 - ease(k)); p.crouch = 0.45 * (1 - k); p.weapon = -0.9; p.lean = 0.3 * (1 - k);
      break;
    }
    case 'ko': {
      const k = f.grounded ? 1 : Math.min(1, f.stateTime * 0.06);
      p.rot = -Math.PI / 2 * k - (f.grounded ? 0 : f.stateTime * 0.12);
      if (f.grounded) p.rot = -Math.PI / 2;
      p.weapon = 0.9; p.arm = 1.5; p.legA = 0.25; p.legB = -0.05;
      break;
    }
    case 'attack': attackPose(f, p, t); break;
  }
  if (!f.grounded && !['ko', 'down'].includes(f.state) && !(f.state === 'hitstun' && f.knock)) {
    p.air = true;
    if (p.airTuck === undefined) p.airTuck = 1 - Math.min(1, Math.abs(f.vy) / 7);
  }
  // Aterrizaje: pequeña flexión de rodillas
  if (f.grounded && f.landT < 8 && ['idle', 'walk', 'crouch', 'attack', 'jump'].includes(f.state)) {
    p.crouch += 0.26 * (1 - f.landT / 8);
  }
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
  // Anticipación suave, golpe seco y vuelta suave a la guardia
  const seq = (wind, strike, rest) => {
    if (ph === 'startup') return lerp(rest, wind, easeInOut(k));
    if (ph === 'active') return lerp(wind, strike, easeOutQuart(k));
    return lerp(strike, rest, easeInOut(k));
  };
  // Postura de ataque: piernas muy abiertas y cuerpo volcado hacia delante
  const lunge = (depth = 1) => {
    p.legA = 0.85 * depth; p.legB = -0.72 * depth;
    p.crouch = seq(0.16, 0.26, 0.1) * depth;
    p.shift = seq(-6, 16, 0) * depth;
  };

  let anim = m.anim;
  if (f.def.weaponType === 'fists') anim = FIST_ANIM[anim] || anim;

  switch (anim) {
    case 'backhand':
      p.weapon = seq(1.0, -2.4, -0.95); p.arm = seq(1.0, -1.1, 0.45); p.lean = seq(0.2, -0.18, 0.05); lunge(1.05);
      if (f.def.weaponType === 'daggers') p.back = { arm: seq(-0.6, 1.0, 1.0), weapon: seq(-1.6, 0.6, -0.5) };
      break;
    case 'spin':
      // Giro completo del arma: la vuelta de 360° ocurre solo durante el golpe
      p.weapon = ph === 'startup' ? lerp(-0.95, -0.6, easeInOut(k))
        : ph === 'active' ? lerp(-0.6, -0.6 + TAU, easeOutQuart(k)) : lerp(-0.6 + TAU, -0.95 + TAU, easeInOut(k));
      p.arm = seq(-0.4, 1.1, 0.45);
      p.lean = seq(-0.25, 0.32, 0.05); lunge(1.25);
      if (ph === 'active') p.bob = -4;
      break;
    case 'rising':
      p.crouch = seq(0.48, 0.0, 0.1); p.weapon = seq(2.5, -2.1, -0.95); p.arm = seq(1.6, -1.3, 0.45);
      p.lean = seq(0.35, -0.3, 0.05); p.legA = 0.6; p.legB = -0.5; p.shift = seq(4, 8, 0);
      break;
    case 'airSlash':
      p.weapon = seq(-2.7, 1.7, -0.95); p.arm = seq(-1.3, 1.1, 0.45); p.lean = seq(-0.25, 0.3, 0.05);
      p.rot = seq(0.3, -0.4, 0); p.airTuck = 0.6;
      break;
    case 'airOverhead':
      p.weapon = seq(-3.8, 1.8, -0.95); p.arm = seq(-2.3, 1.25, 0.45); p.lean = seq(-0.35, 0.6, 0.05); p.airTuck = 0.8;
      break;
    case 'plunge':
      p.weapon = ph === 'startup' ? lerp(-0.95, -2.6, easeInOut(k)) : ph === 'active' ? 1.45 : lerp(1.45, -0.95, easeInOut(k));
      p.arm = ph === 'active' ? 1.15 : 0.2; p.lean = ph === 'active' ? 0.4 : 0.1; p.airTuck = 1;
      if (ph === 'recovery') { p.crouch = 0.4 * (1 - k); p.airTuck = 0; }
      break;
    case 'dashSlash':
      p.weapon = seq(-0.5, 1.05, -0.95); p.arm = seq(-0.3, 0.9, 0.45); p.lean = seq(0.45, 0.55, 0.05);
      p.legA = 0.95; p.legB = -0.85; p.crouch = 0.24; p.shift = seq(4, 14, 0);
      break;
    case 'hook':
      p.arm = -0.2; p.back = { arm: seq(0.7, 0.0, 0.3), reach: seq(-4, 24, 0) }; p.lean = seq(-0.1, 0.35, 0.05); lunge();
      break;
    case 'roundhouse':
      p.lean = seq(0, -0.4, 0.05); p.arm = -0.5; p.legB = -0.25;
      p.kick = { x: seq(16, 70, 16), y: seq(-30, -92, 0) };
      break;
    case 'flyKick':
      p.lean = -0.25; p.arm = -0.4; p.kick = { x: seq(10, 76, 20), y: seq(-40, -52, -30) }; p.airTuck = 0.5;
      break;
    case 'axeKick':
      p.lean = seq(-0.3, 0.3, 0.05); p.arm = -0.6; p.kick = { x: seq(20, 56, 20), y: seq(-128, -24, -30) }; p.airTuck = 0.5;
      break;
    case 'stomp':
      p.lean = 0.2; p.arm = -0.8; p.airTuck = 1;
      if (ph === 'active') p.kick = { x: 14, y: 6 };
      if (ph === 'recovery') { p.crouch = 0.4 * (1 - k); p.airTuck = 0; }
      break;
    case 'slash':
      p.weapon = seq(-2.4, 0.9, -0.95); p.arm = seq(-1.1, 0.75, 0.45); p.lean = seq(-0.2, 0.35, 0.05); lunge();
      if (f.def.weaponType === 'daggers') p.back = { arm: seq(1.0, -0.5, 1.0), weapon: seq(0.4, -1.8, -0.5) };
      break;
    case 'overhead':
      p.weapon = seq(-3.7, 1.15, -0.95); p.arm = seq(-2.1, 0.85, 0.45); p.lean = seq(-0.3, 0.5, 0.05); lunge(1.15);
      break;
    case 'thrust':
      p.weapon = seq(0.15, 0, -0.95); p.arm = seq(0.35, 0.05, 0.45);
      p.reach = ph === 'active' ? 18 : ph === 'startup' ? -10 * k : 18 * (1 - k);
      p.lean = seq(-0.12, 0.42, 0.05); lunge(1.2);
      break;
    case 'sweep':
      p.weapon = seq(-0.3, 1.3, -0.95); p.arm = seq(-0.6, 1.1, 0.45); p.lean = seq(-0.3, 0.5, 0.05);
      lunge(1.3); p.crouch = seq(0.3, 0.42, 0.1);
      break;
    case 'cast':
      p.weapon = seq(-2.5, 0.1, -0.95); p.arm = seq(-1.2, 0.2, 0.45); lunge(0.8);
      p.aura = ph === 'startup' ? k : ph === 'active' ? 1 : 1 - k;
      break;
    case 'shoot':
      p.weapon = 0; p.arm = 0; p.reach = 4; lunge(0.8); p.shift = 0; p.lean = seq(-0.1, -0.05, 0.05);
      break;
    case 'shootUp':
      p.weapon = -0.8; p.arm = -0.8; p.reach = 4; lunge(0.8); p.shift = 0; p.lean = -0.2;
      break;
    case 'guard':
      p.weapon = -1.3; p.arm = 0.2; p.lean = -0.1; lunge(0.8); p.shift = -4;
      p.aura = ph === 'active' ? 0.75 + 0.25 * Math.sin(t * 0.6) : 0;
      break;
    case 'charge':
      p.weapon = seq(-0.5, 0.05, -0.95); p.arm = seq(0.4, 0.2, 0.45); p.lean = seq(0.2, 0.6, 0.05);
      p.legA = Math.sin(fr * 0.7) * 0.8; p.legB = -p.legA; p.crouch = 0.2; p.aura = ph === 'recovery' ? 0 : 0.4;
      break;
    case 'slam':
      p.weapon = seq(-3.8, 1.5, -0.95); p.arm = seq(-2.2, 0.95, 0.45); p.lean = seq(-0.35, 0.6, 0.05);
      lunge(1.2); p.crouch = ph === 'active' ? 0.38 : ph === 'recovery' ? 0.38 * (1 - k) + 0.1 : seq(0.1, 0.38, 0.1);
      break;
    case 'vault':
      p.weapon = seq(1.3, 1.5, -0.95); p.arm = seq(0.9, 1.2, 0.45); p.legA = 1.0; p.legB = 0.6; p.lean = 0.3;
      break;
    case 'punch':
      p.arm = seq(0.7, 0.02, 0.45); p.reach = ph === 'active' ? 22 : ph === 'startup' ? -6 : 22 * (1 - k);
      p.lean = seq(-0.1, 0.35, 0.05); lunge();
      break;
    case 'uppercut':
      p.arm = seq(1.4, -1.4, 0.45); p.reach = seq(0, 8, 0); p.crouch = ph === 'startup' ? 0.4 * k : 0.05;
      p.lean = seq(0.25, -0.3, 0.05); p.legA = 0.6; p.legB = -0.5;
      break;
    case 'barrage': {
      const alt = Math.floor(fr / 3) % 2;
      p.arm = ph === 'active' ? (alt ? -0.1 : 0.3) : 0.45; p.reach = ph === 'active' ? (alt ? 20 : 4) : 0;
      p.back = ph === 'active' ? { arm: alt ? 0.3 : -0.1, reach: alt ? 4 : 20 } : null;
      p.lean = 0.3; lunge(0.9);
      break;
    }
    case 'grab':
      p.arm = seq(0.4, 0, 0.45); p.reach = ph === 'active' ? 16 : 0; p.back = { arm: 0.1, reach: ph === 'active' ? 14 : 0 };
      p.lean = seq(0, 0.45, 0.05); lunge();
      break;
    case 'teleport': {
      const at = m.teleport.at;
      p.alpha = fr < at ? 1 - fr / at : Math.min(1, (fr - at) / 6);
      if (m.hitbox) { p.weapon = seq(-2.4, 0.9, -0.95); p.arm = seq(-1.1, 0.75, 0.45); p.lean = seq(-0.2, 0.35, 0.05); }
      lunge();
      break;
    }
    case 'dodge':
      p.lean = -0.45; p.alpha = 0.55; p.legA = 0.7; p.legB = -0.3; p.crouch = 0.25;
      break;
    case 'heal':
      p.weapon = -1.6; p.arm = -0.9; p.aura = ph === 'recovery' ? 1 - k : 1; p.auraColor = '#7dffb0';
      break;
    case 'sweepKick': {
      p.crouch = 0.5; p.lean = -0.2; p.legB = -0.9; p.weapon = -0.4; p.arm = 0.9;
      const ext = ph === 'startup' ? k * 0.3 : ph === 'active' ? 1 : 1 - k;
      p.kick = { x: lerp(14, 78, ease(ext)), y: -3 };
      break;
    }
  }
}

// Los guanteletes no tienen arma: ciertos golpes se convierten en puñetazos y patadas
const FIST_ANIM = {
  slash: 'punch', backhand: 'hook', spin: 'roundhouse', rising: 'uppercut', airSlash: 'flyKick',
  airOverhead: 'axeKick', plunge: 'stomp', dashSlash: 'punch',
};

// ---------- Suavizado entre poses ----------
// Cada fotograma la pose dibujada se acerca a la pose objetivo, de modo que
// los cambios de estado (andar → atacar → guardia) nunca dan saltos bruscos.
const smoothState = new WeakMap();
const NUM_KEYS = ['lean', 'crouch', 'shift', 'reach', 'legA', 'legB', 'bob', 'aura', 'airTuck'];
const ANGLE_KEYS = ['weapon', 'arm', 'rot'];
const wrap = d => d - TAU * Math.round(d / TAU);

function smoothPose(key, target, f) {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const st = smoothState.get(key);
  if (!st) { smoothState.set(key, { p: { ...target }, t: now }); return target; }
  const dt = Math.min(0.1, Math.max(0, (now - st.t) / 1000));
  st.t = now;
  const rate = f.state === 'attack' ? 40 : f.state === 'hitstun' || f.state === 'dash' ? 30 : 15;
  const k = 1 - Math.exp(-rate * dt);
  const prev = st.p;
  const out = { ...target };
  for (const n of NUM_KEYS) {
    const a = prev[n] ?? target[n] ?? 0, b = target[n] ?? 0;
    out[n] = a + (b - a) * k;
  }
  for (const n of ANGLE_KEYS) out[n] = prev[n] + wrap(target[n] - prev[n]) * k;
  if (target.back) {
    const pb = prev.back || target.back;
    out.back = {
      arm: pb.arm + wrap(target.back.arm - pb.arm) * k,
      weapon: (pb.weapon ?? target.back.weapon ?? 0) + wrap((target.back.weapon ?? 0) - (pb.weapon ?? target.back.weapon ?? 0)) * k,
      reach: (pb.reach || 0) + ((target.back.reach || 0) - (pb.reach || 0)) * k,
    };
  }
  if (target.kick) {
    const pk = prev.kick || target.kick;
    out.kick = { x: pk.x + (target.kick.x - pk.x) * Math.max(k, 0.5), y: pk.y + (target.kick.y - pk.y) * Math.max(k, 0.5) };
  }
  st.p = out;
  return out;
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
  return { joint: prefer(j1) >= prefer(j2) ? j1 : j2, end: { x: bx, y: by } };
}

function limb(ctx, pts, color, w, outline = false) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = outline ? [[OUT, w + 3], [color, w]] : [[color, w]];
  for (const [c, lw] of passes) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

const TWO_HANDED = { hammer: -20, spear: -30, scythe: -24, staff: -26 };

export function drawFigure(ctx, f, t, opts = {}) {
  const d = f.def;
  const s = d.height / 120;
  const raw = pose(f, t);
  const p = opts.raw ? raw : smoothPose(opts.key || f, raw, f);
  const flash = f.flash > 0 && f.flash % 2 === 0;
  const body = opts.body || (flash ? f.color : BODY[f.index % 2]);
  const back = opts.body || (flash ? f.color : BODY_BACK[f.index % 2]);
  const bulk = 0.9 + (d.width - 40) / 70;
  const lw = 7.5 * bulk;

  ctx.save();
  ctx.globalAlpha = p.alpha * (opts.alpha ?? 1);

  if (!opts.noShadow) {
    const airH = GROUND - f.y;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND + 2, (f.state === 'down' || f.state === 'ko' ? 60 : d.width * 0.8) * Math.max(0.35, 1 - airH / 300), 7, 0, 0, TAU);
    ctx.fill();
  }

  ctx.translate(f.x, f.y);
  ctx.scale(f.facing * s, s);
  if (p.rot) {
    // Gira alrededor de la cadera cuando vuela; tumbado se apoya en el suelo
    const lying = f.grounded && (f.state === 'down' || f.state === 'ko' || f.state === 'getup');
    const pivot = lying ? -10 : -54;
    ctx.translate(0, pivot);
    ctx.rotate(p.rot);
    ctx.translate(0, -pivot);
  }

  const hipY = -56 * (1 - p.crouch) + p.bob;
  const hip = { x: p.shift, y: hipY };

  if (p.aura > 0) {
    const ac = p.auraColor || f.color;
    const g = ctx.createRadialGradient(hip.x, hipY - 22, 4, hip.x, hipY - 22, 82);
    g.addColorStop(0, hexA(ac, 0.5 * p.aura));
    g.addColorStop(1, hexA(ac, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(hip.x, hipY - 22, 82, 0, TAU); ctx.fill();
  }

  // Piernas (rodillas hacia delante)
  let feet;
  if (p.air) {
    const tk = Math.max(0, Math.min(1, p.airTuck ?? 0.5));
    feet = [
      { x: lerp(10, 18, tk), y: hipY + lerp(54, 30, tk) },
      { x: lerp(-14, -6, tk), y: hipY + lerp(50, 38, tk) },
    ];
  }
  else feet = [{ x: Math.sin(p.legA) * 30, y: 0 }, { x: Math.sin(p.legB) * 30, y: 0 }];
  if (p.kick) feet[0] = p.kick;
  if ((f.state === 'down' || f.state === 'ko') && f.grounded) { feet[0] = { x: 10, y: hipY + 56 }; feet[1] = { x: -6, y: hipY + 57 }; }
  if (f.state === 'hitstun' && f.knock && !f.grounded) {
    feet[0] = { x: Math.sin(p.legA) * 40, y: hipY + 46 };
    feet[1] = { x: Math.sin(p.legB) * 40, y: hipY + 46 };
  }
  const legs = feet.map(ft => ik(hip, ft, 30, 30, j => j.x));
  limb(ctx, [hip, legs[1].joint, legs[1].end], back, lw);

  ctx.save();
  ctx.translate(hip.x, hipY);
  ctx.rotate(p.lean);
  const neck = { x: 0, y: -40 };
  const shoulder = { x: 0, y: -36 };
  const head = { x: 2, y: -55 };

  const wt = d.weaponType;
  const handT = { x: shoulder.x + Math.cos(p.arm) * 36 + p.reach, y: shoulder.y + Math.sin(p.arm) * 36 };
  const front = ik(shoulder, handT, 22, 22, j => j.y);
  const hand = front.end;

  let backT;
  if (TWO_HANDED[wt] !== undefined) {
    backT = { x: hand.x + Math.cos(p.weapon) * TWO_HANDED[wt], y: hand.y + Math.sin(p.weapon) * TWO_HANDED[wt] };
  } else if (wt === 'bow') {
    const drawn = f.state === 'attack' && (f.move.anim === 'shoot' || f.move.anim === 'shootUp') && f.phase() === 'startup';
    backT = drawn ? { x: shoulder.x + Math.cos(p.weapon) * 4, y: shoulder.y + Math.sin(p.weapon) * 4 }
      : { x: hand.x - Math.cos(p.weapon) * 10, y: hand.y - Math.sin(p.weapon) * 10 };
  } else if (p.back) {
    backT = { x: shoulder.x + Math.cos(p.back.arm) * 36 + (p.back.reach || 0), y: shoulder.y + Math.sin(p.back.arm) * 36 };
  } else if (wt === 'fists') {
    backT = ['hitstun', 'ko', 'down'].includes(f.state) ? { x: -14, y: -4 } : { x: 20, y: -50 };
  } else if (wt === 'daggers') {
    backT = { x: shoulder.x + Math.cos(p.arm + 0.7) * 34 - 8, y: shoulder.y + Math.sin(p.arm + 0.7) * 34 };
  } else {
    backT = { x: -16, y: -4 + Math.sin(t * 0.09 + f.index) * 1.5 };
  }
  const backArm = ik(shoulder, backT, 22, 22, j => j.y);

  limb(ctx, [shoulder, backArm.joint, backArm.end], back, lw * 0.92);
  if (wt === 'daggers') drawDagger(ctx, backArm.end, p.back ? p.back.weapon : p.weapon + 0.5, f.color);
  if (wt === 'fists') disc(ctx, backArm.end.x, backArm.end.y, 7.5 * bulk, f.color);

  ctx.restore();
  limb(ctx, [hip, legs[0].joint, legs[0].end], body, lw);
  ctx.save();
  ctx.translate(hip.x, hipY);
  ctx.rotate(p.lean);

  limb(ctx, [{ x: 0, y: 0 }, neck], body, lw * 1.2);
  disc(ctx, head.x, head.y, 12.5, body);

  drawWeapon(ctx, f, hand, backArm.end, p.weapon, opts);
  limb(ctx, [shoulder, front.joint, hand], body, lw * 0.92);
  if (wt === 'fists') disc(ctx, hand.x, hand.y, 7.5 * bulk, f.color);

  // Segmento que deja estela: puño o pie para golpes sin arma
  if (opts.onStrike && wt === 'fists') strike(ctx, opts, front.joint, hand);
  if (p.shield) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(12, -24, 52, -1.15, 1.15); ctx.stroke();
    ctx.strokeStyle = hexA(f.color, 0.3);
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(12, -24, 52, -1.05, 1.05); ctx.stroke();
  }
  ctx.restore();
  if (opts.onStrike && p.kick) strike(ctx, opts, legs[0].joint, legs[0].end);
  ctx.restore();
}

function strike(ctx, opts, a, b) {
  const m = ctx.getTransform();
  opts.onStrike(m.transformPoint(new DOMPoint(a.x, a.y)), m.transformPoint(new DOMPoint(b.x, b.y)));
}

function drawDagger(ctx, h, ang, col) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(ang);
  limb(ctx, [{ x: -5, y: 0 }, { x: 5, y: 0 }], col, 5);
  bladeShape(ctx, 5, 30, 4);
  ctx.restore();
}

function bladeShape(ctx, from, to, half) {
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.moveTo(from, -half - 1.5); ctx.lineTo(to, -1.5); ctx.lineTo(to + 9, 0); ctx.lineTo(to, 1.5); ctx.lineTo(from, half + 1.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eceff2';
  ctx.beginPath();
  ctx.moveTo(from + 1, -half); ctx.lineTo(to, -0.5); ctx.lineTo(to + 6, 0); ctx.lineTo(to, 0.5); ctx.lineTo(from + 1, half);
  ctx.closePath(); ctx.fill();
}

const SHAFT = '#2f2f2f';
const STRIKE_SEG = {          // tramo del arma que deja estela [base, punta]
  sword: [24, 80], hammer: [30, 92], spear: [40, 112], daggers: [10, 38],
  bow: [-14, 24], scythe: [30, 100], staff: [20, 84],
};

function drawWeapon(ctx, f, hand, backHand, ang, opts) {
  const wt = f.def.weaponType;
  const col = f.color;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);

  if (opts.onStrike && STRIKE_SEG[wt]) {
    const [a, b] = STRIKE_SEG[wt];
    const m = ctx.getTransform();
    opts.onStrike(m.transformPoint(new DOMPoint(a, 0)), m.transformPoint(new DOMPoint(b, 0)));
  }

  switch (wt) {
    case 'sword':
      limb(ctx, [{ x: -12, y: 0 }, { x: 3, y: 0 }], SHAFT, 5);
      limb(ctx, [{ x: 4, y: -10 }, { x: 4, y: 10 }], col, 4.5);
      bladeShape(ctx, 6, 78, 4.5);
      ctx.fillStyle = col; ctx.fillRect(8, -1.2, 50, 2.4);
      break;
    case 'hammer':
      limb(ctx, [{ x: -26, y: 0 }, { x: 60, y: 0 }], SHAFT, 5);
      ctx.fillStyle = OUT; ctx.fillRect(52, -26, 44, 52);
      ctx.fillStyle = '#a7abb0'; ctx.fillRect(54, -24, 40, 48);
      ctx.fillStyle = '#8c9095'; ctx.fillRect(80, -24, 14, 48);
      ctx.fillStyle = col; ctx.fillRect(62, -24, 8, 48);
      break;
    case 'spear':
      limb(ctx, [{ x: -40, y: 0 }, { x: 96, y: 0 }], SHAFT, 4.5);
      limb(ctx, [{ x: 88, y: -6 }, { x: 88, y: 6 }], col, 4);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(92, 0); ctx.lineTo(80, -10); ctx.lineTo(84, 0); ctx.lineTo(80, 10); ctx.fill();
      bladeShape(ctx, 94, 110, 6);
      break;
    case 'daggers':
      limb(ctx, [{ x: -5, y: 0 }, { x: 5, y: 0 }], col, 5);
      bladeShape(ctx, 5, 30, 4);
      break;
    case 'bow': {
      ctx.strokeStyle = OUT; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(-16, 0, 34, -1.05, 1.05); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-16, 0, 34, -1.05, 1.05); ctx.stroke();
      const c = Math.cos(-1.05) * 34 - 16, sy = Math.sin(-1.05) * 34;
      ctx.restore();
      ctx.save();
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const tx = hand.x + c * ca - sy * sa, ty = hand.y + c * sa + sy * ca;
      const bx = hand.x + c * ca + sy * sa, by = hand.y + c * sa - sy * ca;
      ctx.strokeStyle = 'rgba(30,30,30,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(backHand.x, backHand.y); ctx.lineTo(bx, by); ctx.stroke();
      break;
    }
    case 'scythe':
      limb(ctx, [{ x: -34, y: 0 }, { x: 86, y: 0 }], SHAFT, 4.5);
      ctx.fillStyle = col; ctx.fillRect(56, -4, 10, 8);
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.moveTo(86, -5); ctx.quadraticCurveTo(82, 46, 22, 58); ctx.quadraticCurveTo(66, 32, 76, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e9ecef';
      ctx.beginPath(); ctx.moveTo(84, -2); ctx.quadraticCurveTo(80, 42, 30, 53); ctx.quadraticCurveTo(68, 31, 77, -2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(80, 2); ctx.quadraticCurveTo(76, 36, 34, 50); ctx.stroke();
      break;
    case 'staff': {
      limb(ctx, [{ x: -38, y: 0 }, { x: 74, y: 0 }], SHAFT, 4.5);
      limb(ctx, [{ x: 70, y: -8 }, { x: 78, y: 0 }, { x: 70, y: 8 }], col, 3);
      const g = ctx.createRadialGradient(82, 0, 1, 82, 0, 22);
      g.addColorStop(0, hexA(col, 0.95)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(82, 0, 22, 0, TAU); ctx.fill();
      disc(ctx, 82, 0, 6.5, '#ffffff');
      break;
    }
  }
  ctx.restore();
}

// ---------- Renderizador ----------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    this.stage = STAGES[0];
    this.blood = true;
    this.t = 0;
    this.cam = { x: STAGE_W / 2, zoom: 1.15, punch: 0 };
    this.reset();
  }

  setStage(i) { this.stage = STAGES[i % STAGES.length]; }

  reset() {
    this.particles = [];
    this.texts = [];
    this.decals = [];
    this.trails = [[], []];
    this.ghosts = [];
    this.trail = [null, null];
    this.shake = 0;
    this.lastFrame = -1;
    this.lastRound = null;
    this.cam = { x: STAGE_W / 2, zoom: 1.15, punch: 0 };
  }

  // ---------- Eventos de la simulación → efectos ----------
  consume(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': this.impact(e); break;
        case 'block':
          this.sparks(e.x, e.y, 10, ['#ffffff', '#cfe6ff'], 4);
          this.particles.push({ kind: 'ring', x: e.x, y: e.y, life: 9, max: 9, r: 26, color: '#ffffff' });
          this.shake = Math.max(this.shake, 2);
          break;
        case 'clash':
          this.particles.push({ kind: 'flash', x: e.x, y: e.y, life: 12, max: 12, r: 80, spikes: 14 });
          this.particles.push({ kind: 'ring', x: e.x, y: e.y, life: 14, max: 14, r: 60, color: '#ffffff' });
          this.sparks(e.x, e.y, 30, ['#ffffff', '#ffe6a3', '#ffb347'], 9);
          this.shake = Math.max(this.shake, 9);
          this.cam.punch = Math.max(this.cam.punch, 0.06);
          break;
        case 'dust':
          for (let i = 0; i < 3; i++) this.smoke(e.x + rand(-12, 12), e.y - 4, rand(5, 9), rand(-1, 1), rand(-1.2, -0.3), 20, 0.35);
          break;
        case 'thud':
          for (let i = 0; i < 9; i++) this.smoke(e.x + rand(-40, 40), e.y - rand(2, 14), rand(10, 20), rand(-2.5, 2.5), rand(-1.5, -0.2), rand(30, 45), 0.5);
          this.debris(e.x, e.y, 6);
          this.shake = Math.max(this.shake, 6);
          break;
        case 'slam':
          this.crack(e.x, e.y);
          for (let i = 0; i < 12; i++) this.smoke(e.x + rand(-50, 50), e.y - rand(4, 30), rand(14, 26), rand(-3, 3), rand(-2, -0.3), rand(35, 55), 0.55);
          this.debris(e.x, e.y, 14);
          this.particles.push({ kind: 'groundRing', x: e.x, y: e.y, life: 16, max: 16, r: 120 });
          this.shake = Math.max(this.shake, 11);
          this.cam.punch = Math.max(this.cam.punch, 0.04);
          break;
        case 'dash':
          for (let i = 0; i < 6; i++) {
            this.particles.push({ kind: 'streak', x: e.x - e.dir * rand(10, 50), y: e.y - rand(20, 110), vx: -e.dir * rand(4, 8), vy: 0, life: 12, max: 12, len: rand(30, 70) });
          }
          for (let i = 0; i < 4; i++) this.smoke(e.x - e.dir * 10, e.y - 4, rand(6, 11), -e.dir * rand(1, 3), rand(-1, -0.2), 22, 0.4);
          break;
        case 'airjump':
          this.particles.push({ kind: 'groundRing', x: e.x, y: e.y + 4, life: 12, max: 12, r: 34 });
          for (let i = 0; i < 3; i++) this.smoke(e.x + rand(-10, 10), e.y, rand(5, 8), rand(-1, 1), rand(0.5, 1.5), 18, 0.35);
          break;
        case 'teleport':
          for (let i = 0; i < 20; i++) {
            const a = Math.random() * TAU;
            this.particles.push({ kind: 'dot', x: e.x, y: e.y, vx: Math.cos(a) * 3.5, vy: Math.sin(a) * 4, life: 24, max: 24, color: i % 2 ? e.color : '#1a1a1a', r: rand(2, 5) });
          }
          this.particles.push({ kind: 'ring', x: e.x, y: e.y, life: 12, max: 12, r: 50, color: e.color });
          break;
        case 'heal':
          for (let i = 0; i < 16; i++) {
            this.particles.push({ kind: 'plus', x: e.x + rand(-25, 25), y: e.y + rand(0, 50), vx: 0, vy: -1.5 - Math.random() * 2, life: 40, max: 40, color: '#4ee08a' });
          }
          break;
        case 'text':
          this.texts.push({ text: e.text, x: e.x, y: e.y, life: 60, max: 60, color: e.color, size: 24 });
          break;
        case 'roundEnd':
          this.shake = Math.max(this.shake, 12);
          this.cam.punch = Math.max(this.cam.punch, 0.08);
          break;
      }
    }
    events.length = 0;
  }

  impact(e) {
    const str = e.strength;
    const dir = e.dir || 1;
    this.particles.push({ kind: 'flash', x: e.x, y: e.y, life: 7 + str * 2, max: 7 + str * 2, r: 24 + str * 16, spikes: 8 + str * 2 });
    this.particles.push({ kind: 'ring', x: e.x, y: e.y, life: 10, max: 10, r: 16 + str * 14, color: '#ffffff' });
    if (str >= 2) this.particles.push({ kind: 'lines', x: e.x, y: e.y, life: 7, max: 7, r: 40 + str * 20, seed: Math.random() * 100 });
    this.sparks(e.x, e.y, 6 + str * 4, ['#ffffff', '#fff3c4'], 5 + str * 2, dir);
    if (this.blood) {
      const n = 6 + str * 6;
      for (let i = 0; i < n; i++) {
        const sp = rand(2, 5 + str * 2.5);
        const a = rand(-1.1, 0.5);
        this.particles.push({
          kind: 'drop', x: e.x, y: e.y,
          vx: dir * Math.cos(a) * sp + rand(-1, 1), vy: Math.sin(a) * sp - rand(0, 3),
          life: 90, max: 90, r: rand(1.5, 3.8), color: i % 3 ? '#a3001b' : '#d0182f', g: 0.32,
        });
      }
      this.particles.push({ kind: 'mist', x: e.x + dir * 10, y: e.y, vx: dir * 0.8, life: 26, max: 26, r: 18 + str * 8, color: '#b01226' });
    }
    if (e.knock) for (let i = 0; i < 4; i++) this.smoke(e.x, e.y + rand(-10, 10), rand(8, 14), dir * rand(1, 3), rand(-1, 1), 26, 0.4);
    this.texts.push({ text: String(e.damage), x: e.x + rand(-10, 10), y: e.y - 16, life: 40, max: 40, color: '#ffffff', size: 18 + str * 4 });
    if (e.combo >= 2) this.texts.push({ text: `${e.combo} GOLPES`, x: e.x, y: e.y - 48, life: 40, max: 40, color: '#ffd166', size: 18 });
    this.shake = Math.max(this.shake, 2 + str * 3);
    if (str >= 3) this.cam.punch = Math.max(this.cam.punch, 0.05);
  }

  sparks(x, y, n, colors, speed, dir = 0) {
    for (let i = 0; i < n; i++) {
      const a = dir ? (dir > 0 ? 0 : Math.PI) + rand(-1.3, 1.3) : Math.random() * TAU;
      const sp = rand(speed * 0.4, speed);
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(10, 20), max: 20, color: colors[i % colors.length] });
    }
  }

  smoke(x, y, r, vx, vy, life, alpha) {
    this.particles.push({ kind: 'smoke', x, y, r, vx, vy, life, max: life, alpha, tone: rand(0.35, 0.6) });
  }

  debris(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ kind: 'rock', x: x + rand(-30, 30), y: y - 2, vx: rand(-4, 4), vy: rand(-8, -2), life: 50, max: 50, r: rand(2, 5), g: 0.4, rot: rand(0, 3), color: i % 2 ? '#5d5d5d' : '#7a7a7a' });
    }
  }

  crack(x, y) {
    const lines = [];
    for (let i = 0; i < 7; i++) {
      const dir = i % 2 ? 1 : -1;
      const pts = [{ x, y: y + 1 }];
      let cx = x, cy = y + 1;
      const len = rand(30, 90);
      for (let s = 0; s < 4; s++) { cx += dir * len / 4 + rand(-6, 6); cy += rand(0.5, 4); pts.push({ x: cx, y: cy }); }
      lines.push(pts);
    }
    this.decals.push({ kind: 'crack', x, y, lines });
  }

  // ---------- Cámara ----------
  updateCamera(match, view) {
    let tx = STAGE_W / 2, tz = 1.15, speed = 0.08;
    if (match) {
      const [a, b] = view || match.fighters;
      const sep = Math.abs(a.x - b.x);
      tx = (a.x + b.x) / 2;
      tz = Math.max(1, Math.min(1.45, STAGE_W / (sep + 420)));
      if (match.phase === 'ko' && match.roundEndReason === 'ko' && match.phaseTime < 90) {
        const loser = match.fighters.find(f => f.state === 'ko') || a;
        tx = lerp(tx, loser.x, 0.6); tz = 1.6; speed = 0.12;
      }
    }
    this.cam.x = lerp(this.cam.x, tx, speed);
    this.cam.zoom = lerp(this.cam.zoom, tz, speed);
    this.cam.punch *= 0.85;
  }

  applyCamera(ctx) {
    const z = this.cam.zoom * (1 + this.cam.punch);
    const half = STAGE_W / 2 / z;
    const cx = Math.max(half, Math.min(STAGE_W - half, this.cam.x));
    ctx.translate(STAGE_W / 2, GROUND_SCREEN);
    ctx.scale(z, z);
    ctx.translate(-cx, -GROUND);
    this.camInv = ctx.getTransform().inverse();
  }

  // ---------- Dibujo principal ----------
  draw(match, opts = {}) {
    const ctx = this.ctx;
    this.t++;
    this.blood = opts.blood ?? this.blood;
    if (match && match.round !== this.lastRound) {
      this.lastRound = match.round;
      this.decals = [];
      this.trails = [[], []];
      this.ghosts = [];
    }
    const progressed = match && match.frame !== this.lastFrame && match.hitstop === 0;
    if (match) this.lastFrame = match.frame;
    // Interpolación entre el frame anterior y el actual de la simulación
    const alpha = Math.max(0, Math.min(1, opts.alpha ?? 1));
    const view = match ? match.fighters.map((f, i) => {
      const prev = match.prevPos?.[i];
      if (!prev) return f;
      const v = Object.create(f);
      v.x = lerp(prev.x, f.x, alpha);
      v.y = lerp(prev.y, f.y, alpha);
      return v;
    }) : null;
    this.updateCamera(match, view);

    ctx.save();
    drawBackground(ctx, this.stage);
    if (this.shake > 0.3) {
      ctx.translate(rand(-0.5, 0.5) * this.shake, rand(-0.5, 0.5) * this.shake);
      this.shake *= 0.86;
    }
    this.applyCamera(ctx);
    drawFloor(ctx, this.stage);
    this.drawDecals(ctx);

    if (match) {
      for (const p of match.projectiles) this.drawProjectile(ctx, p, match);
      this.updateGhosts(ctx, match, progressed);
      const order = [...view].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
      for (const v of order) {
        const f = match.fighters[v.index];
        const capture = this.wantsTrail(f) ? [] : null;
        drawFigure(ctx, v, this.t, capture ? { key: f, onStrike: (a, b) => capture.push(a, b) } : { key: f });
        this.recordTrail(f, capture, progressed);
      }
      for (const f of match.fighters) this.drawTrail(ctx, f);
      if (opts.showHitboxes) this.drawDebug(ctx, match);
    }
    this.updateParticles(ctx);
    ctx.restore();
    if (match) {
      this.drawHud(ctx, match, opts);
      this.drawAnnouncer(ctx, match);
    }
  }

  // ---------- Estelas de los golpes ----------
  wantsTrail(f) {
    if (f.state !== 'attack' || !f.move.hitbox) return false;
    const m = f.move, fr = f.moveFrame;
    return fr >= m.startup - 3 && fr < m.startup + m.active + 4;
  }

  recordTrail(f, capture, progressed) {
    const tr = this.trails[f.index];
    if (progressed) for (const e of tr) e.age++;
    if (capture && capture.length >= 2 && progressed) {
      const [a, b] = capture;
      const pa = this.camInv.transformPoint(a), pb = this.camInv.transformPoint(b);
      tr.push({ a: { x: pa.x, y: pa.y }, b: { x: pb.x, y: pb.y }, age: 0 });
    }
    while (tr.length && tr[0].age > 6) tr.shift();
  }

  drawTrail(ctx, f) {
    const tr = this.trails[f.index];
    if (tr.length < 2) return;
    for (let i = 1; i < tr.length; i++) {
      const p0 = tr[i - 1], p1 = tr[i];
      const a = Math.max(0, 1 - p1.age / 7);
      ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
      ctx.beginPath();
      ctx.moveTo(p0.a.x, p0.a.y); ctx.lineTo(p0.b.x, p0.b.y); ctx.lineTo(p1.b.x, p1.b.y); ctx.lineTo(p1.a.x, p1.a.y);
      ctx.closePath(); ctx.fill();
    }
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const p0 = tr[i - 1], p1 = tr[i];
      const a = Math.max(0, 1 - p1.age / 7);
      ctx.strokeStyle = hexA(f.color, 0.9 * a);
      ctx.lineWidth = 2 + 5 * a;
      ctx.beginPath(); ctx.moveTo(p0.b.x, p0.b.y); ctx.lineTo(p1.b.x, p1.b.y); ctx.stroke();
    }
  }

  // ---------- Imágenes residuales (dash, embestidas, teletransporte) ----------
  updateGhosts(ctx, match, progressed) {
    if (progressed && match.frame % 2 === 0) {
      for (const f of match.fighters) {
        const fast = f.state === 'dash' || (f.state === 'attack' && f.move.dash && Math.abs(f.vx) > 5) ||
          (f.state === 'hitstun' && f.knock && !f.grounded) || (f.state === 'ko' && !f.grounded);
        if (fast) this.ghosts.push({ snap: Object.assign(Object.create(Object.getPrototypeOf(f)), f, { flash: 0 }), life: 10 });
      }
    }
    for (const g of this.ghosts) {
      g.life--;
      drawFigure(ctx, g.snap, this.t, { alpha: 0.28 * g.life / 10, body: hexA(g.snap.color, 1), noShadow: true, raw: true });
    }
    this.ghosts = this.ghosts.filter(g => g.life > 0);
  }

  drawDecals(ctx) {
    for (const d of this.decals) {
      if (d.kind === 'stain') {
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.w, d.h, 0, 0, TAU); ctx.fill();
      } else if (d.kind === 'crack') {
        ctx.strokeStyle = 'rgba(30,30,30,0.55)';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        for (const pts of d.lines) {
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (const q of pts) ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,40,40,0.25)';
        ctx.beginPath(); ctx.ellipse(d.x, d.y + 3, 46, 5, 0, 0, TAU); ctx.fill();
      }
    }
  }

  drawProjectile(ctx, p, match) {
    const col = match.fighters[p.owner].color;
    const t = this.t;
    ctx.save();
    ctx.translate(p.x, p.y);
    const dir = p.vx !== 0 ? Math.sign(p.vx) : p.facing;
    switch (p.spec.style) {
      case 'wave':
        ctx.scale(dir, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(-6, 0, p.h / 2 + 4, -1.2, 1.2); ctx.arc(-22, 0, p.h / 2, 1.1, -1.1, true); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(-6, 0, p.h / 2 + 4, -1.15, 1.15); ctx.stroke();
        break;
      case 'quake':
        for (let i = 0; i < 4; i++) {
          const h = 16 + ((p.age * 3 + i * 17) % 34);
          const x = -p.w / 2 + i * (p.w / 4);
          ctx.fillStyle = i % 2 ? '#6e6e6e' : '#8a8a8a';
          ctx.beginPath(); ctx.moveTo(x, p.h / 2); ctx.lineTo(x + 6, p.h / 2 - h); ctx.lineTo(x + 14, p.h / 2); ctx.fill();
        }
        if (p.age % 3 === 0) this.smoke(p.x, GROUND - 6, rand(6, 12), rand(-1, 1), -1, 22, 0.4);
        break;
      case 'spear':
        ctx.scale(dir, 1);
        limb(ctx, [{ x: -p.w / 2, y: 0 }, { x: p.w / 2 - 10, y: 0 }], SHAFT, 4.5);
        bladeShape(ctx, p.w / 2 - 12, p.w / 2 + 2, 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-p.w / 2 - 10 - i * 14, -6 + i * 6); ctx.lineTo(-p.w / 2 - 34 - i * 14, -6 + i * 6); ctx.stroke(); }
        break;
      case 'dagger':
        ctx.rotate(p.age * 0.6 * dir);
        bladeShape(ctx, -9, 9, 3.5);
        break;
      case 'arrow':
        ctx.rotate(Math.atan2(p.vy, p.vx));
        limb(ctx, [{ x: -20, y: 0 }, { x: 14, y: 0 }], SHAFT, 2.5);
        bladeShape(ctx, 12, 18, 3.5);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-27, -6); ctx.lineTo(-15, 0); ctx.lineTo(-27, 6); ctx.fill();
        break;
      case 'trap': {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.15);
        ctx.fillStyle = hexA(col, 0.25 + 0.25 * pulse);
        ctx.beginPath(); ctx.ellipse(0, p.h / 2 - 2, p.w / 2 + 4, 6, 0, 0, TAU); ctx.fill();
        for (let i = -2; i <= 2; i++) {
          ctx.fillStyle = OUT;
          ctx.beginPath(); ctx.moveTo(i * 9 - 4, p.h / 2); ctx.lineTo(i * 9, p.h / 2 - 14); ctx.lineTo(i * 9 + 4, p.h / 2); ctx.fill();
        }
        break;
      }
      case 'ghost': {
        ctx.scale(dir, 1);
        const wob = Math.sin(t * 0.2) * 4;
        ctx.fillStyle = 'rgba(20,20,20,0.25)';
        ctx.beginPath(); ctx.ellipse(-16, wob, 32, 22, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(20,20,20,0.85)';
        ctx.beginPath(); ctx.arc(4, wob, 18, 0, TAU); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(10, wob - 4, 3.5, 0, TAU); ctx.arc(0, wob - 4, 3.5, 0, TAU); ctx.fill();
        break;
      }
      case 'orb': {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, hexA(col, 0.9)); g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
        break;
      }
      case 'bolt':
        ctx.scale(dir, 1);
        for (const [c, w] of [[hexA(col, 0.5), 10], ['#ffffff', 3]]) {
          ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(-p.w / 2, 0);
          for (let i = 1; i <= 6; i++) ctx.lineTo(-p.w / 2 + i * p.w / 6, ((i * 7 + t * 3) % 11) - 5);
          ctx.stroke();
        }
        break;
    }
    ctx.restore();
  }

  updateParticles(ctx) {
    for (const p of this.particles) {
      p.life--;
      const a = Math.max(0, p.life / p.max);
      switch (p.kind) {
        case 'flash': {
          const k = 1 - a;
          const r = p.r * (0.6 + k * 0.6);
          ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
          ctx.beginPath();
          for (let i = 0; i < p.spikes * 2; i++) {
            const ang = i / (p.spikes * 2) * TAU + p.x;
            const rr = i % 2 ? r * 0.28 : r * (0.7 + ((i * 37) % 10) / 20);
            ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
          }
          ctx.closePath(); ctx.fill();
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.8);
          g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.8, 0, TAU); ctx.fill();
          continue;
        }
        case 'ring':
          ctx.strokeStyle = hexA(p.color, a * 0.9);
          ctx.lineWidth = 3 * a + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.7 - a * 0.7), 0, TAU); ctx.stroke();
          continue;
        case 'groundRing':
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
          ctx.lineWidth = 4 * a + 1;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (1.4 - a), 12 * (1.4 - a), 0, 0, TAU); ctx.stroke();
          continue;
        case 'lines': {
          ctx.strokeStyle = `rgba(20,20,20,${0.5 * a})`;
          ctx.lineWidth = 2;
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * TAU + p.seed;
            const r1 = p.r * (0.9 + (i % 3) * 0.2), r2 = r1 + 30 + (i % 4) * 10;
            ctx.beginPath(); ctx.moveTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1);
            ctx.lineTo(p.x + Math.cos(ang) * r2, p.y + Math.sin(ang) * r2); ctx.stroke();
          }
          continue;
        }
      }
      p.x += p.vx || 0;
      p.y += p.vy || 0;
      if (p.g) p.vy += p.g;
      switch (p.kind) {
        case 'spark':
          p.vx *= 0.9; p.vy *= 0.9;
          ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5); ctx.stroke();
          break;
        case 'drop':
          if (p.y >= GROUND + 2) {
            p.life = 0;
            if (this.decals.length < 500) this.decals.push({ kind: 'stain', x: p.x, y: GROUND + rand(1, 7), w: p.r * rand(1.5, 3.2), h: p.r * 0.6, color: p.color });
            break;
          }
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.3, p.r, Math.atan2(p.vy, p.vx), 0, TAU); ctx.fill();
          break;
        case 'mist':
          ctx.fillStyle = hexA(p.color, 0.3 * a);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - a * 0.6), 0, TAU); ctx.fill();
          break;
        case 'smoke': {
          p.vx *= 0.94; p.vy *= 0.94;
          const v = Math.round(255 * p.tone);
          ctx.fillStyle = `rgba(${v},${v},${v},${p.alpha * a})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.8 - a * 0.8), 0, TAU); ctx.fill();
          break;
        }
        case 'rock':
          if (p.y > GROUND) { p.y = GROUND; p.vy *= -0.3; p.vx *= 0.6; }
          p.rot += p.vx * 0.1;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = p.color; ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 1.6);
          ctx.restore();
          break;
        case 'streak':
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.sign(p.vx) * p.len, p.y); ctx.stroke();
          break;
        case 'dot':
          p.vx *= 0.9; p.vy *= 0.9;
          ctx.globalAlpha = a; disc(ctx, p.x, p.y, p.r, p.color);
          break;
        case 'plus':
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 4, p.y - 1.5, 8, 3); ctx.fillRect(p.x - 1.5, p.y - 4, 3, 8);
          break;
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
      outlined(ctx, t.text, t.x, t.y, t.color, 5);
      ctx.globalAlpha = 1;
    }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  drawDebug(ctx, match) {
    ctx.lineWidth = 2;
    for (const f of match.fighters) {
      const h = f.hurtbox();
      ctx.strokeStyle = f.invulnerable ? 'rgba(60,140,255,0.9)' : 'rgba(30,200,80,0.95)';
      ctx.strokeRect(h.x, h.y, h.w, h.h);
      if (f.state === 'attack' && f.move.hitbox) {
        const b = worldHitbox(f, f.move.hitbox);
        const active = f.phase() === 'active';
        ctx.strokeStyle = active ? 'rgba(255,40,40,0.95)' : 'rgba(255,40,40,0.35)';
        ctx.fillStyle = active ? 'rgba(255,40,40,0.2)' : 'transparent';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      ctx.fillStyle = OUT;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${f.state}${f.move ? ' ' + f.moveKey + ' ' + f.phase() : ''}`, f.x, GROUND + 20);
    }
    for (const p of match.projectiles) {
      const b = projBox(p);
      ctx.strokeStyle = 'rgba(255,40,40,0.95)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  // ---------- Interfaz ----------
  drawHud(ctx, match, opts) {
    const W = STAGE_W;
    const barW = 370, barH = 20, top = 24;
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
      ctx.fillStyle = ratio > 0.25 ? f.color : '#e0263a';
      skew(ctx, left ? x + barW - hw : x, top, hw, barH, left); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      skew(ctx, left ? x + barW - hw : x, top, hw, 4, left); ctx.fill();

      // Retrato: cabeza del color del jugador
      const hx = left ? x + 14 : x + barW - 14;
      disc(ctx, hx, top + barH + 26, 13, OUT);
      disc(ctx, hx, top + barH + 26, 10.5, BODY[i]);

      ctx.textAlign = left ? 'left' : 'right';
      ctx.font = '28px "Bebas Neue", Impact, sans-serif';
      outlined(ctx, f.def.name.toUpperCase(), left ? x + 34 : x + barW - 34, top + barH + 34, '#fff', 5);
      ctx.font = '600 12px Inter, sans-serif';
      const label = opts.labels?.[i] ?? '';
      outlined(ctx, `${f.def.weapon}${label ? ' · ' + label : ''}`, left ? x + 34 : x + barW - 34, top + barH + 50, '#fff', 4);

      for (let r = 0; r < match.winsNeeded; r++) {
        const cx = left ? x + barW - 10 - r * 22 : x + 10 + r * 22;
        ctx.beginPath(); ctx.arc(cx, top + barH + 16, 7, 0, TAU);
        ctx.fillStyle = r < f.wins ? f.color : 'rgba(255,255,255,0.6)';
        ctx.fill();
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.stroke();
      }

      const isBot = opts.botIndex === i;
      const skillKey = opts.bindings ? controlName(opts.bindings[i]?.skill) : 'J';
      const dirs = { neutral: '', forward: (left ? '→' : '←') + '+', down: '↓+' };
      ['neutral', 'forward', 'down'].forEach((k, j) => {
        const sk = f.def.skills[k];
        const cw = 116, ch = 28;
        const sx = left ? x + j * (cw + 6) : x + barW - cw - j * (cw + 6);
        const sy = top + barH + 60;
        const cd = f.cooldowns[k];
        const ready = cd <= 0;
        ctx.fillStyle = 'rgba(20,20,20,0.82)';
        roundRect(ctx, sx, sy, cw, ch, 5); ctx.fill();
        if (!ready) {
          ctx.fillStyle = hexA(f.color, 0.35);
          roundRect(ctx, sx, sy, Math.max(10, cw * (1 - cd / sk.cooldown)), ch, 5); ctx.fill();
        } else {
          ctx.strokeStyle = f.color; ctx.lineWidth = 2;
          roundRect(ctx, sx, sy, cw, ch, 5); ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.45)';
        ctx.fillText(fit(ctx, sk.name, cw - 14), sx + 7, sy + 12);
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = ready ? f.color : 'rgba(255,255,255,0.45)';
        ctx.fillText(ready ? (isBot ? 'Lista' : `${dirs[k]}${skillKey}`) : `${Math.ceil(cd / 60)} s`, sx + 7, sy + 23);
      });
    });

    const secs = Math.max(0, Math.ceil(match.timer / 60));
    disc(ctx, W / 2, top + 12, 30, OUT);
    ctx.strokeStyle = secs <= 10 ? '#e0263a' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, top + 12, 30, 0, TAU); ctx.stroke();
    ctx.font = '36px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = secs <= 10 ? '#ff6b6b' : '#fff';
    ctx.fillText(String(secs), W / 2, top + 25);
    ctx.font = 'bold 12px Inter, sans-serif';
    outlined(ctx, `RONDA ${match.round}`, W / 2, top + 60, '#fff', 4);
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
      color = '#e0263a';
      if (pt > 60) sub = match.roundWinner ? `${match.roundWinner.def.name.toUpperCase()} GANA LA RONDA` : 'EMPATE';
    } else if (match.phase === 'matchover' && pt < 90) {
      text = `¡${match.matchWinner.def.name.toUpperCase()} GANA!`;
      color = match.matchWinner.color;
    }
    if (!text) return;
    const intro = match.phase === 'intro' ? (pt < 70 ? pt : pt - 70) : pt;
    const scale = 1 + Math.max(0, 1 - intro / 10) * 0.6;
    ctx.save();
    ctx.translate(STAGE_W / 2, STAGE_H / 2 - 40);
    ctx.scale(scale, scale);
    ctx.font = '104px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center';
    outlined(ctx, text, 0, 30, color, 12);
    ctx.restore();
    if (sub) {
      ctx.font = '32px "Bebas Neue", Impact, sans-serif';
      ctx.textAlign = 'center';
      outlined(ctx, sub, STAGE_W / 2, STAGE_H / 2 + 34, '#fff', 7);
    }
  }
}

// ---------- Escenario: gris plano, como en las animaciones ----------
export function drawBackground(ctx, st) {
  const g = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  g.addColorStop(0, st.top);
  g.addColorStop(1, st.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

export function drawFloor(ctx, st) {
  ctx.fillStyle = st.floor;
  ctx.fillRect(-400, GROUND, STAGE_W + 800, 400);
  // Banda suave del horizonte
  const g = ctx.createLinearGradient(0, GROUND - 70, 0, GROUND);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, st.band);
  ctx.fillStyle = g;
  ctx.fillRect(-400, GROUND - 70, STAGE_W + 800, 70);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(-400, GROUND, STAGE_W + 800, 2);
  const g2 = ctx.createLinearGradient(0, GROUND, 0, GROUND + 120);
  g2.addColorStop(0, 'rgba(0,0,0,0.06)');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(-400, GROUND, STAGE_W + 800, 120);
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

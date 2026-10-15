'use strict';
// ─────────────────────────────────────────────────────────────
//  Esqueleto del stick figure: poses, cinemática directa,
//  IK de dos huesos, muelles de suavizado, tela y ragdoll.
//
//  Convención de ángulos (grados, mirando a la derecha):
//   · extremidades: 0 = recta hacia abajo, + = hacia delante
//   · torso (t):    0 = vertical, + = inclinado hacia delante
//   · rodilla (kf/kb): + dobla la espinilla hacia atrás
//   · codo (ef/eb):    + dobla el antebrazo hacia delante/arriba
//   · arma (w): absoluto, igual que las extremidades
// ─────────────────────────────────────────────────────────────

const BONES = { spine: 30, neck: 5, head: 9.5, thigh: 22, shin: 23, upper: 16, fore: 16 };
const POSE_KEYS = ['hx', 'hy', 't', 'n', 'lf', 'kf', 'lb', 'kb', 'af', 'ef', 'ab', 'eb', 'w', 'rot', 'sq'];

const NEUTRAL = { hx: 0, hy: 0, t: 4, n: 0, lf: 14, kf: 22, lb: -12, kb: 18, af: 18, ef: 30, ab: -12, eb: 25, w: 100, rot: 0, sq: 1 };

function makePose(src) {
  const p = {};
  for (const k of POSE_KEYS) p[k] = src && src[k] != null ? src[k] : NEUTRAL[k];
  return p;
}
function copyPose(dst, src) { for (const k of POSE_KEYS) dst[k] = src[k]; return dst; }
function mergePose(base, partial) {
  const p = copyPose({}, base);
  if (partial) for (const k in partial) if (k in NEUTRAL) p[k] = partial[k];
  return p;
}
function lerpPose(out, a, b, t) {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

// Pista de keyframes: [{f, p(parcial acumulativo), e:'easing'}]
function compileTrack(keys, base) {
  let prev = makePose(base);
  return keys.map((k) => {
    const full = mergePose(prev, k.p);
    prev = full;
    return { f: k.f, pose: full, ease: Ease[k.e || 'outQuad'] || Ease.outQuad };
  });
}
function sampleTrack(track, t, out) {
  if (t <= track[0].f) return copyPose(out, track[0].pose);
  for (let i = 1; i < track.length; i++) {
    const b = track[i];
    if (t <= b.f) {
      const a = track[i - 1];
      const u = (t - a.f) / Math.max(1e-6, b.f - a.f);
      return lerpPose(out, a.pose, b.pose, b.ease(clamp(u, 0, 1)));
    }
  }
  return copyPose(out, track[track.length - 1].pose);
}

// Muelle por articulación: da inercia, solapamiento y un pelín de rebote
class PoseSpring {
  constructor(init) {
    this.cur = makePose(init);
    this.vel = {};
    for (const k of POSE_KEYS) this.vel[k] = 0;
  }
  step(target, k, d) {
    for (const key of POSE_KEYS) {
      const v = this.vel[key] * (1 - d) + (target[key] - this.cur[key]) * k;
      this.vel[key] = v;
      this.cur[key] += v;
    }
  }
  // Tras un giro de 360°, lleva los ángulos acumulados cerca del objetivo
  unwrap(target) {
    for (const key of ['w', 'rot']) {
      const d = angDiff(target[key] * DEG, this.cur[key] * DEG) / DEG;
      this.cur[key] = target[key] + d;
    }
  }
  snap(target) { copyPose(this.cur, target); for (const k of POSE_KEYS) this.vel[k] = 0; }
}

// ── IK de dos huesos: devuelve el codo/rodilla ──
function ik2(sx, sy, tx, ty, l1, l2, bendSign) {
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < 1e-4) d = 1e-4;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = sx + (dx * a) / d, my = sy + (dy * a) / d;
  return { x: mx + (-dy / d) * h * bendSign, y: my + (dx / d) * h * bendSign, hx: sx + dx, hy: sy + dy };
}

const JOINT_NAMES = ['hip', 'neck', 'head', 'sh', 'elF', 'haF', 'elB', 'haB', 'knF', 'ftF', 'knB', 'ftB', 'wBase', 'wTip', 'wBack', 'w2Base', 'w2Tip'];
function makeJoints() {
  const J = {};
  for (const n of JOINT_NAMES) J[n] = { x: 0, y: 0 };
  J.f = 1; J.s = 1; J.headAng = 0; J.wAng = 0;
  return J;
}
function copyJoints(dst, src) {
  for (const n of JOINT_NAMES) { dst[n].x = src[n].x; dst[n].y = src[n].y; }
  dst.f = src.f; dst.s = src.s; dst.headAng = src.headAng; dst.wAng = src.wAng;
  return dst;
}
function lerpJoints(out, a, b, t) {
  for (const n of JOINT_NAMES) {
    out[n].x = a[n].x + (b[n].x - a[n].x) * t;
    out[n].y = a[n].y + (b[n].y - a[n].y) * t;
  }
  out.f = b.f; out.s = b.s; out.headAng = b.headAng; out.wAng = b.wAng;
  return out;
}

// Cinemática directa. o = {x, y (pies), f, s, ground (0..1), weapon}
function solveFK(p, o, J) {
  const f = o.f, s = o.s;
  const Lt = BONES.thigh * s, Ls = BONES.shin * s, Lu = BONES.upper * s, Lf = BONES.fore * s;
  const sin = (a) => Math.sin(a * DEG) * f, cos = (a) => Math.cos(a * DEG);

  // piernas relativas a la cadera
  const kfx = sin(p.lf) * Lt, kfy = cos(p.lf) * Lt;
  const ffx = kfx + sin(p.lf - p.kf) * Ls, ffy = kfy + cos(p.lf - p.kf) * Ls;
  const kbx = sin(p.lb) * Lt, kby = cos(p.lb) * Lt;
  const fbx = kbx + sin(p.lb - p.kb) * Ls, fby = kby + cos(p.lb - p.kb) * Ls;

  const snapY = o.y - Math.max(ffy, fby, 6 * s);
  const airY = o.y - 46 * s + p.hy * s;
  const hipY = lerp(airY, snapY + p.hy * s * 0.25, o.ground);
  const hipX = o.x + p.hx * s * f;

  J.hip.x = hipX; J.hip.y = hipY;
  J.knF.x = hipX + kfx; J.knF.y = hipY + kfy; J.ftF.x = hipX + ffx; J.ftF.y = hipY + ffy;
  J.knB.x = hipX + kbx; J.knB.y = hipY + kby; J.ftB.x = hipX + fbx; J.ftB.y = hipY + fby;

  const sp = BONES.spine * s;
  J.neck.x = hipX + sin(p.t) * sp; J.neck.y = hipY - cos(p.t) * sp;
  const hd = (BONES.neck + BONES.head) * s;
  J.head.x = J.neck.x + sin(p.t + p.n) * hd; J.head.y = J.neck.y - cos(p.t + p.n) * hd;
  J.headAng = p.t + p.n;
  J.sh.x = lerp(J.neck.x, hipX, 0.1); J.sh.y = lerp(J.neck.y, hipY, 0.1);

  J.elF.x = J.sh.x + sin(p.af) * Lu; J.elF.y = J.sh.y + cos(p.af) * Lu;
  J.haF.x = J.elF.x + sin(p.af + p.ef) * Lf; J.haF.y = J.elF.y + cos(p.af + p.ef) * Lf;

  const wp = o.weapon;
  const wl = (wp ? wp.len : 0) * s, wb = (wp ? wp.back || 0 : 0) * s;
  J.wAng = p.w;
  J.wBase.x = J.haF.x; J.wBase.y = J.haF.y;
  J.wTip.x = J.haF.x + sin(p.w) * wl; J.wTip.y = J.haF.y + cos(p.w) * wl;
  J.wBack.x = J.haF.x - sin(p.w) * wb; J.wBack.y = J.haF.y - cos(p.w) * wb;

  if (wp && wp.twoHand != null && !o.freeBack) {
    // la mano trasera agarra el mango por IK
    const tx = J.haF.x + sin(p.w) * wp.twoHand * s, ty = J.haF.y + cos(p.w) * wp.twoHand * s;
    const e = ik2(J.sh.x, J.sh.y, tx, ty, Lu, Lf, -f);
    J.elB.x = e.x; J.elB.y = e.y; J.haB.x = e.hx; J.haB.y = e.hy;
  } else {
    J.elB.x = J.sh.x + sin(p.ab) * Lu; J.elB.y = J.sh.y + cos(p.ab) * Lu;
    J.haB.x = J.elB.x + sin(p.ab + p.eb) * Lf; J.haB.y = J.elB.y + cos(p.ab + p.eb) * Lf;
  }
  // segunda arma (dagas): sigue al antebrazo trasero
  if (wp && wp.dual) {
    const fa = Math.atan2(J.haB.x - J.elB.x, J.haB.y - J.elB.y) / DEG * f;
    const a2 = fa + wp.dualGrip;
    J.w2Base.x = J.haB.x; J.w2Base.y = J.haB.y;
    J.w2Tip.x = J.haB.x + sin(a2) * wl; J.w2Tip.y = J.haB.y + cos(a2) * wl;
  }

  // rotación de cuerpo entero (volteretas, tumbos)
  if (Math.abs(p.rot) > 0.01) {
    const px = hipX, py = hipY - 12 * s;
    const r = p.rot * DEG * (f < 0 ? -1 : 1), c = Math.cos(r), sn = Math.sin(r);
    for (const n of JOINT_NAMES) {
      const q = J[n], dx = q.x - px, dy = q.y - py;
      q.x = px + dx * c - dy * sn; q.y = py + dx * sn + dy * c;
    }
    J.headAng += p.rot; J.wAng += p.rot;
  }
  // squash & stretch alrededor de los pies
  if (Math.abs(p.sq - 1) > 0.002) {
    const sy = p.sq, sx = 1 + (1 - p.sq) * 0.7;
    for (const n of JOINT_NAMES) {
      const q = J[n];
      q.y = o.y + (q.y - o.y) * sy;
      q.x = o.x + (q.x - o.x) * sx;
    }
  }
  J.f = f; J.s = s;
  return J;
}

// ── Dibujo del muñeco ──
function strokeLimb(ctx, a, b, c) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  if (c) ctx.lineTo(c.x, c.y);
  ctx.stroke();
}

function drawWeapon(ctx, J, wp, color, accent, which) {
  if (!wp) return;
  const s = J.s;
  const base = which === 2 ? J.w2Base : J.wBase, tip = which === 2 ? J.w2Tip : J.wTip;
  const dx = tip.x - base.x, dy = tip.y - base.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  ctx.save();
  switch (wp.type) {
    case 'katana': {
      const back = J.wBack;
      ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 4.5 * s; strokeLimb(ctx, back, base);   // tsuka
      ctx.strokeStyle = accent; ctx.lineWidth = 3 * s;
      strokeLimb(ctx, { x: base.x + nx * 5 * s, y: base.y + ny * 5 * s }, { x: base.x - nx * 5 * s, y: base.y - ny * 5 * s }); // tsuba
      ctx.fillStyle = '#e9eef5';
      ctx.beginPath();
      ctx.moveTo(base.x + nx * 1.6 * s, base.y + ny * 1.6 * s);
      ctx.quadraticCurveTo(base.x + dx * 0.6 + nx * 3.2 * s, base.y + dy * 0.6 + ny * 3.2 * s, tip.x, tip.y);
      ctx.lineTo(base.x - nx * 1.4 * s, base.y - ny * 1.4 * s);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'daggers': {
      ctx.fillStyle = '#d9dde8';
      ctx.beginPath();
      ctx.moveTo(base.x + nx * 2.4 * s, base.y + ny * 2.4 * s);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(base.x - nx * 2.4 * s, base.y - ny * 2.4 * s);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 3 * s;
      strokeLimb(ctx, { x: base.x - ux * 4 * s, y: base.y - uy * 4 * s }, { x: base.x + ux * 1 * s, y: base.y + uy * 1 * s });
      break;
    }
    case 'staff': {
      const back = J.wBack;
      ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 4 * s; strokeLimb(ctx, back, tip);
      ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 14 * s;
      ctx.beginPath(); ctx.arc(tip.x + ux * 3 * s, tip.y + uy * 3 * s, 5.2 * s, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(tip.x + ux * 3 * s, tip.y + uy * 3 * s, 2 * s, 0, TAU); ctx.fill();
      break;
    }
    case 'spear': {
      const back = J.wBack;
      ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 3.6 * s; strokeLimb(ctx, back, tip);
      ctx.fillStyle = '#e8edf3';
      ctx.beginPath();
      ctx.moveTo(tip.x + ux * 14 * s, tip.y + uy * 14 * s);
      ctx.lineTo(tip.x + nx * 4 * s, tip.y + ny * 4 * s);
      ctx.lineTo(tip.x - ux * 2 * s, tip.y - uy * 2 * s);
      ctx.lineTo(tip.x - nx * 4 * s, tip.y - ny * 4 * s);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2.5 * s;
      strokeLimb(ctx, { x: tip.x - ux * 3 * s + nx * 3 * s, y: tip.y - uy * 3 * s + ny * 3 * s },
                      { x: tip.x - ux * 3 * s - nx * 3 * s, y: tip.y - uy * 3 * s - ny * 3 * s });
      break;
    }
    case 'revolver': {
      ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = 4.2 * s;
      strokeLimb(ctx, base, tip);
      ctx.lineWidth = 3.4 * s;
      strokeLimb(ctx, base, { x: base.x - ux * 2 * s + nx * -6 * s * J.f, y: base.y - uy * 2 * s + ny * -6 * s * J.f });
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(base.x + ux * 4 * s, base.y + uy * 4 * s, 2.6 * s, 0, TAU); ctx.fill();
      break;
    }
    case 'fists': {
      // guantes en ambas manos
      for (const h of [J.haB, J.haF]) {
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(h.x, h.y, 6.2 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(h.x - 1.5 * s, h.y - 1.8 * s, 2.2 * s, 0, TAU); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

// look = {color, shade, accent, lw, alpha, flash, ghost, weapon, accessoryFn, fighter}
function drawFigure(ctx, J, look) {
  const s = J.s, lw = (look.lw || 6.4) * s;
  ctx.save();
  ctx.globalAlpha = look.alpha == null ? 1 : look.alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const col = look.flash ? '#ffffff' : look.color;
  const shade = look.flash ? '#e6e6e6' : look.shade;
  const ghost = look.ghost;

  if (look.accBack && !ghost) look.accBack(ctx, J, look);

  // contorno oscuro para que se lea sobre cualquier fondo
  if (!ghost) {
    ctx.strokeStyle = 'rgba(8,8,14,0.55)'; ctx.lineWidth = lw + 3.2 * s;
    strokeLimb(ctx, J.sh, J.elB, J.haB); strokeLimb(ctx, J.hip, J.knB, J.ftB);
    strokeLimb(ctx, J.hip, J.neck); strokeLimb(ctx, J.hip, J.knF, J.ftF); strokeLimb(ctx, J.sh, J.elF, J.haF);
    ctx.fillStyle = 'rgba(8,8,14,0.55)';
    ctx.beginPath(); ctx.arc(J.head.x, J.head.y, BONES.head * s + 1.6 * s, 0, TAU); ctx.fill();
  }

  const wp = look.weapon;
  // capa trasera
  ctx.strokeStyle = shade; ctx.lineWidth = lw;
  strokeLimb(ctx, J.sh, J.elB, J.haB);
  if (wp && wp.dual && !ghost) drawWeapon(ctx, J, wp, col, look.accent, 2);
  strokeLimb(ctx, J.hip, J.knB, J.ftB);

  // cuerpo
  ctx.strokeStyle = col;
  ctx.lineWidth = lw * 1.12;
  strokeLimb(ctx, J.hip, J.neck);
  ctx.lineWidth = lw;
  strokeLimb(ctx, J.hip, J.knF, J.ftF);

  // cabeza
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(J.head.x, J.head.y, BONES.head * s, 0, TAU); ctx.fill();
  if (!ghost) {
    // ojo: indica hacia dónde mira
    const ha = J.headAng * DEG;
    const ex = J.head.x + (Math.cos(ha) * 4.2 + Math.sin(ha) * 1.2) * J.f * s;
    const ey = J.head.y + (Math.sin(ha) * 4.2 - Math.cos(ha) * 1.2) * s;
    ctx.fillStyle = look.flash ? '#ffffff' : 'rgba(10,10,18,0.85)';
    ctx.beginPath(); ctx.ellipse(ex, ey, 1.7 * s, 2.6 * s, ha * J.f, 0, TAU); ctx.fill();
  }
  if (look.accFront && !ghost) look.accFront(ctx, J, look);

  // arma y brazo delantero
  if (wp && !ghost && wp.type !== 'fists') {
    const behind = wp.drawBehindArm;
    if (behind) drawWeapon(ctx, J, wp, col, look.accent, 1);
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    strokeLimb(ctx, J.sh, J.elF, J.haF);
    if (!behind) drawWeapon(ctx, J, wp, col, look.accent, 1);
  } else {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    strokeLimb(ctx, J.sh, J.elF, J.haF);
    if (wp && !ghost) drawWeapon(ctx, J, wp, col, look.accent, 1);
  }
  ctx.restore();
}

// ── Tela con verlet (cintas, bufandas, coletas) ──
class Chain {
  constructor(n, seg, opts = {}) {
    this.n = n; this.seg = seg;
    this.g = opts.gravity == null ? 0.35 : opts.gravity;
    this.damp = opts.damp == null ? 0.9 : opts.damp;
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push({ x: 0, y: 0, px: 0, py: 0 });
    this.init = false;
  }
  reset(x, y) {
    for (const p of this.pts) { p.x = p.px = x; p.y = p.py = y; }
    this.init = true;
  }
  update(ax, ay, wind = 0, s = 1) {
    if (!this.init) this.reset(ax, ay);
    const pts = this.pts, seg = this.seg * s;
    pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * this.damp, vy = (p.y - p.py) * this.damp;
      p.px = p.x; p.py = p.y;
      p.x += vx + wind * (0.4 + i * 0.12);
      p.y += vy + this.g;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-4;
        const diff = (d - seg) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
    }
  }
  draw(ctx, color, w0, w1) {
    const pts = this.pts;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = color;
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = lerp(w0, w1, i / (pts.length - 1));
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Ragdoll para los K.O. ──
const RAG_STICKS = [
  ['head', 'neck'], ['neck', 'hip'], ['neck', 'elF'], ['elF', 'haF'], ['neck', 'elB'], ['elB', 'haB'],
  ['hip', 'knF'], ['knF', 'ftF'], ['hip', 'knB'], ['knB', 'ftB'],
  ['head', 'hip', 0.6], ['knF', 'knB', 0.15, true], ['elF', 'hip', 0.1, true], ['elB', 'hip', 0.1, true],
];
const RAG_PTS = ['head', 'neck', 'hip', 'elF', 'haF', 'elB', 'haB', 'knF', 'ftF', 'knB', 'ftB'];

class Ragdoll {
  constructor(J, vx, vy, spin) {
    this.p = {};
    const cx = J.hip.x, cy = J.hip.y;
    for (const n of RAG_PTS) {
      const q = J[n];
      const tvx = -(q.y - cy) * spin, tvy = (q.x - cx) * spin;
      const jx = rand(-0.6, 0.6), jy = rand(-0.6, 0.6);
      this.p[n] = { x: q.x, y: q.y, px: q.x - vx - tvx - jx, py: q.y - vy - tvy - jy };
    }
    this.sticks = RAG_STICKS.map(([a, b, stiff = 1, minOnly = false]) => ({
      a, b, len: Math.max(4, dist(this.p[a].x, this.p[a].y, this.p[b].x, this.p[b].y)), stiff, minOnly,
    }));
    // el arma sale volando por su cuenta
    this.weapon = {
      a: { x: J.wBack.x, y: J.wBack.y, px: J.wBack.x - vx * 1.2, py: J.wBack.y - vy * 1.2 - 3 },
      b: { x: J.wTip.x, y: J.wTip.y, px: J.wTip.x - vx * 1.1 + rand(-3, 3), py: J.wTip.y - vy * 1.1 - 2 },
      len: Math.max(6, dist(J.wBack.x, J.wBack.y, J.wTip.x, J.wTip.y)),
    };
    this.J = makeJoints(); this.J.f = J.f; this.J.s = J.s;
    this.age = 0; this.rest = 0;
  }
  _collide(q, plats) {
    for (const pl of plats) {
      if (q.x < pl.x || q.x > pl.x + pl.w) continue;
      if (pl.oneWay) {
        if (q.py <= pl.y + 1 && q.y > pl.y) { q.y = pl.y; const vx = q.x - q.px; q.px = q.x - vx * 0.6; q.py = q.y + (q.y - q.py) * 0.25; }
      } else if (q.y > pl.y && q.y < pl.y + pl.h) {
        // empuja por el lado más cercano
        const top = q.y - pl.y, l = q.x - pl.x, r = pl.x + pl.w - q.x;
        if (top <= l && top <= r) { q.y = pl.y; const vx = q.x - q.px; q.px = q.x - vx * 0.6; q.py = q.y + (q.y - q.py) * 0.25; }
        else if (l < r) q.x = pl.x; else q.x = pl.x + pl.w;
      }
    }
  }
  update(plats, gravity = 0.55) {
    this.age++;
    const pts = Object.values(this.p);
    for (const q of [...pts, this.weapon.a, this.weapon.b]) {
      const vx = (q.x - q.px) * 0.995, vy = (q.y - q.py) * 0.995;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy + gravity;
    }
    for (let it = 0; it < 6; it++) {
      for (const st of this.sticks) {
        const a = this.p[st.a], b = this.p[st.b];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-4;
        if (st.minOnly && d > st.len) continue;
        const diff = ((d - st.len) / d) * 0.5 * st.stiff;
        a.x += dx * diff; a.y += dy * diff; b.x -= dx * diff; b.y -= dy * diff;
      }
      const w = this.weapon, dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, d = Math.hypot(dx, dy) || 1e-4;
      const diff = ((d - w.len) / d) * 0.5;
      w.a.x += dx * diff; w.a.y += dy * diff; w.b.x -= dx * diff; w.b.y -= dy * diff;
      for (const q of pts) this._collide(q, plats);
      this._collide(w.a, plats); this._collide(w.b, plats);
    }
  }
  joints() {
    const J = this.J, p = this.p;
    for (const n of RAG_PTS) { J[n].x = p[n].x; J[n].y = p[n].y; }
    J.sh.x = lerp(p.neck.x, p.hip.x, 0.1); J.sh.y = lerp(p.neck.y, p.hip.y, 0.1);
    J.headAng = Math.atan2(p.head.x - p.neck.x, -(p.head.y - p.neck.y)) / DEG * J.f;
    J.wBase.x = this.weapon.a.x; J.wBase.y = this.weapon.a.y;
    J.wBack.x = this.weapon.a.x; J.wBack.y = this.weapon.a.y;
    J.wTip.x = this.weapon.b.x; J.wTip.y = this.weapon.b.y;
    J.w2Base.x = p.haB.x; J.w2Base.y = p.haB.y; J.w2Tip.x = p.haB.x; J.w2Tip.y = p.haB.y + 1;
    return J;
  }
  get x() { return this.p.hip.x; }
  get y() { return this.p.hip.y; }
}

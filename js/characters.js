'use strict';
// ─────────────────────────────────────────────────────────────
//  Personajes: estadísticas, postura, accesorios y movimientos.
//
//  Cada movimiento:
//   len      duración total (frames a 60 fps)
//   keys     keyframes {f, p (pose parcial acumulativa), e (easing)}
//   hits     cajas de golpe {from,to,x,y,r,dmg,kb,g,a,hs,group,sfx}
//            x,y relativos a los pies (x hacia delante, y negativo = arriba)
//            a = ángulo de lanzamiento (0 = horizontal, 90 = arriba, -90 = abajo)
//   moves    impulsos {f, vx, vy} relativos a la mirada
//   next     siguiente golpe de la cadena (ligero)
//   tick / onHit   lógica propia
// ─────────────────────────────────────────────────────────────

const K = (f, p, e) => ({ f, p, e });
const H = (from, to, x, y, r, dmg, kb, a, extra) =>
  Object.assign({ from, to, x, y, r, dmg, kb, a, g: 4, group: 0 }, extra || {});

// ── accesorios ──
function headPoint(J, fwd, up) {
  const ha = J.headAng * DEG, s = J.s;
  return {
    x: J.head.x + (Math.cos(ha) * fwd + Math.sin(ha) * up) * J.f * s,
    y: J.head.y + (Math.sin(ha) * fwd - Math.cos(ha) * up) * s,
  };
}
function drawHat(ctx, J, color, brim, crownH, crownW) {
  const s = J.s, ha = J.headAng * DEG * J.f;
  const c = headPoint(J, 0, 5);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ha);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, brim * s, 3 * s, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-crownW * s, 0); ctx.lineTo(-crownW * 0.8 * s, -crownH * s);
  ctx.quadraticCurveTo(0, -crownH * 1.25 * s, crownW * 0.8 * s, -crownH * s); ctx.lineTo(crownW * s, 0); ctx.fill();
  ctx.restore();
}

const CHARACTERS = [];

// ═════════════════════════════════════════════════════════════
//  KAZE — ronin con katana. Equilibrado, cortes rápidos.
// ═════════════════════════════════════════════════════════════
CHARACTERS.push({
  id: 'kaze', name: 'KAZE', title: 'El Ronin', color: '#ff3b4e', shade: '#a81f30', accent: '#f4f1e8',
  desc: 'Espadachín equilibrado. Cortes veloces que encadenan en estocadas.',
  stats: { run: 6.6, jump: 15.5, djump: 14, jumps: 2, weight: 1.0, dmg: 1.0, speed: 1.0, scale: 1.0, hp: 100 },
  rating: { vel: 4, fue: 3, alc: 4, dif: 2 },
  weapon: { type: 'katana', len: 52, back: 10, grip: 45 },
  stance: { t: 10, lf: 22, kf: 30, lb: -18, kb: 22, af: 40, ef: 40, ab: -20, eb: 30, w: 125 },
  cloth: [{ anchor: 'headBack', n: 7, seg: 6, color: '#f4f1e8', w0: 3.5, w1: 1.5, gravity: 0.25 },
          { anchor: 'headBack', n: 6, seg: 6, color: '#dcd6c8', w0: 3, w1: 1.2, gravity: 0.3 }],
  accFront(ctx, J) {
    // cinta en la frente
    const a = headPoint(J, -8.5, 3), b = headPoint(J, 8.5, 3);
    ctx.strokeStyle = '#f4f1e8'; ctx.lineWidth = 3.2 * J.s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  },
  skills: [
    { key: 'skill1', name: 'Iaido', desc: 'Desenvaina y atraviesa al rival como un rayo.', cd: 170 },
    { key: 'skill2', name: 'Contraataque', desc: 'Postura de guardia: si te golpean, respondes con un tajo letal.', cd: 300 },
  ],
  moves: {
    L1: { len: 18, next: 'L2', chainFrom: 6, swish: [3, 0.6, 'blade'],
      keys: [K(0, {}), K(3, { t: -4, af: 150, ef: 20, w: 205, ab: -40 }),
             K(6, { t: 18, af: 85, ef: 5, w: 70, lf: 30, lb: -24, hx: 6 }, 'outExpo'),
             K(11, { af: 62, ef: 10, w: 34, t: 14 }), K(18, { af: 45, ef: 35, w: 110, hx: 2 })],
      hits: [H(5, 7, 48, -54, 30, 4, 4.5, 22, { sfx: 'slash', hs: 4 })],
      moves: [{ f: 4, vx: 3.5 }] },
    L2: { len: 20, next: 'L3', chainFrom: 7, swish: [3, 0.7, 'blade'],
      keys: [K(0, {}), K(2, { t: 16, af: 40, ef: -10, w: -10, lf: 26 }),
             K(4, { t: 6, af: 95, ef: 0, w: 85, lb: -24, hx: 6 }, 'outCubic'),
             K(7, { t: -6, af: 150, ef: 10, w: 160, lb: -28, hx: 8 }, 'outQuad'),
             K(11, { af: 165, w: 215 }), K(20, { af: 60, ef: 40, w: 130, hx: 2 })],
      hits: [H(4, 5, 42, -68, 32, 4, 5, 62, { sfx: 'slash', hs: 4 }), H(6, 7, 34, -100, 30, 4, 5, 62, { sfx: 'slash', hs: 4 })],
      moves: [{ f: 3, vx: 3 }] },
    L3: { len: 28, iasa: 24, swish: [6, 1.0, 'blade'],
      keys: [K(0, {}), K(5, { t: -2, hx: -6, af: 50, ef: 70, w: 90, lf: 10, kf: 40, lb: -30, kb: 30, ab: 40, eb: 90 }),
             K(8, { t: 30, hx: 18, af: 95, ef: 0, w: 92, lf: 55, kf: 30, lb: -40, kb: 5, ab: -60, eb: 10 }, 'outExpo'),
             K(16, {}), K(28, { t: 14, hx: 4, af: 60, ef: 20, w: 100, lf: 24, kf: 30, lb: -20, kb: 22 })],
      hits: [H(7, 10, 74, -58, 26, 7, 9, 18, { g: 6, sfx: 'slash', hs: 7 })],
      moves: [{ f: 7, vx: 12 }] },
    sideHeavy: { len: 34, iasa: 30, swish: [9, 1.4, 'blade'],
      keys: [K(0, {}), K(7, { t: -12, hx: -4, af: 170, ef: 20, w: 200, ab: 150, eb: 30, lf: 26, kf: 40, lb: -22 }, 'outCubic'),
             K(11, { t: 32, hx: 14, af: 70, ef: 0, w: 40, ab: 50, eb: 20, lf: 50, kf: 50, lb: -35, kb: 10 }, 'outExpo'),
             K(20, { t: 30 }), K(34, { af: 50, ef: 30, w: 110, t: 12, hx: 0, lf: 22, kf: 30, lb: -18, kb: 22, ab: -20 })],
      hits: [H(9, 13, 60, -52, 40, 11, 10, 35, { g: 9, sfx: 'heavy', hs: 9 })],
      moves: [{ f: 9, vx: 7 }] },
    upHeavy: { len: 30, jumpCancel: true, air: true, swish: [7, 1.1, 'blade'],
      keys: [K(0, {}), K(5, { t: 20, lf: 40, kf: 80, lb: -20, kb: 70, af: -30, ef: 10, w: -40 }),
             K(9, { t: -14, lf: 5, kf: 5, lb: -10, kb: 10, af: 175, ef: 0, w: 185, ab: 120, sq: 1.12 }, 'outExpo'),
             K(16, { af: 180, w: 200, sq: 1 }), K(30, { t: 8, af: 50, ef: 35, w: 120, lf: 20, kf: 28, lb: -16, kb: 20, ab: -20 })],
      hits: [H(7, 11, 30, -84, 36, 8, 11, 86, { g: 4, sfx: 'slash', hs: 6 })],
      moves: [{ f: 8, vy: -4 }] },
    downHeavy: { len: 28, jumpCancel: true, swish: [7, 1.0, 'blade'],
      keys: [K(0, {}), K(5, { lf: 60, kf: 110, lb: -50, kb: 90, t: 30, af: -40, ef: 0, w: -80 }),
             K(8, { af: 72, ef: 0, w: 62, t: 36, lb: -80, kb: 10 }, 'outExpo'),
             K(16, { af: 92, w: 92 }), K(28, { t: 10, lf: 22, kf: 30, lb: -18, kb: 22, af: 40, ef: 40, w: 125 })],
      hits: [H(7, 11, 54, -18, 30, 7, 9, 75, { g: 3, sfx: 'slash', hs: 6 })] },
    airLight: { len: 18, air: true, landLag: 4, swish: [3, 0.8, 'blade'],
      keys: [K(0, {}), K(2, { lf: 60, kf: 90, lb: 20, kb: 90, af: 150, ef: 10, w: 200 }),
             K(11, { rot: 360, af: 90, w: 110 }, 'linear'),
             K(18, { lf: 20, kf: 30, lb: -10, kb: 30, af: 60, ef: 20, w: 110, rot: 360 })],
      hits: [H(3, 10, 4, -50, 50, 3.5, 5, 40, { sfx: 'slash', hs: 3 })] },
    airHeavy: { len: 24, air: true, landLag: 8, swish: [6, 1.2, 'blade'],
      keys: [K(0, {}), K(4, { af: 160, ef: 30, w: 220, t: -10, lf: 40, kf: 70, lb: -20, kb: 60 }),
             K(6, { af: 80, ef: 0, w: 60, t: 20, lf: 10, kf: 20, lb: -30, kb: 30 }, 'outExpo'),
             K(24, { af: 50, ef: 30, w: 110, t: 8 })],
      hits: [H(6, 9, 54, -50, 36, 9, 9, 30, { g: 6, sfx: 'slash', hs: 7 })] },
    airDown: { len: 26, air: true, landLag: 10, swish: [5, 1.2, 'blade'],
      keys: [K(0, {}), K(4, { lf: 70, kf: 100, lb: 30, kb: 100, af: 170, ef: 10, w: 200, t: -8 }),
             K(7, { af: 10, ef: 0, w: 0, lf: -5, kf: 10, lb: -15, kb: 20, t: 6 }, 'outExpo'), K(26, {})],
      hits: [H(6, 22, 8, -4, 28, 8, 8, -80, { g: 5, sfx: 'heavy', hs: 8 })],
      moves: [{ f: 6, vy: 15, vx: 0, mulX: 0.3 }],
      onHit(F) { F.vy = -10; F.endAttackSoon(10); } },

    // Habilidad 1: Iaido
    skill1: { len: 34, air: true, iasa: 32, noGrav: [6, 18],
      keys: [K(0, {}), K(7, { t: 22, lf: 45, kf: 80, lb: -30, kb: 50, af: 20, ef: 120, w: -60, ab: 40, eb: 100 }, 'outCubic'),
             K(10, { t: 34, lf: 62, kf: 20, lb: -72, kb: 8, af: 96, ef: 0, w: 92, ab: -60, eb: 0 }, 'outExpo'),
             K(18, { af: 100, w: 95 }), K(34, { t: 10, af: 40, ef: 40, w: 125, lf: 22, kf: 30, lb: -18, kb: 22, ab: -20, eb: 30 })],
      hits: [H(9, 16, 6, -50, 46, 10, 9, 40, { g: 7, sfx: 'slash', hs: 10, fx: 'iaido' })],
      invuln: [8, 16],
      tick(F, f, G) {
        if (F.at(2)) { Sfx.play('sheath'); F.flashGlint = 8; }
        if (f >= 8 && f <= 16) { F.vx = F.facing * (f < 14 ? 27 : 14); F.vy = 0; F.ghostTrail = 2; }
        if (F.at(9)) { Sfx.play('dash'); FX.dust(F.x, F.y, 8, 1.5, -F.facing); }
        if (F.at(17)) F.vx *= 0.3;
      },
      onHit(F, T) {
        FX.slashArc(T.x, T.y - 50, 42, -0.6, 2.4, F.char.color, 14, 12);
      } },

    // Habilidad 2: Contraataque
    skill2: { len: 36, iasa: 36, air: true, counter: [3, 24], grav: 0.3,
      keys: [K(0, {}), K(4, { t: -6, lf: 12, kf: 30, lb: -30, kb: 22, af: 125, ef: 55, w: 92, ab: 110, eb: 60 }, 'outBack'),
             K(24, { t: -4 }), K(36, { t: 10, af: 40, ef: 40, w: 125, ab: -20, eb: 30 })],
      tick(F, f) { if (F.at(2)) Sfx.play('stance'); if (f > 2 && f < 24 && F.atkTime % 6 === 0) FX.ring(F.x, F.y - 50, '#f4f1e8', 46, 10, 2); } },
  },
  // la respuesta del contraataque (no se elige con botones)
  counterMove: { len: 30,
    keys: [K(0, { t: -10, af: 170, ef: 20, w: 210, lf: 26, kf: 40, lb: -22 }),
           K(4, { t: 34, hx: 12, af: 70, ef: 0, w: 30, lf: 50, kf: 50, lb: -35, kb: 10 }, 'outExpo'),
           K(30, { t: 10, af: 40, ef: 40, w: 125, hx: 0, lf: 22, kf: 30, lb: -18, kb: 22 })],
    hits: [H(2, 6, 40, -52, 54, 12, 13, 40, { g: 8, sfx: 'heavy', hs: 16 })] },
});

// ═════════════════════════════════════════════════════════════
//  TORO — boxeador pesado. Lento, con armadura y golpes brutales.
// ═════════════════════════════════════════════════════════════
CHARACTERS.push({
  id: 'toro', name: 'TORO', title: 'El Coloso', color: '#ff9f1c', shade: '#b0650b', accent: '#e63946',
  desc: 'Pesado y lento, pero aguanta golpes con armadura y los devuelve el doble.',
  stats: { run: 5.6, jump: 14.2, djump: 12.6, jumps: 2, weight: 1.35, dmg: 1.2, speed: 1.12, scale: 1.14, hp: 115 },
  rating: { vel: 2, fue: 5, alc: 2, dif: 1 },
  weapon: { type: 'fists', len: 0, grip: 0 },
  stance: { t: 8, lf: 20, kf: 28, lb: -16, kb: 22, af: 70, ef: 100, ab: 40, eb: 120, w: 90 },
  cloth: [],
  accFront(ctx, J, look) {
    // cresta
    const s = J.s;
    ctx.fillStyle = look.shade;
    for (let i = -1; i <= 1; i++) {
      const b0 = headPoint(J, i * 4 - 2, 8), b1 = headPoint(J, i * 4 + 2, 8), tip = headPoint(J, i * 4 - 1.5, 15 - Math.abs(i) * 2);
      ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b1.x, b1.y); ctx.fill();
    }
    // cinturón
    const hp = J.hip, nk = J.neck;
    const bx = lerp(hp.x, nk.x, 0.12), by = lerp(hp.y, nk.y, 0.12);
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(bx, by, 5 * s, 0, TAU); ctx.fill();
  },
  skills: [
    { key: 'skill1', name: 'Embestida', desc: 'Carga con el hombro, imparable gracias a la armadura.', cd: 200 },
    { key: 'skill2', name: 'Terremoto', desc: 'Salta y cae aplastando el suelo con una onda de choque.', cd: 300 },
  ],
  moves: {
    L1: { len: 14, next: 'L2', chainFrom: 5, swish: [2, 0.5],
      keys: [K(0, {}), K(2, { af: 60, ef: 112, t: 6 }), K(4, { af: 92, ef: 2, t: 14, hx: 4 }, 'outExpo'), K(14, { af: 70, ef: 100, hx: 0, t: 8 })],
      hits: [H(3, 5, 40, -68, 20, 4, 4, 15, { sfx: 'hit', hs: 4 })], moves: [{ f: 3, vx: 2 }] },
    L2: { len: 17, next: 'L3', chainFrom: 6, swish: [3, 0.6],
      keys: [K(0, {}), K(2, { ab: 30, eb: 112, t: 2 }), K(5, { ab: 95, eb: 0, t: 22, hx: 6, af: 40, ef: 120, lb: -26 }, 'outExpo'),
             K(17, { ab: 40, eb: 120, t: 8, hx: 0, af: 70, ef: 100, lb: -16 })],
      hits: [H(4, 6, 46, -66, 22, 5, 5, 20, { sfx: 'hit', hs: 5 })], moves: [{ f: 4, vx: 3 }] },
    L3: { len: 26, iasa: 22, swish: [7, 1.1],
      keys: [K(0, {}), K(5, { t: 24, af: 20, ef: 30, lf: 30, kf: 60, lb: -20, kb: 60 }),
             K(8, { t: -12, af: 162, ef: 25, kf: 10, kb: 10, sq: 1.1, lf: 15 }, 'outExpo'), K(14, { sq: 1 }),
             K(26, { t: 8, af: 70, ef: 100, lf: 20, kf: 28, lb: -16, kb: 22 })],
      hits: [H(7, 10, 36, -74, 32, 8, 10, 75, { g: 6, sfx: 'hit', p: 1.7, hs: 7 })], moves: [{ f: 5, vx: 5.5 }] },
    sideHeavy: { len: 32, iasa: 30, armor: [3, 12], swish: [11, 1.5],
      keys: [K(0, {}), K(9, { t: -14, hx: -6, af: -60, ef: 60, ab: 90, eb: 110, lf: 30, lb: -30 }, 'outCubic'),
             K(13, { t: 32, hx: 16, af: 90, ef: 0, ab: -30, eb: 40, lf: 50, kf: 40, lb: -40, kb: 5 }, 'outExpo'),
             K(20, {}), K(32, { t: 8, hx: 0, af: 70, ef: 100, ab: 40, eb: 120, lf: 20, kf: 28, lb: -16, kb: 22 })],
      hits: [H(11, 14, 50, -62, 30, 13, 12, 25, { g: 9, sfx: 'heavy', hs: 11 })], moves: [{ f: 11, vx: 9 }] },
    upHeavy: { len: 32, jumpCancel: true, air: true, swish: [8, 1.3],
      keys: [K(0, {}), K(6, { t: 26, lf: 40, kf: 90, lb: -25, kb: 80, af: 0, ef: 120, ab: 0, eb: 120 }),
             K(10, { t: -6, af: 150, ef: 10, ab: 140, eb: 15, kf: 5, kb: 5, lf: 10, lb: -10, sq: 1.15 }, 'outExpo'), K(16, { sq: 1, af: 158 }),
             K(32, { t: 8, af: 70, ef: 100, ab: 40, eb: 120, lf: 20, kf: 28, lb: -16, kb: 22 })],
      hits: [H(8, 12, 18, -92, 34, 10, 12, 88, { g: 5, sfx: 'heavy', hs: 8 })], moves: [{ f: 8, vy: -3 }] },
    downHeavy: { len: 30, jumpCancel: true, swish: [9, 1.2],
      keys: [K(0, {}), K(8, { lf: 92, kf: 95, t: -6, af: 110, ab: 110, ef: 60, eb: 60 }, 'outCubic'),
             K(11, { lf: 30, kf: 10, t: 16, af: 40, ab: 20, ef: 80, eb: 90 }, 'outExpo'),
             K(30, { t: 8, lf: 20, kf: 28, af: 70, ef: 100, ab: 40, eb: 120 })],
      hits: [H(10, 13, 36, -8, 40, 9, 7, 84, { g: 2, sfx: 'heavy', hs: 7, stun: 3.6 })],
      tick(F, f, G) { if (F.at(10)) { FX.shockwave(F.x + F.facing * 30, F.y, F.char.color, 0); FX.debris(F.x + F.facing * 30, F.y, '#c9b8a0', 6); G.shake(0.25); } } },
    airLight: { len: 15, air: true, landLag: 4, swish: [2, 0.6],
      keys: [K(0, {}), K(2, { af: 60, ef: 112, lf: 50, kf: 80, lb: 0, kb: 70 }), K(4, { af: 100, ef: 0, t: 12 }, 'outExpo'), K(15, { af: 70, ef: 100, t: 6 })],
      hits: [H(3, 6, 40, -58, 24, 4.5, 5, 30, { sfx: 'hit', hs: 4 })] },
    airHeavy: { len: 26, air: true, landLag: 9, swish: [8, 1.3],
      keys: [K(0, {}), K(6, { af: -40, ef: 40, t: -10, lf: 50, kf: 80, lb: -10, kb: 60 }),
             K(9, { af: 95, ef: 0, t: 25, ab: -40, eb: 30, lf: 20, kf: 20 }, 'outExpo'), K(26, { af: 70, ef: 100, ab: 40, eb: 120, t: 8 })],
      hits: [H(8, 11, 48, -58, 28, 11, 11, 30, { g: 7, sfx: 'heavy', hs: 9 })] },
    airDown: { len: 28, air: true, landLag: 10, swish: [8, 1.4],
      keys: [K(0, {}), K(6, { af: 175, ef: 20, ab: 170, eb: 20, t: -12, lf: 40, kf: 70 }),
             K(10, { af: 30, ef: 0, ab: 30, eb: 0, t: 30, lf: 20, kf: 30 }, 'outExpo'), K(28, { af: 70, ef: 100, ab: 40, eb: 120, t: 8 })],
      hits: [H(9, 12, 32, -30, 32, 10, 9, -75, { g: 6, sfx: 'heavy', hs: 10 })] },

    skill1: { len: 48, iasa: 46, air: true, armor: [0, 36], noGrav: [10, 36],
      keys: [K(0, {}), K(9, { t: -10, hx: -6, lf: 30, kf: 50, lb: -30, kb: 40, af: 40, ef: 120, ab: 20, eb: 130 }, 'outCubic'),
             K(12, { t: 42, hx: 10, af: 62, ef: 112, ab: 10, eb: 120, lf: 55, kf: 70, lb: -55, kb: 20 }, 'outExpo'),
             K(36, { t: 40 }), K(48, { t: 8, hx: 0, af: 70, ef: 100, ab: 40, eb: 120, lf: 20, kf: 28, lb: -16, kb: 22 })],
      hits: [H(12, 36, 32, -56, 34, 12, 13, 30, { g: 8, sfx: 'heavy', hs: 12 })],
      tick(F, f, G) {
        if (F.at(11)) Sfx.play('dash');
        if (f >= 12 && f <= 36 && !F.atk.hasHit && F.wallDir === F.facing) {
          // se estampa contra la pared
          G.onWallBounce(F); F.vx = -F.facing * 4; F.atkState.wall = true;
          F.endAttackSoon(10);
        }
        if (f >= 12 && f <= 36 && !F.atk.hasHit && !F.atkState.wall) {
          F.vx = F.facing * 15; F.vy = 0; F.ghostTrail = 3;
          if (F.atkTime % 3 === 0 && F.onGround) FX.dust(F.x - F.facing * 10, F.y, 2, 1, -F.facing);
          // animación de zancadas durante la carga
          F.legCycle(f * 0.55);
        }
        if (F.atk.hasHit && f < 36) { F.vx *= 0.7; }
      } },
    skill2: { len: 60, iasa: 60, air: true,
      keys: [K(0, {}), K(7, { t: 20, lf: 45, kf: 95, lb: -25, kb: 85, af: -20, ef: 40, ab: -30, eb: 40 }),
             K(12, { t: -12, lf: 10, kf: 10, lb: -10, kb: 10, af: 175, ef: 20, ab: 170, eb: 20, sq: 1.15 }, 'outExpo'),
             K(20, { lf: 50, kf: 90, lb: 20, kb: 90, sq: 1 }), K(60, {})],
      tick(F, f, G) {
        const s = F.atkState;
        if (F.at(1)) { s.slam = false; s.landed = false; s.leap = F.onGround; }
        if (F.at(10) && s.leap) { F.vy = -17; F.vx = F.facing * 3; Sfx.play('jump'); FX.landDust(F.x, F.y, 1.2); }
        if (!s.landed) {
          if ((s.leap && f >= 24) || (!s.leap && f >= 8)) {
            s.slam = true; F.vy = 24; F.vx *= 0.8; F.ghostTrail = 2;
          }
          if (f < 58) F.atkTime = Math.min(F.atkTime, 40);   // espera hasta tocar suelo
          if (s.slam && F.onGround) {
            s.landed = true; F.atkTime = 40;
            G.slamImpact(F, 150, { dmg: 12, kb: 12, g: 6, a: 70, hs: 9 });
          }
          if (F.y > G.stage.blast.y + G.stage.blast.h) s.landed = true;
        }
      } },
  },
});

// ═════════════════════════════════════════════════════════════
//  SOMBRA — ninja con dagas. Muy rápida, triple salto, combos largos.
// ═════════════════════════════════════════════════════════════
CHARACTERS.push({
  id: 'sombra', name: 'SOMBRA', title: 'La Asesina', color: '#9b5cff', shade: '#5e2fb0', accent: '#2a1b40',
  desc: 'Rapidísima y frágil. Triple salto, shurikens y teletransporte por la espalda.',
  stats: { run: 7.6, jump: 15.2, djump: 13.6, jumps: 3, weight: 0.82, dmg: 0.9, speed: 0.85, scale: 0.92, hp: 90 },
  rating: { vel: 5, fue: 2, alc: 2, dif: 4 },
  weapon: { type: 'daggers', len: 15, grip: 180, dual: true, dualGrip: 180, drawBehindArm: false },
  stance: { t: 22, lf: 35, kf: 60, lb: -20, kb: 50, af: 60, ef: 50, ab: 20, eb: 80, w: 290 },
  cloth: [{ anchor: 'neck', n: 10, seg: 7, color: '#ff4fa3', w0: 4.5, w1: 2, gravity: 0.2, damp: 0.92 }],
  accFront(ctx, J) {
    // máscara
    const a = headPoint(J, -2, -1.5), b = headPoint(J, 9.5, -1.5);
    ctx.strokeStyle = '#2a1b40'; ctx.lineWidth = 5.5 * J.s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  },
  skills: [
    { key: 'skill1', name: 'Shurikens', desc: 'Lanza un abanico de tres estrellas que alargan tus combos.', cd: 55 },
    { key: 'skill2', name: 'Paso sombrío', desc: 'Se teletransporta a la espalda del rival y apuñala.', cd: 230 },
  ],
  moves: {
    L1: { len: 11, next: 'L2', chainFrom: 4, swish: [2, 0.45, 'blade'],
      keys: [K(0, {}), K(2, { af: 110, ef: 60, w: 200 }), K(4, { af: 85, ef: 0, w: 80, t: 28 }, 'outExpo'), K(11, { af: 60, ef: 50, w: 290, t: 22 })],
      hits: [H(3, 5, 38, -48, 22, 3, 3.5, 20, { sfx: 'slash', hs: 3 })], moves: [{ f: 2, vx: 3 }] },
    L2: { len: 12, next: 'L3', chainFrom: 4, swish: [2, 0.45, 'blade'],
      keys: [K(0, {}), K(2, { ab: 20, eb: 115 }), K(4, { ab: 92, eb: 0, t: 30, hx: 6 }, 'outExpo'), K(12, { ab: 20, eb: 80, t: 22, hx: 0 })],
      hits: [H(3, 5, 42, -46, 22, 3, 4, 20, { sfx: 'slash', hs: 3 })], moves: [{ f: 2, vx: 3 }] },
    L3: { len: 22, iasa: 19, swish: [3, 0.8, 'blade'],
      keys: [K(0, {}), K(2, { t: 10, af: 90, ef: 0, ab: -90, eb: 0, w: 90 }),
             K(13, { rot: 360 }, 'linear'), K(22, { rot: 360, t: 22, af: 60, ef: 50, ab: 20, eb: 80, w: 290 })],
      hits: [H(3, 6, 14, -50, 46, 3, 3, 45, { sfx: 'slash', hs: 3, group: 0 }),
             H(9, 12, 14, -50, 48, 4, 8.5, 35, { g: 5, sfx: 'slash', hs: 6, group: 1 })], moves: [{ f: 2, vx: 4 }] },
    sideHeavy: { len: 26, iasa: 24, swish: [8, 1.0, 'blade'],
      keys: [K(0, {}), K(6, { t: 0, hx: -8, af: 30, ef: 110, ab: 20, eb: 120, w: 100 }),
             K(9, { t: 34, hx: 18, af: 95, ef: 0, ab: 88, eb: 0, lf: 55, kf: 30, lb: -45, kb: 5, w: 92 }, 'outExpo'),
             K(26, { t: 22, hx: 0, af: 60, ef: 50, ab: 20, eb: 80, lf: 35, kf: 60, lb: -20, kb: 50, w: 290 })],
      hits: [H(8, 11, 60, -50, 26, 9, 10, 25, { g: 7, sfx: 'slash', hs: 7 })], moves: [{ f: 8, vx: 13 }] },
    upHeavy: { len: 26, jumpCancel: true, air: true, swish: [5, 0.9],
      keys: [K(0, {}), K(4, { lf: 40, kf: 90, lb: -20, kb: 80, t: 20 }),
             K(7, { lf: 150, kf: 0, lb: -20, kb: 30, af: -60, ab: -90, t: -20 }, 'outExpo'),
             K(18, { rot: -360, lf: 40, kf: 60 }, 'linear'), K(26, { rot: -360, t: 22, lf: 35, kf: 60, lb: -20, kb: 50, af: 60, ab: 20 })],
      hits: [H(5, 9, 26, -72, 30, 7, 11, 85, { g: 4, sfx: 'hit', hs: 6 })], moves: [{ f: 5, vy: -8 }] },
    downHeavy: { len: 26, jumpCancel: true, swish: [6, 0.9],
      keys: [K(0, {}), K(4, { lf: 30, kf: 70, t: 10 }), K(7, { lf: 85, kf: 0, lb: -10, kb: 120, t: -30, af: -20, ab: -40 }, 'outExpo'),
             K(18, {}), K(26, { lf: 35, kf: 60, lb: -20, kb: 50, t: 22, af: 60, ab: 20 })],
      hits: [H(6, 14, 42, -14, 26, 6, 8, 70, { g: 3, sfx: 'hit', hs: 5 })], moves: [{ f: 6, vx: 13 }] },
    airLight: { len: 15, air: true, landLag: 3, swish: [2, 0.4, 'blade'],
      keys: [K(0, {}), K(2, { af: 120, w: 200, lf: 50, kf: 80, lb: 10, kb: 80 }), K(4, { af: 70, w: 60 }, 'outExpo'),
             K(6, { ab: 110, eb: 20 }), K(8, { ab: 60, eb: 10 }, 'outExpo'), K(15, { af: 60, ef: 50, ab: 20, eb: 80, w: 290 })],
      hits: [H(2, 4, 36, -50, 26, 2.5, 3.5, 45, { sfx: 'slash', hs: 2, group: 0 }), H(6, 8, 36, -50, 26, 2.5, 4.5, 45, { sfx: 'slash', hs: 3, group: 1 })] },
    airHeavy: { len: 24, air: true, landLag: 8, swish: [3, 1.0, 'blade'],
      keys: [K(0, {}), K(2, { af: 90, ef: 0, ab: -90, eb: 0, lf: 40, kf: 40, lb: -40, kb: 40, t: 0 }),
             K(18, { rot: 720 }, 'linear'), K(24, { rot: 720, af: 60, ef: 50, ab: 20, eb: 80, t: 22 })],
      hits: [H(3, 5, 4, -50, 48, 2, 2.5, 50, { group: 0, hs: 2, sfx: 'slash' }), H(7, 9, 4, -50, 48, 2, 2.5, 50, { group: 1, hs: 2, sfx: 'slash' }),
             H(11, 13, 4, -50, 48, 2, 2.5, 50, { group: 2, hs: 2, sfx: 'slash' }), H(15, 18, 4, -50, 50, 3, 9, 35, { g: 6, group: 3, hs: 6, sfx: 'slash' })] },
    airDown: { len: 24, air: true, landLag: 8, swish: [5, 0.9, 'blade'],
      keys: [K(0, {}), K(4, { lf: 60, kf: 90, lb: 20, kb: 90, af: 150, ab: 140 }),
             K(6, { af: 30, ab: 20, ef: 0, eb: 0, w: 20, t: 40, lf: 10, kf: 20, lb: -30, kb: 30 }, 'outExpo'), K(24, {})],
      hits: [H(6, 20, 22, -12, 24, 7, 8, -60, { g: 5, sfx: 'slash', hs: 7 })],
      moves: [{ f: 6, vx: 9, vy: 12 }], onHit(F) { F.vy = -8; F.endAttackSoon(8); } },

    skill1: { len: 18, air: true, swish: [5, 0.6],
      keys: [K(0, {}), K(4, { af: 170, ef: 40, t: 10 }), K(7, { af: 80, ef: 0, t: 26 }, 'outExpo'), K(18, { af: 60, ef: 50, t: 22 })],
      tick(F, f, G) {
        if (F.at(7)) {
          Sfx.play('throw');
          for (const da of [-9, 0, 9]) {
            const a = da * DEG, sp = 19;
            G.spawnProjectile(F, { kind: 'shuriken', x: F.x + F.facing * 24, y: F.y - 56 * F.s, vx: Math.cos(a) * sp * F.facing, vy: Math.sin(a) * sp, r: 9, life: 40,
              hit: { dmg: 3, kb: 4.5, g: 2, a: 25, hs: 3, sfx: 'slash' } });
          }
        }
      } },
    skill2: { len: 26, air: true, invuln: [0, 10], noGrav: [0, 12],
      keys: [K(0, { t: 30, lf: 50, kf: 90, lb: -10, kb: 80 }), K(9, {}),
             K(11, { t: 30, af: 30, ef: 110, w: 100 }), K(14, { t: 36, af: 95, ef: 0, w: 92, hx: 10 }, 'outExpo'),
             K(26, { t: 22, af: 60, ef: 50, hx: 0, w: 290, lf: 35, kf: 60, lb: -20, kb: 50 })],
      hits: [H(13, 16, 36, -52, 30, 8, 9, 35, { g: 6, sfx: 'slash', hs: 8 })],
      tick(F, f, G) {
        if (F.at(1)) {
          F.vx = 0; F.vy = 0;
          Sfx.play('smoke'); FX.smoke(F.x, F.y - 40);
          const T = G.nearestEnemy(F, 700);
          F.hidden = 9;
          let tx, ty;
          if (T) { const side = T.facing; tx = T.x - side * 46; ty = T.y - 2; F.atkState.face = side; }
          else { tx = F.x + F.facing * 220; ty = F.y; F.atkState.face = F.facing; }
          F.atkState.tx = tx; F.atkState.ty = ty;
        }
        if (F.at(9)) {
          F.teleport(F.atkState.tx, F.atkState.ty, G);
          F.facing = F.atkState.face;
          FX.smoke(F.x, F.y - 40); Sfx.play('blink');
        }
      } },
  },
});

// ═════════════════════════════════════════════════════════════
//  VOLTA — maga de la tormenta. Zona y proyectiles; su dash es un parpadeo.
// ═════════════════════════════════════════════════════════════
CHARACTERS.push({
  id: 'volta', name: 'VOLTA', title: 'La Tormenta', color: '#2ee6d6', shade: '#169186', accent: '#b8fff8',
  desc: 'Controla la distancia con orbes y rayos. Su esquiva es un teletransporte.',
  stats: { run: 6.0, jump: 15, djump: 14.5, jumps: 2, weight: 0.9, dmg: 1.0, speed: 1.0, scale: 1.0, hp: 95, grav: 0.88 },
  rating: { vel: 3, fue: 3, alc: 5, dif: 3 },
  weapon: { type: 'staff', len: 50, back: 24, grip: 90, twoHand: -18 },
  dashType: 'blink',
  stance: { t: 2, lf: 12, kf: 14, lb: -10, kb: 12, af: 30, ef: 50, ab: 0, eb: 0, w: 172 },
  cloth: [{ anchor: 'hatTip', n: 5, seg: 5, color: '#1d6e8a', w0: 4, w1: 2, gravity: 0.3 }],
  accFront(ctx, J) { drawHat(ctx, J, '#1d6e8a', 15, 10, 8); },
  skills: [
    { key: 'skill1', name: 'Orbe arcano', desc: 'Dispara una esfera lenta que estalla al contacto.', cd: 80 },
    { key: 'skill2', name: 'Rayo', desc: 'Invoca un relámpago sobre el rival más cercano.', cd: 250 },
  ],
  moves: {
    L1: { len: 13, next: 'L2', chainFrom: 5, swish: [2, 0.55],
      keys: [K(0, {}), K(2, { af: 20, ef: 40, w: 95, t: 0 }), K(4, { af: 85, ef: 5, w: 92, t: 14, hx: 6 }, 'outExpo'), K(13, { af: 30, ef: 50, w: 172, t: 2, hx: 0 })],
      hits: [H(3, 5, 72, -58, 20, 3.5, 4, 15, { sfx: 'hit', hs: 4 })], moves: [{ f: 3, vx: 2 }] },
    L2: { len: 16, next: 'L3', chainFrom: 6, swish: [3, 0.7],
      keys: [K(0, {}), K(2, { w: 30, af: 20, ef: 20, t: 14 }), K(4, { w: 95, af: 85, ef: 10, t: 6, hx: 4 }, 'outCubic'),
             K(7, { w: 200, af: 150, ef: 20, t: -6, hx: 0 }, 'outQuad'), K(16, { af: 30, ef: 50, w: 172, t: 2 })],
      hits: [H(4, 5, 50, -72, 32, 4, 5, 58, { sfx: 'hit', hs: 4 }), H(6, 6, 36, -102, 30, 4, 5, 58, { sfx: 'hit', hs: 4 })], moves: [{ f: 3, vx: 2 }] },
    L3: { len: 24, iasa: 21, swish: [6, 1.0],
      keys: [K(0, {}), K(5, { w: 262, af: 170, ef: 40, t: -14 }), K(8, { w: 80, af: 80, ef: 0, t: 26, hx: 6, lf: 30, lb: -26 }, 'outExpo'),
             K(24, { af: 30, ef: 50, w: 172, t: 2, hx: 0, lf: 12, lb: -10 })],
      hits: [H(7, 10, 66, -40, 32, 7, 9, 35, { g: 6, sfx: 'zap', hs: 7, fx: 'zap' })] },
    sideHeavy: { len: 32, iasa: 30, swish: [10, 0.8],
      keys: [K(0, {}), K(8, { w: 100, af: 20, ef: 70, hx: -6, t: -4 }, 'outCubic'),
             K(11, { af: 95, ef: 0, w: 92, t: 20, hx: 10, lf: 30, lb: -24 }, 'outExpo'), K(18, {}),
             K(32, { af: 30, ef: 50, w: 172, t: 2, hx: 0, lf: 12, lb: -10 })],
      hits: [H(10, 14, 90, -58, 34, 11, 11, 25, { g: 8, sfx: 'zap', hs: 9, fx: 'zap' })],
      tick(F, f) { if (F.at(10)) { const J = F.J; FX.bolt(J.wBase.x, J.wBase.y, J.wTip.x + F.facing * 60, J.wTip.y, F.char.color, 9, 4); FX.hitFlash(J.wTip.x + F.facing * 40, J.wTip.y, F.char.color, 0.8); } } },
    upHeavy: { len: 28, jumpCancel: true, air: true, swish: [4, 0.8],
      keys: [K(0, {}), K(4, { af: 172, ef: 8, w: 180, t: -4 }), K(22, { w: 900 }, 'linear'), K(28, { w: 892, af: 30, ef: 50 })],
      hits: [H(4, 7, 4, -104, 46, 2, 4, 86, { group: 0, hs: 2, sfx: 'hit' }), H(9, 12, 4, -104, 46, 2, 4, 86, { group: 1, hs: 2, sfx: 'hit' }),
             H(14, 17, 4, -104, 46, 2, 4, 86, { group: 2, hs: 2, sfx: 'hit' }), H(19, 22, 4, -104, 48, 4, 11, 88, { group: 3, hs: 6, g: 5, sfx: 'zap', fx: 'zap' })],
      freeBack: true },
    downHeavy: { len: 28, jumpCancel: true, swish: [7, 1.0],
      keys: [K(0, {}), K(5, { lf: 55, kf: 100, lb: -45, kb: 85, t: 26, af: -30, ef: 10, w: -30 }),
             K(8, { af: 70, ef: 0, w: 58, t: 30, lb: -70, kb: 15 }, 'outExpo'), K(14, { af: 76, w: 66 }),
             K(28, { lf: 12, kf: 14, lb: -10, kb: 12, t: 2, af: 30, ef: 50, w: 172 })],
      hits: [H(7, 11, 66, -18, 30, 7, 9, 75, { g: 3, sfx: 'hit', hs: 6 })] },
    airLight: { len: 15, air: true, landLag: 4, swish: [2, 0.55],
      keys: [K(0, {}), K(2, { af: 20, ef: 40, w: 95, lf: 40, kf: 60, lb: -10, kb: 50 }), K(4, { af: 85, ef: 5, w: 92, t: 14 }, 'outExpo'), K(15, { af: 30, ef: 50, w: 172, t: 2 })],
      hits: [H(3, 6, 70, -56, 22, 4, 5, 30, { sfx: 'hit', hs: 4 })] },
    airHeavy: { len: 24, air: true, landLag: 8, swish: [6, 1.1],
      keys: [K(0, {}), K(4, { af: 160, ef: 30, w: 220, t: -10, lf: 40, kf: 70, lb: -20, kb: 60 }),
             K(6, { af: 80, ef: 0, w: 50, t: 20, lf: 10, kf: 20 }, 'outExpo'), K(24, { af: 30, ef: 50, w: 172, t: 2 })],
      hits: [H(6, 9, 58, -46, 40, 9, 9, 30, { g: 6, sfx: 'hit', hs: 7 })] },
    airDown: { len: 26, air: true, landLag: 10, swish: [5, 1.1],
      keys: [K(0, {}), K(4, { af: 170, ef: 10, w: 190, lf: 60, kf: 90, lb: 20, kb: 90 }),
             K(7, { af: 10, ef: 0, w: 2, lf: 0, kf: 10, lb: -15, kb: 20 }, 'outExpo'), K(26, {})],
      hits: [H(6, 22, 6, 4, 30, 8, 8, -78, { g: 5, sfx: 'zap', hs: 8, fx: 'zap' })],
      moves: [{ f: 6, vy: 14, mulX: 0.3 }], onHit(F) { F.vy = -10; F.endAttackSoon(10); } },

    skill1: { len: 26, air: true, grav: 0.4,
      keys: [K(0, {}), K(6, { af: 40, ef: 80, w: 150, t: -6, hx: -4 }), K(9, { af: 95, ef: 0, w: 92, t: 16, hx: 6 }, 'outExpo'), K(26, { af: 30, ef: 50, w: 172, t: 2, hx: 0 })],
      tick(F, f, G) {
        if (F.at(9)) {
          Sfx.play('orb');
          G.spawnProjectile(F, { kind: 'orb', x: F.J.wTip.x + F.facing * 10, y: F.J.wTip.y, vx: 7.5 * F.facing, vy: 0, r: 16, life: 90,
            explode: { r: 60, dmg: 9, kb: 10, g: 6, a: 40, hs: 8 } });
          F.vx -= F.facing * 2;
        }
      } },
    skill2: { len: 34, air: true, grav: 0.25,
      keys: [K(0, {}), K(6, { af: 172, ef: 5, w: 182, t: -10, n: -15 }, 'outBack'), K(26, {}), K(34, { af: 30, ef: 50, w: 172, t: 2, n: 0 })],
      tick(F, f, G) {
        if (F.at(4)) {
          const T = G.nearestEnemy(F, 2000);
          const tx = T ? T.x + T.vx * 10 : F.x + F.facing * 200;
          G.spawnStrike(F, tx, 28, { dmg: 13, kb: 12, g: 6, a: 82, hs: 10 });
          Sfx.play('stance');
        }
        if (f > 4 && f < 26 && F.atkTime % 4 === 0) FX.sparks(F.J.wTip.x, F.J.wTip.y - 6, 0, -1, F.char.color, 3, 0.5);
      } },
  },
});

// ═════════════════════════════════════════════════════════════
//  VALK — valquiria con lanza. Alcance enorme y gran movilidad aérea.
// ═════════════════════════════════════════════════════════════
CHARACTERS.push({
  id: 'valk', name: 'VALK', title: 'La Valquiria', color: '#3ddc84', shade: '#1f8a50', accent: '#ffd23f',
  desc: 'El mayor alcance del juego. Castiga desde lejos y vuela con su salto.',
  stats: { run: 6.4, jump: 16, djump: 14.2, jumps: 2, weight: 1.05, dmg: 1.0, speed: 1.05, scale: 1.02, hp: 100 },
  rating: { vel: 3, fue: 4, alc: 5, dif: 3 },
  weapon: { type: 'spear', len: 62, back: 34, grip: 20, twoHand: -26, drawBehindArm: false },
  stance: { t: 8, lf: 22, kf: 30, lb: -18, kb: 24, af: 50, ef: 30, ab: 0, eb: 0, w: 96 },
  cloth: [{ anchor: 'headBack', n: 7, seg: 6, color: '#ffd23f', w0: 6, w1: 2, gravity: 0.35 }],
  accFront(ctx, J) {
    // alas del casco
    ctx.fillStyle = '#e8edf3';
    const b = headPoint(J, -3, 5), t1 = headPoint(J, -14, 14), t2 = headPoint(J, -10, 6);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.closePath(); ctx.fill();
  },
  skills: [
    { key: 'skill1', name: 'Jabalina', desc: 'Lanza una lanza espectral que atraviesa el escenario.', cd: 110 },
    { key: 'skill2', name: 'Salto de Valquiria', desc: 'Se eleva y cae en picado lanza en ristre. También sirve para volver.', cd: 220 },
  ],
  moves: {
    L1: { len: 14, next: 'L2', chainFrom: 5, swish: [2, 0.55],
      keys: [K(0, {}), K(2, { af: 30, ef: 62, hx: -4, w: 92 }), K(4, { af: 88, ef: 2, hx: 8, t: 16, w: 91 }, 'outExpo'), K(14, { af: 50, ef: 30, hx: 0, t: 8, w: 96 })],
      hits: [H(3, 5, 96, -62, 18, 3.5, 4.5, 12, { sfx: 'hit', hs: 4 }), H(3, 5, 58, -62, 22, 3, 4, 12, { sfx: 'hit', hs: 4 })], moves: [{ f: 3, vx: 2 }] },
    L2: { len: 15, next: 'L3', chainFrom: 5, swish: [2, 0.6],
      keys: [K(0, {}), K(2, { af: 20, ef: 70, hx: -4, w: 80, t: 14, lf: 34, kf: 60 }), K(4, { af: 80, ef: 0, hx: 10, t: 24, w: 78 }, 'outExpo'),
             K(15, { af: 50, ef: 30, hx: 0, t: 8, w: 96, lf: 22, kf: 30 })],
      hits: [H(3, 5, 92, -40, 20, 4, 5, 22, { sfx: 'hit', hs: 4 }), H(3, 5, 56, -48, 22, 3.5, 4.5, 22, { sfx: 'hit', hs: 4 })], moves: [{ f: 3, vx: 2 }] },
    L3: { len: 26, iasa: 23, swish: [4, 1.1],
      keys: [K(0, {}), K(3, { t: -6, af: 90, ef: 0, w: 96 }), K(13, { w: 456, t: 14 }, 'outCubic'), K(26, { w: 456, af: 50, ef: 30, t: 8 })],
      hits: [H(5, 12, 14, -52, 68, 7, 9, 40, { g: 6, sfx: 'heavy', hs: 7 })], freeBack: true, moves: [{ f: 4, vx: 3 }] },
    sideHeavy: { len: 34, iasa: 30, swish: [10, 1.2],
      keys: [K(0, {}), K(8, { hx: -10, af: 10, ef: 92, t: -6, w: 94, lf: 14, kf: 40, lb: -30, kb: 30 }, 'outCubic'),
             K(11, { af: 92, ef: 0, hx: 22, t: 30, lf: 55, kf: 30, lb: -45, kb: 5, w: 92 }, 'outExpo'), K(20, {}),
             K(34, { af: 50, ef: 30, hx: 0, t: 8, w: 96, lf: 22, kf: 30, lb: -18, kb: 24 })],
      hits: [H(10, 13, 108, -60, 22, 12, 12, 22, { g: 9, sfx: 'heavy', hs: 10 }), H(10, 13, 60, -60, 20, 8, 8, 30, { g: 5, sfx: 'hit', hs: 7 })],
      moves: [{ f: 10, vx: 10 }] },
    upHeavy: { len: 28, jumpCancel: true, air: true, swish: [7, 1.0],
      keys: [K(0, {}), K(5, { t: 16, lf: 40, kf: 70, lb: -20, kb: 60, af: 20, ef: 60, w: 150 }),
             K(8, { t: -8, af: 175, ef: 0, w: 180, kf: 10, kb: 10, lf: 8, sq: 1.1 }, 'outExpo'), K(16, { sq: 1 }),
             K(28, { t: 8, af: 50, ef: 30, w: 96, lf: 22, kf: 30, lb: -18, kb: 24 })],
      hits: [H(7, 11, 12, -140, 26, 9, 12, 90, { g: 5, sfx: 'hit', hs: 7 }), H(7, 11, 10, -95, 24, 6, 10, 85, { sfx: 'hit', hs: 5 })] },
    downHeavy: { len: 28, jumpCancel: true, swish: [7, 1.0],
      keys: [K(0, {}), K(5, { lf: 55, kf: 100, lb: -45, kb: 85, t: 28, af: -20, ef: 20, w: -20 }),
             K(8, { af: 70, ef: 0, w: 62, t: 32, lb: -72, kb: 12 }, 'outExpo'), K(14, { af: 74, w: 66 }),
             K(28, { lf: 22, kf: 30, lb: -18, kb: 24, t: 8, af: 50, ef: 30, w: 96 })],
      hits: [H(7, 11, 82, -16, 26, 7, 9, 72, { g: 3, sfx: 'hit', hs: 6 })] },
    airLight: { len: 15, air: true, landLag: 4, swish: [2, 0.55],
      keys: [K(0, {}), K(2, { af: 30, ef: 62, w: 92, lf: 40, kf: 60, lb: -10, kb: 50 }), K(4, { af: 88, ef: 2, w: 91, t: 14 }, 'outExpo'), K(15, { af: 50, ef: 30, w: 96, t: 8 })],
      hits: [H(3, 6, 90, -56, 20, 4, 5, 28, { sfx: 'hit', hs: 4 })] },
    airHeavy: { len: 26, air: true, landLag: 8, swish: [6, 1.2],
      keys: [K(0, {}), K(5, { af: 150, ef: 20, w: 220, t: -12, lf: 40, kf: 70, lb: -20, kb: 60 }),
             K(9, { af: 70, ef: 0, w: 40, t: 22, lf: 10, kf: 20 }, 'outExpo'), K(26, { af: 50, ef: 30, w: 96, t: 8 })],
      hits: [H(7, 10, 70, -40, 40, 9, 9, 30, { g: 6, sfx: 'hit', hs: 7 })] },
    airDown: { len: 26, air: true, landLag: 10, swish: [5, 1.1],
      keys: [K(0, {}), K(4, { af: 170, ef: 10, w: 190, lf: 60, kf: 90, lb: 20, kb: 90 }),
             K(7, { af: 12, ef: 0, w: 4, lf: 0, kf: 10, lb: -15, kb: 20 }, 'outExpo'), K(26, {})],
      hits: [H(6, 22, 8, 12, 26, 8, 8, -80, { g: 5, sfx: 'heavy', hs: 8 })],
      moves: [{ f: 6, vy: 15, mulX: 0.3 }], onHit(F) { F.vy = -11; F.endAttackSoon(10); } },

    skill1: { len: 28, air: true, grav: 0.5, freeBack: true,
      keys: [K(0, {}), K(7, { af: 185, ef: 20, w: 110, t: -16, hx: -6, lf: 30, lb: -30, ab: 70, eb: 0 }, 'outCubic'),
             K(10, { af: 70, ef: 0, w: 80, t: 28, hx: 8, ab: -40 }, 'outExpo'), K(28, { af: 50, ef: 30, w: 96, t: 8, hx: 0, ab: 0 })],
      tick(F, f, G) {
        if (F.at(10)) {
          Sfx.play('throw');
          G.spawnProjectile(F, { kind: 'javelin', x: F.x + F.facing * 30, y: F.y - 62 * F.s, vx: 24 * F.facing, vy: -1.5, g: 0.12, r: 14, life: 70,
            hit: { dmg: 10, kb: 11, g: 6, a: 25, hs: 8, sfx: 'heavy' } });
          F.hideWeapon = 26;
        }
      } },
    skill2: { len: 70, air: true, invuln: [0, 6],
      keys: [K(0, {}), K(5, { t: 20, lf: 45, kf: 95, lb: -25, kb: 85, af: 0, ef: 60, w: 150 }),
             K(10, { t: -10, lf: 10, kf: 10, lb: -10, kb: 20, af: 175, ef: 0, w: 180, sq: 1.15 }, 'outExpo'),
             K(22, { lf: 40, kf: 80, lb: 10, kb: 80, sq: 1, t: 0 }),
             K(28, { t: 40, af: 40, ef: 0, w: 30, lf: 10, kf: 10, lb: -40, kb: 10 }, 'outExpo'), K(50, {}),
             K(56, { t: 22, lf: 40, kf: 90, lb: -30, kb: 70, af: 60, ef: 20, w: 80 }, 'outCubic'),
             K(70, { t: 8, lf: 22, kf: 30, lb: -18, kb: 24, af: 50, ef: 30, w: 96 })],
      tick(F, f, G) {
        const s = F.atkState;
        if (F.at(1)) { s.dive = false; s.done = false; }
        if (F.at(8)) { F.vy = -19; F.vx = F.facing * 3; Sfx.play('djump'); FX.ring(F.x, F.y, F.char.color, 50, 14, 3); F.jumpsLeft = 0; }
        if (F.at(26) && !s.done) { s.dive = true; Sfx.play('dash'); }
        if (s.dive && !s.done && F.wallDir === F.facing) {
          // choca con una pared: corta el picado para poder rebotar en ella
          s.done = true; F.vx = -F.facing * 2; F.vy = Math.min(F.vy, 2);
          FX.ring(F.x + F.facing * 12, F.y - 40, '#ffffff', 40, 10, 3); G.shake(0.15);
          F.endAttack(); return;
        }
        if (s.dive && !s.done) {
          F.vx = F.facing * 13; F.vy = 16; F.ghostTrail = 2;
          F.atkTime = Math.min(F.atkTime, 40);
          G.activeHit(F, { x: 40, y: -20, r: 34, dmg: 12, kb: 11, g: 7, a: 38, hs: 9, sfx: 'heavy' });
          if (F.onGround || F.atk.hasHit) {
            s.done = true; F.atkTime = 50;
            if (F.onGround) { FX.landDust(F.x, F.y, 1.6); FX.ring(F.x, F.y, F.char.color, 70, 14, 4); G.shake(0.3); Sfx.play('land', 1.5); }
            else { F.vy = -6; F.vx *= 0.3; }
          }
          if (F.y > G.stage.blast.y + G.stage.blast.h) s.done = true;
        }
      } },
  },
});

// ═════════════════════════════════════════════════════════════
//  BALA — pistolera. Patadas, disparos y una escopeta que la impulsa.
// ═════════════════════════════════════════════════════════════
CHARACTERS.push({
  id: 'bala', name: 'BALA', title: 'La Pistolera', color: '#ffd23f', shade: '#b8901a', accent: '#c0392b',
  desc: 'Patadas rápidas y balas que castigan a distancia. Su escopeta la catapulta.',
  stats: { run: 6.8, jump: 15.5, djump: 14, jumps: 2, weight: 0.95, dmg: 1.0, speed: 0.95, scale: 0.98, hp: 95 },
  rating: { vel: 4, fue: 3, alc: 4, dif: 3 },
  weapon: { type: 'revolver', len: 16, grip: 10 },
  dashType: 'roll',
  stance: { t: 4, lf: 14, kf: 18, lb: -10, kb: 14, af: 25, ef: 15, ab: -10, eb: 20, w: 50 },
  cloth: [{ anchor: 'neck', n: 5, seg: 5, color: '#c0392b', w0: 5, w1: 2.5, gravity: 0.35 }],
  accFront(ctx, J) { drawHat(ctx, J, '#6b4226', 15, 8, 7); },
  skills: [
    { key: 'skill1', name: 'Disparo', desc: 'Bala rápida de largo alcance. Cadencia alta.', cd: 30 },
    { key: 'skill2', name: 'Escopeta', desc: 'Cono devastador a quemarropa; el retroceso te lanza hacia atrás.', cd: 230 },
  ],
  moves: {
    L1: { len: 12, next: 'L2', chainFrom: 4, swish: [2, 0.5],
      keys: [K(0, {}), K(1, { af: 130, ef: 40, w: 190 }), K(3, { af: 86, ef: 10, w: 74, t: 12 }, 'outExpo'), K(5, { af: 80, w: 70 }), K(12, { af: 25, ef: 15, w: 50, t: 4 })],
      hits: [H(3, 5, 38, -60, 22, 3.5, 4, 20, { sfx: 'hit', hs: 4 })], moves: [{ f: 2, vx: 2.5 }] },
    L2: { len: 15, next: 'L3', chainFrom: 5, swish: [3, 0.6],
      keys: [K(0, {}), K(3, { lf: 45, kf: 105, t: -4 }), K(5, { lf: 95, kf: 0, t: -14, af: 60, ab: -40 }, 'outExpo'), K(15, { lf: 14, kf: 18, t: 4, af: 25, ab: -10 })],
      hits: [H(4, 6, 52, -48, 22, 4.5, 6, 25, { sfx: 'hit', hs: 5 })], moves: [{ f: 3, vx: 2.5 }] },
    L3: { len: 22, iasa: 20,
      keys: [K(0, {}), K(4, { af: 90, ef: 0, w: 90, t: 2 }), K(6, { af: 112, w: 125, t: -8, hx: -4 }, 'outExpo'), K(22, { af: 25, ef: 15, w: 50, t: 4, hx: 0 })],
      hits: [H(5, 7, 74, -62, 30, 7, 10, 15, { g: 6, sfx: 'shoot', hs: 7 })],
      tick(F, f) { if (F.at(5)) F.muzzle(); } },
    sideHeavy: { len: 30, iasa: 28, swish: [8, 1.2],
      keys: [K(0, {}), K(6, { lf: 50, kf: 110, t: 8, af: 60, ab: -40 }), K(9, { lf: 116, kf: 0, t: -36, af: -30, ef: 30, ab: -60 }, 'outExpo'), K(16, {}),
             K(30, { lf: 14, kf: 18, t: 4, af: 25, ef: 15, ab: -10 })],
      hits: [H(8, 11, 56, -68, 28, 11, 11, 30, { g: 8, sfx: 'heavy', hs: 9 })], moves: [{ f: 7, vx: 6 }] },
    upHeavy: { len: 26, jumpCancel: true, air: true,
      keys: [K(0, {}), K(5, { af: 170, ef: 0, w: 180, t: -6, n: -20 }, 'outCubic'), K(7, { af: 178, w: 196, t: -10 }, 'outExpo'), K(26, { af: 25, ef: 15, w: 50, t: 4, n: 0 })],
      hits: [H(6, 8, 8, -150, 42, 8, 11, 88, { g: 5, sfx: 'shoot', hs: 6 })],
      tick(F, f) { if (F.at(6)) F.muzzle(); } },
    downHeavy: { len: 26, jumpCancel: true, swish: [6, 0.9],
      keys: [K(0, {}), K(4, { lf: 30, kf: 70, t: 10 }), K(7, { lf: 85, kf: 0, lb: -10, kb: 120, t: -30, af: -20, ab: -40 }, 'outExpo'),
             K(16, {}), K(26, { lf: 14, kf: 18, lb: -10, kb: 14, t: 4, af: 25, ab: -10 })],
      hits: [H(6, 13, 46, -14, 26, 6, 8.5, 72, { g: 3, sfx: 'hit', hs: 5 })], moves: [{ f: 6, vx: 11 }] },
    airLight: { len: 15, air: true, landLag: 4, swish: [2, 0.55],
      keys: [K(0, {}), K(2, { lf: 50, kf: 100, lb: 0, kb: 80 }), K(4, { lf: 96, kf: 0, t: -10 }, 'outExpo'), K(15, { lf: 20, kf: 40, t: 4 })],
      hits: [H(3, 7, 46, -42, 22, 4, 5, 30, { sfx: 'hit', hs: 4 })] },
    airHeavy: { len: 24, air: true, landLag: 8,
      keys: [K(0, {}), K(5, { af: 90, ef: 0, w: 90, t: 4, lf: 40, kf: 60, lb: -20, kb: 60 }), K(7, { af: 112, w: 124, t: -10 }, 'outExpo'), K(24, { af: 25, ef: 15, w: 50, t: 4 })],
      hits: [H(6, 8, 80, -56, 32, 8, 9, 25, { g: 6, sfx: 'shoot', hs: 7 })],
      tick(F, f) { if (F.at(6)) { F.muzzle(); F.vx -= F.facing * 4; } } },
    airDown: { len: 24, air: true, landLag: 6,
      keys: [K(0, {}), K(4, { af: 2, ef: 0, w: 0, t: 6, lf: 40, kf: 80, lb: 0, kb: 80 }, 'outCubic'), K(6, { af: -10, w: -14, t: 0 }, 'outExpo'), K(24, { af: 25, ef: 15, w: 50, t: 4 })],
      hits: [H(5, 7, 4, 50, 36, 7, 8, -78, { g: 5, sfx: 'shoot', hs: 7 })],
      tick(F, f) { if (F.at(5)) { F.muzzle(); F.vy = Math.min(F.vy, -9); FX.ring(F.x, F.y + 20, '#ffd23f', 40, 10, 3); } } },

    skill1: { len: 18, air: true, grav: 0.6,
      keys: [K(0, {}), K(3, { af: 90, ef: 0, w: 90, t: 2 }, 'outCubic'), K(5, { af: 108, w: 118, t: -6, hx: -3 }, 'outExpo'), K(18, { af: 25, ef: 15, w: 50, t: 4, hx: 0 })],
      tick(F, f, G) {
        if (F.at(4)) {
          F.muzzle(true);
          G.spawnProjectile(F, { kind: 'bullet', x: F.J.wTip.x, y: F.J.wTip.y, vx: 32 * F.facing, vy: 0, r: 7, life: 40,
            hit: { dmg: 5, kb: 6, g: 3, a: 15, hs: 4, sfx: 'hit' } });
        }
      } },
    skill2: { len: 34, air: true,
      keys: [K(0, {}), K(5, { af: 90, ef: 0, w: 90, t: 6, ab: 80, eb: 10 }, 'outCubic'), K(7, { af: 140, w: 170, t: -30, hx: -8, ab: 120 }, 'outExpo'),
             K(34, { af: 25, ef: 15, w: 50, t: 4, hx: 0, ab: -10, eb: 20 })],
      tick(F, f, G) {
        if (F.at(6)) {
          Sfx.play('shotgun');
          const mx = F.J.wTip.x, my = F.J.wTip.y;
          for (let i = 0; i < 18; i++) FX.sparks(mx, my, F.facing, rand(-0.35, 0.35), '#ffd23f', 1, 1.5);
          FX.hitFlash(mx + F.facing * 20, my, '#ffb703', 1.4);
          G.coneHit(F, mx, my, 150, 0.45, { dmg: 12, kb: 13, g: 6, a: 25, hs: 10, sfx: 'heavy' });
          F.vx = -F.facing * 15; F.vy = F.onGround ? -4 : -7;
          G.shake(0.45);
        }
      } },
  },
});

// ── compilación de movimientos ──
function compileCharacter(ch) {
  const sp = ch.stats.speed, sc = ch.stats.scale;
  const fr = (f) => Math.max(0, Math.round(f * sp));
  const compileMove = (m, name) => {
    const c = Object.assign({}, m);
    c.name = name;
    c.len = fr(m.len);
    c.iasa = m.iasa != null ? fr(m.iasa) : c.len;
    c.chainFrom = m.chainFrom != null ? fr(m.chainFrom) : null;
    c.keysRaw = m.keys;
    c.track = compileTrack(m.keys.map((k) => ({ f: fr(k.f), p: k.p, e: k.e })), ch.stance);
    c.hits = (m.hits || []).map((h) => Object.assign({}, h, { from: fr(h.from), to: fr(h.to), x: h.x * sc, y: h.y * sc, r: h.r * sc }));
    c.moves = (m.moves || []).map((mv) => Object.assign({}, mv, { f: fr(mv.f) }));
    c.firstHit = c.hits.length ? Math.min(...c.hits.map((h) => h.from)) : null;
    c.lastHit = c.hits.length ? Math.max(...c.hits.map((h) => h.to)) : null;
    if (m.swish) c.swish = [fr(m.swish[0]), m.swish[1], m.swish[2] || 'swish'];
    if (m.armor) c.armor = m.armor.map(fr);
    if (m.invuln) c.invuln = m.invuln.map(fr);
    if (m.counter) c.counter = m.counter.map(fr);
    if (m.noGrav) c.noGrav = m.noGrav.map(fr);
    if (c.firstHit != null) {
      c.trailFrom = Math.max(0, c.firstHit - 2);
      c.trailTo = c.lastHit + 2;
    }
    // las funciones tick reciben frames sin escalar para que el diseño sea legible
    c.speed = sp;
    return c;
  };
  ch.compiled = {};
  for (const name in ch.moves) ch.compiled[name] = compileMove(ch.moves[name], name);
  if (ch.counterMove) ch.compiled.counterStrike = compileMove(ch.counterMove, 'counterStrike');
  ch.stancePose = makePose(ch.stance);
}
CHARACTERS.forEach(compileCharacter);
const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

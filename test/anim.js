'use strict';
// ─────────────────────────────────────────────────────────────
//  Mediciones de animación y combate:
//   · sync: en los fotogramas activos, ¿el arma/extremidad visible
//     está dentro de la caja de golpe? (si no, el golpe "no se ve")
//   · pops: saltos bruscos de pose entre ticks en partidas de bots
//   · perf: coste de la lógica y del dibujo
// ─────────────────────────────────────────────────────────────

const AnimTest = {
  strikePoints(F) {
    const J = F.J, wt = F.char.weapon.type, pts = [J.ftF, J.ftB, J.knF, J.haF, J.haB];
    if (wt === 'katana' || wt === 'spear' || wt === 'staff') {
      for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        pts.push({ x: lerp(J.wBase.x, J.wTip.x, t), y: lerp(J.wBase.y, J.wTip.y, t) });
      }
      if (wt === 'spear') {
        const dx = J.wTip.x - J.wBase.x, dy = J.wTip.y - J.wBase.y, L = Math.hypot(dx, dy) || 1;
        pts.push({ x: J.wTip.x + dx / L * 12 * F.s, y: J.wTip.y + dy / L * 12 * F.s });
      }
    } else if (wt === 'daggers') pts.push(J.wTip, J.w2Tip);
    else pts.push(J.wTip);
    return pts;
  },

  // ejecuta un movimiento aislado y mide la distancia arma ↔ caja de golpe
  syncMove(charId, name) {
    const m = new Match({ mode: 'showcase', stage: SHOWCASE_STAGE, seed: 7, players: [{ charId, source: 'script', slot: 0 }] });
    const F = m.fighters[0], mv = F.char.compiled[name];
    const air = name.startsWith('air');
    F.reset(0, air ? -700 : 0, 1);
    for (let i = 0; i < 20; i++) { F.ctrl.clear(); m.update(); }
    if (air) { F.x = 0; F.y = -700; F.vx = 0; F.vy = -2; F.onGround = false; F.setState('air'); }
    F.startAttack(name, m);
    const out = { frames: 0, inside: 0, gapSum: 0, first: null };
    for (let i = 0; i < 80 && F.state === 'attack' && F.atk && F.atk.name === name; i++) {
      F.ctrl.clear();
      m.update();
      if (F.state !== 'attack' || !F.atk) break;
      const t = F.atkTime;
      for (const hb of F.atk.hits) {
        if (t < hb.from || t > hb.to) continue;
        if (hb.sfx === 'shoot') continue;           // disparos: la caja es la bala
        const cx = F.x + hb.x * F.facing, cy = F.y + hb.y;
        let best = Infinity;
        for (const p of this.strikePoints(F)) best = Math.min(best, Math.hypot(p.x - cx, p.y - cy) - hb.r);
        out.frames++;
        if (best <= 0) out.inside++; else out.gapSum += best;
        if (out.first == null && t === hb.from) out.first = Math.round(best);
      }
    }
    return out;
  },

  syncAll() {
    const rows = [];
    let frames = 0, inside = 0, gap = 0, firstMiss = 0, moves = 0;
    for (const ch of CHARACTERS) {
      for (const name in ch.compiled) {
        if (name === 'counterStrike') continue;
        if (!ch.compiled[name].hits.length) continue;
        const r = this.syncMove(ch.id, name);
        if (!r.frames) continue;
        rows.push({ move: ch.id + ':' + name, sync: Math.round(100 * r.inside / r.frames), gap: +(r.gapSum / Math.max(1, r.frames - r.inside)).toFixed(1), first: r.first });
        frames += r.frames; inside += r.inside; gap += r.gapSum; moves++;
        if (r.first > 0) firstMiss++;
      }
    }
    return { moves, syncPct: +(100 * inside / frames).toFixed(1), avgGap: +(gap / Math.max(1, frames - inside)).toFixed(1), firstFrameMisses: firstMiss, rows };
  },

  // saltos de pose en una partida de bots (posiciones relativas a la cadera)
  pops(seconds = 60, seed = 99) {
    const ids = CHARACTERS.map((c) => c.id);
    const m = new Match({ mode: 'bots', stage: STAGES[0], seed, firstTo: 99,
      players: [0, 1, 2, 3].map((i) => ({ charId: ids[(i * 2 + seed) % ids.length], source: 'bot', level: 'hard', slot: i })) });
    const hist = m.fighters.map(() => []);
    let samples = 0, pops = 0, big = 0, rotSnaps = 0;
    const acc = [];
    Sfx.silent++;
    try {
      for (let k = 0; k < seconds * 60; k++) {
        m.update();
        m.fighters.forEach((F, i) => {
          if (!F.alive || F.hitstop > 0 || F.noInterpWas) { hist[i].length = 0; return; }
          const rel = JOINT_NAMES.filter((n) => n !== 'w2Base' && n !== 'w2Tip').map((n) => [F.J[n].x - F.J.hip.x, F.J[n].y - F.J.hip.y]);
          const h = hist[i];
          h.push({ rel, rot: F.pose.cur.rot, st: F.state });
          if (h.length > 3) h.shift();
          if (h.length < 3) return;
          let worst = 0;
          for (let j = 0; j < rel.length; j++) {
            const ax = h[2].rel[j][0] - 2 * h[1].rel[j][0] + h[0].rel[j][0];
            const ay = h[2].rel[j][1] - 2 * h[1].rel[j][1] + h[0].rel[j][1];
            worst = Math.max(worst, Math.hypot(ax, ay));
          }
          acc.push(worst);
          samples++;
          if (worst > 30) pops++;
          if (worst > 60) big++;
          if (Math.abs(h[2].rot - h[1].rot) > 60) rotSnaps++;
        });
      }
    } finally { Sfx.silent--; }
    acc.sort((a, b) => a - b);
    const q = (p) => +acc[Math.floor(acc.length * p)].toFixed(1);
    return { samples, popsPerMin: +(pops / (samples / 3600)).toFixed(1), bigPerMin: +(big / (samples / 3600)).toFixed(1), rotSnaps, p50: q(0.5), p95: q(0.95), p99: q(0.99), hp: m.fighters.map((F) => F.stats.dmgDealt | 0) };
  },

  // deslizamiento del pie de apoyo al correr (px/tick; 0 = pie clavado)
  footSlide() {
    const out = {};
    for (const ch of CHARACTERS) {
      const m = new Match({ mode: 'showcase', stage: SHOWCASE_STAGE, seed: 7, players: [{ charId: ch.id, source: 'script', slot: 0 }] });
      const F = m.fighters[0]; F.reset(0, 0, 1);
      for (let i = 0; i < 20; i++) { F.ctrl.clear(); m.update(); }
      let sabs = 0, n = 0, prev = null;
      for (let i = 0; i < 160; i++) {
        F.ctrl.clear(); F.ctrl.held.right = true; m.update();
        if (i > 40 && prev) { const k = F.J.ftF.y > F.J.ftB.y ? 'ftF' : 'ftB'; sabs += Math.abs(F.J[k].x - prev[k]); n++; }
        prev = { ftF: F.J.ftF.x, ftB: F.J.ftB.x };
      }
      out[ch.id] = +(sabs / n).toFixed(2);
    }
    return out;
  },

  // dos golpes que conectan en el mismo tick deben intercambiarse
  trade() {
    const m = new Match({ mode: 'training', stage: STAGES[0], seed: 3, players: [
      { charId: 'kaze', source: 'script', slot: 0 }, { charId: 'kaze', source: 'script', slot: 1 }] });
    m.phase = 'fight';
    const [A, B] = m.fighters;
    const g = m.stage.solids[0];
    A.reset(m.stage.cx - 40, g.y, 1); B.reset(m.stage.cx + 40, g.y, -1);
    for (let i = 0; i < 30; i++) { A.ctrl.clear(); B.ctrl.clear(); m.update(); }
    A.startAttack('L1', m); B.startAttack('L1', m);
    for (let i = 0; i < 12; i++) { A.ctrl.clear(); B.ctrl.clear(); m.update(); }
    return { A: A.state, B: B.state, hpA: A.hp, hpB: B.hp, traded: A.hp < A.maxHp && B.hp < B.maxHp };
  },

  perf(seconds = 30) {
    const ids = CHARACTERS.map((c) => c.id);
    const m = new Match({ mode: 'bots', stage: STAGES[1] || STAGES[0], seed: 5, firstTo: 99,
      players: [0, 1, 2, 3].map((i) => ({ charId: ids[i + 1], source: 'bot', level: 'hard', slot: i })) });
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    const ctx = cv.getContext('2d');
    const up = [], dr = [];
    Sfx.silent++;
    try {
      for (let k = 0; k < seconds * 60; k++) {
        let t0 = performance.now(); m.update(); up.push(performance.now() - t0);
        if (k % 2 === 0) { t0 = performance.now(); ctx.setTransform(1, 0, 0, 1, 0, 0); m.draw(ctx, 0.5, 1280, 720); dr.push(performance.now() - t0); }
      }
    } finally { Sfx.silent--; }
    const st = (a) => { a.sort((x, y) => x - y); return { avg: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(3), p95: +a[Math.floor(a.length * 0.95)].toFixed(3), max: +a[a.length - 1].toFixed(2) }; };
    return { update: st(up), draw: st(dr) };
  },
};

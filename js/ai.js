'use strict';
// ─────────────────────────────────────────────────────────────
//  Bots: generan entradas como si fueran un mando más.
// ─────────────────────────────────────────────────────────────

const BOT_LEVELS = {
  easy:   { think: 22, combo: 0.25, dodge: 0.05, tech: 0.1, aggr: 0.4, skill: 0.25, slop: 40, di: 0.2, recover: 0.75 },
  normal: { think: 12, combo: 0.6, dodge: 0.22, tech: 0.4, aggr: 0.65, skill: 0.5, slop: 18, di: 0.5, recover: 0.95 },
  hard:   { think: 6, combo: 0.92, dodge: 0.45, tech: 0.8, aggr: 0.85, skill: 0.8, slop: 6, di: 0.9, recover: 1 },
  dummy:  { think: 30, combo: 0, dodge: 0, tech: 0, aggr: 0, skill: 0, slop: 0, di: 0, recover: 1 },
};
// distancia preferida y estilo por personaje
const BOT_STYLE = {
  kaze: { range: 70, zoner: false }, toro: { range: 52, zoner: false }, sombra: { range: 46, zoner: false },
  volta: { range: 210, zoner: true }, valk: { range: 92, zoner: false }, bala: { range: 240, zoner: true },
};

// desplazamiento aproximado (px, hacia delante) de los movimientos que mueven mucho
const BOT_TRAVEL = {
  'toro:skill1': 380, 'toro:sideHeavy': 60, 'kaze:skill1': 240, 'kaze:L3': 70, 'kaze:sideHeavy': 50,
  'sombra:sideHeavy': 90, 'sombra:downHeavy': 80, 'valk:skill2': 280, 'valk:sideHeavy': 60,
  'bala:skill2': -160, 'bala:downHeavy': 70, 'bala:sideHeavy': 40,
};

// rutas de combo por personaje (las mismas que la lista de movimientos)
const BOT_ROUTES = {
  kaze:   { L1: ['light'], L2: ['light', 'skill1'], L3: ['heavy', 'skill1'], downHeavy: ['skill1'], upHeavy: ['jump'], airLight: ['heavy'] },
  toro:   { L1: ['light'], L2: ['skill1', 'heavy'], downHeavy: ['up+heavy'], airLight: ['heavy'] },
  sombra: { L1: ['light'], L2: ['light', 'skill1'], L3: ['up+heavy'], upHeavy: ['jump'], airLight: ['heavy'], skill1: ['dash'] },
  volta:  { L1: ['light'], L2: ['skill1', 'light'], downHeavy: ['skill1', 'jump'], airLight: ['heavy'] },
  valk:   { L1: ['light'], L2: ['skill1', 'heavy'], downHeavy: ['skill1'], airLight: ['heavy'] },
  bala:   { L1: ['light'], L2: ['light'], L3: ['skill2', 'skill1'], downHeavy: ['up+heavy'], airLight: ['heavy'] },
};

class Bot {
  constructor(F, level, rng) {
    this.F = F;
    this.rng = rng || VISUAL_RNG;
    this.level = level;
    this.p = BOT_LEVELS[level] || BOT_LEVELS.normal;
    this.style = BOT_STYLE[F.char.id] || { range: 70 };
    this.thinkT = this.rng.int(0, this.p.think);
    this.moveX = 0;
    this.holdUp = false; this.holdDown = false;
    this.holds = {};
    this.target = null;
    this.retargetT = 0;
    this.comboDone = null;
    this.techRoll = null;
    this.downTapT = 0;
    this.airT = 0;
    this.dirHold = null;
    this.giveUp = false;     // los bots fáciles a veces no se recuperan
    this.G = null;
  }

  // ── consultas del escenario ──
  // plataforma más alta por debajo del punto (x, y)
  groundBelow(x, y) {
    let best = null;
    for (const p of this.G.stage.plats) {
      if (x < p.x + 6 || x > p.x + p.w - 6 || p.y < y - 4) continue;
      if (!best || p.y < best.y) best = p;
    }
    return best;
  }
  // ¿acabaría sobre suelo si se desplaza dx (en la dirección en la que mira)?
  safe(dx) {
    const F = this.F;
    const x = F.x + dx * F.facing;
    const g = this.groundBelow(x, F.y - 40);
    if (!g) return false;
    // camino: no debe haber un hueco grande entre medias si va por el suelo
    if (F.onGround && Math.abs(dx) > 40) {
      const steps = Math.ceil(Math.abs(dx) / 40);
      for (let i = 1; i < steps; i++) if (!this.groundBelow(F.x + (dx * i / steps) * F.facing, F.y - 40)) return false;
    }
    return true;
  }
  // nombre del movimiento que saldría al pulsar ahora (para comprobar bordes)
  moveName(a) {
    const F = this.F;
    const up = this.holdUp || (this.dirHold && this.dirHold.dir === 'up');
    const down = this.holdDown || (this.dirHold && this.dirHold.dir === 'down');
    if (a === 'light') {
      if (F.state === 'attack' && F.atk && F.atk.next) return F.atk.next;
      return F.onGround ? 'L1' : 'airLight';
    }
    if (a === 'heavy') {
      if (up) return 'upHeavy';
      if (F.onGround) return down ? 'downHeavy' : 'sideHeavy';
      return down ? 'airDown' : 'airHeavy';
    }
    return a;
  }
  attackSafe(a) {
    const F = this.F, name = this.moveName(a);
    if (name === 'airDown') return !!this.groundBelow(F.x, F.y);
    const d = BOT_TRAVEL[F.char.id + ':' + name];
    return d == null || this.safe(d);
  }

  press(a, hold = 1, force = false) {
    if (!force && this.G && ['light', 'heavy', 'skill1', 'skill2'].includes(a) && !this.attackSafe(a)) return false;
    this.F.ctrl.pressed[a] = true; this.holds[a] = Math.max(this.holds[a] || 0, hold);
    return true;
  }
  wantsTech() {
    if (this.techRoll == null) this.techRoll = this.rng.next() < this.p.tech;
    const r = this.techRoll; this.techRoll = null;
    return r;
  }

  update(G) {
    this.G = G;
    const F = this.F, c = F.ctrl;
    for (const a of ACTIONS) c.pressed[a] = false;
    if (!F.alive) { this.giveUp = false; return; }

    if (--this.retargetT <= 0 || !this.target || !this.target.alive) {
      this.target = G.nearestEnemy(F);
      this.retargetT = 40;
    }
    const T = this.target;
    this.holdUp = false; this.holdDown = false;

    // ¿fuera del escenario? (en el aire y sin suelo debajo)
    const below = F.onGround ? F.groundPlat : this.groundBelow(F.x, F.y);
    const off = !F.onGround && !below;
    if (F.onGround) this.giveUp = false;
    if (off && !F.inHitstun) {
      if (!this.giveUp && this.rng.next() > Math.pow(this.p.recover, 1 / 30)) this.giveUp = true;
      this.recover(G);
    } else if (F.inHitstun) {
      // influencia direccional: hacia el centro y arriba
      if (this.rng.next() < this.p.di) { this.moveX = sign(G.stage.cx - F.x); this.holdUp = true; }
      else this.moveX = 0;
    } else if (this.level === 'dummy') {
      this.moveX = 0;
    } else if (T) {
      this.continueCombo(G, T);
      if (--this.thinkT <= 0) {
        this.thinkT = this.p.think + this.rng.int(0, 4);
        this.decide(G, T);
      }
      this.avoidEdges(G, T);
      this.dodgeProjectiles(G);
    } else this.moveX = 0;

    if (this.dirHold && this.dirHold.t > 0) {
      this.dirHold.t--;
      if (this.dirHold.dir === 'up') this.holdUp = true; else this.holdDown = true;
    }
    // aplica las entradas mantenidas
    c.held.left = this.moveX < 0; c.held.right = this.moveX > 0;
    c.held.up = this.holdUp; c.held.down = this.holdDown;
    for (const a of ['jump', 'light', 'heavy', 'skill1', 'skill2', 'dash']) {
      c.held[a] = (this.holds[a] || 0) > 0;
      if (this.holds[a] > 0) this.holds[a]--;
    }
    if (this.downTapT > 0) {
      this.downTapT--;
      if (this.downTapT === 6 || this.downTapT === 1) { c.pressed.down = true; c.held.down = true; }
    }
  }

  // ── volver al escenario ──
  recoveryTarget(G) {
    const F = this.F;
    let best = null, bestScore = Infinity;
    for (const p of G.stage.plats) {
      const ex = clamp(F.x, p.x + 30, p.x + p.w - 30);
      const dx = Math.abs(ex - F.x);
      const climb = Math.max(0, F.y - p.y + 30);
      // debajo de una plataforma gruesa: hay que rodearla
      const under = F.x > p.x - 8 && F.x < p.x + p.w + 8 && F.y > p.y + 4;
      const around = under ? Math.min(F.x - p.x, p.x + p.w - F.x) + 40 : 0;
      const score = dx + around + climb * 1.7 + (p.oneWay ? 50 : 0) + (p.w < 250 ? 40 : 0);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  recover(G) {
    const F = this.F, p = this.recoveryTarget(G);
    if (!p) return;
    const under = F.x > p.x - 8 && F.x < p.x + p.w + 8 && F.y > p.y + 4 && !p.oneWay;
    let goalX = clamp(F.x, p.x + 40, p.x + p.w - 40);
    if (under) goalX = F.x - p.x < p.x + p.w - F.x ? p.x - 50 : p.x + p.w + 50;   // salir por el lado
    const dir = sign(goalX - F.x) || sign(G.stage.cx - F.x) || 1;
    this.moveX = dir;
    const farX = Math.abs(goalX - F.x);
    const belowTop = F.y > p.y - 30;
    if (F.state === 'wall') { this.press('jump', 10, true); return; }
    if (F.state === 'attack' || F.state === 'dash') return;
    if (under && F.y < p.y + p.h + 220) return;          // primero rodear
    const falling = F.vy > -1.5;
    if (!falling) return;
    if (!belowTop && farX < 120) return;                  // ya llega planeando
    if (F.jumpsLeft > 0) { this.press('jump', 14, true); return; }
    if (this.giveUp) return;            // error humano: se le olvida la esquiva y las habilidades
    // esquiva aérea en diagonal hacia arriba
    if (!F.airDashUsed && F.cd.dash === 0 && (belowTop || farX > 180)) {
      this.holdUp = belowTop; this.press('dash', 1, true); return;
    }
    // habilidades de recuperación
    const id = F.char.id, cd = F.cd;
    if (id === 'valk' && cd.skill2 === 0 && farX < 300 && F.y < p.y + 110) { this.press('skill2', 1, true); return; }
    if ((id === 'kaze' || id === 'toro') && cd.skill1 === 0 && F.y < p.y + 70 && farX > 30) { this.press('skill1', 1, true); return; }
    if (id === 'sombra' && cd.skill2 === 0 && this.target && this.target.onGround) { this.press('skill2', 1, true); return; }
    if (id === 'bala' && cd.skill2 === 0) {
      // la escopeta disparada hacia fuera la empuja hacia el escenario
      this.moveX = -dir; this.press('skill2', 1, true); return;
    }
  }

  continueCombo(G, T) {
    const F = this.F;
    // persecución aérea: si el rival está aturdido cerca, golpea en el aire
    if (!F.onGround && F.state === 'air' && T.inHitstun && this.airT <= 0) {
      const dx = T.x - F.x, dy = (T.y - 40) - (F.y - 40);
      this.moveX = sign(dx);
      if (Math.abs(dx) < 75 && Math.abs(dy) < 70 && this.rng.next() < this.p.combo) {
        if (dy > 40) this.holdDown = true;
        this.press(dy > 40 ? 'heavy' : 'light');
        this.airT = 10;
      }
    }
    if (this.airT > 0) this.airT--;
    if (F.state !== 'attack' || !F.atk || !F.atk.hasHit) return;
    const key = F.atk.name + ':' + F.chainCount;
    if (this.comboDone === key) return;
    this.comboDone = key;
    if (this.rng.next() > this.p.combo) return;
    const route = (BOT_ROUTES[F.char.id] || {})[F.atk.name] || (F.atk.name === 'L1' ? ['light'] : null);
    if (!route) return;
    this.moveX = 0;
    for (const opt of route) {
      const [dir, btn] = opt.includes('+') ? opt.split('+') : [null, opt];
      if ((btn === 'skill1' || btn === 'skill2') && (F.cd[btn] > 0 || this.rng.next() > this.p.skill + 0.25)) continue;
      if (btn === 'dash' && F.cd.dash > 0) continue;
      if (dir) this.dirHold = { dir, t: 12 };     // mantiene la dirección hasta que salga el golpe
      let ok;
      if (btn === 'jump') { ok = this.press('jump', 12); this.moveX = sign(T.x - F.x); this.airT = 4; }
      else if (btn === 'dash') { this.moveX = sign(T.x - F.x); ok = this.press('dash'); }
      else ok = this.press(btn);
      if (!ok) { this.dirHold = null; continue; }
      return;
    }
  }

  decide(G, T) {
    const F = this.F, p = this.p, s = this.style;
    const dx = T.x - F.x, dy = T.y - F.y, adx = Math.abs(dx);
    const toward = sign(dx) || F.facing;
    this.moveX = 0;

    // reacción al ataque del rival
    if (T.state === 'attack' && T.atk && T.atk.firstHit != null && T.atkTime < T.atk.firstHit && adx < 160 && this.rng.next() < p.dodge) {
      if (F.cd.dash === 0 && this.rng.next() < 0.6 && this.groundBelow(F.x - toward * 120, F.y - 40)) { this.moveX = -toward; this.press('dash'); }
      else if (F.onGround) this.press('jump', 12);
      return;
    }
    if (F.state === 'attack') return;
    if (this.rng.next() > p.aggr && adx < 300) {
      // a veces espera o se recoloca
      if (this.rng.next() < 0.4) this.moveX = this.rng.next() < 0.5 ? -toward : 0;
      return;
    }

    const range = s.range + p.slop * this.rng.range(-1, 1);
    const tAbove = dy < -80, tBelow = dy > 80;
    // las acciones de ataque se orientan hacia el rival
    const face = () => { if (F.onGround) F.facing = toward; };

    // zonificadores: disparan desde lejos
    if (s.zoner && Math.abs(dy) < 70 && adx > 140 && adx < 700) {
      if (F.cd.skill1 === 0 && this.rng.next() < p.skill + 0.2) { this.moveX = toward; face(); if (this.press('skill1')) return; }
    }
    // Volta: rayo sobre el rival
    if (F.char.id === 'volta' && F.cd.skill2 === 0 && adx > 120 && this.rng.next() < p.skill * 0.5) { if (this.press('skill2')) return; }

    if (adx > range + 30 || (tAbove && adx > 60) || (tBelow && adx > 60)) {
      // acercarse
      this.moveX = toward;
      if (F.onGround) {
        if (tAbove && adx < 220) this.press('jump', 14);
        else if (tBelow && F.groundPlat && F.groundPlat.oneWay) this.downTapT = 8;
        else if (adx > 420 && F.cd.dash === 0 && this.rng.next() < 0.15 && this.groundBelow(F.x + toward * 200, F.y - 40)) this.press('dash');
        else if (!s.zoner && adx > 500 && this.rng.next() < 0.3 && F.cd.skill1 === 0 && ['kaze', 'toro'].includes(F.char.id) && Math.abs(dy) < 40) { face(); this.press('skill1'); }
      } else if (tAbove && F.jumpsLeft > 0 && F.vy > -2) this.press('jump', 10);
      if (s.zoner && adx < range * 0.6) this.moveX = -toward;
      return;
    }
    // en rango: atacar
    this.moveX = toward;
    const r = this.rng.next();
    if (!F.onGround) {
      if (tBelow || dy > 30) { this.holdDown = true; if (!this.press('heavy')) { this.holdDown = false; this.press('light'); } }
      else if (tAbove) { this.holdUp = true; this.press('heavy'); }
      else this.press(r < 0.6 ? 'light' : 'heavy');
      return;
    }
    face();
    if (tAbove || (dy < -40 && adx < 70)) {
      if (r < 0.55) { this.holdUp = true; this.press('heavy'); } else this.press('jump', 12);
      return;
    }
    let ok = false;
    if (r < 0.48) ok = this.press('light');
    else if (r < 0.62) ok = this.press('heavy');
    else if (r < 0.72 && T.onGround) { this.holdDown = true; ok = this.press('heavy'); if (!ok) this.holdDown = false; }
    else if (r < 0.84 && F.cd.skill2 === 0 && this.rng.next() < p.skill) ok = this.press('skill2');
    else if (r < 0.92 && F.cd.skill1 === 0 && this.rng.next() < p.skill) ok = this.press('skill1');
    if (!ok) this.press('light');
    if (s.zoner && r > 0.7 && F.cd.dash === 0 && this.groundBelow(F.x - toward * 200, F.y - 40)) { this.moveX = -toward; this.press('dash'); }
  }

  avoidEdges(G, T) {
    const F = this.F;
    if (!F.onGround || !F.groundPlat || this.moveX === 0) return;
    const p = F.groundPlat;
    const ahead = F.x + this.moveX * 46;
    if (this.groundBelow(ahead, F.y - 4)) return;                 // hay suelo delante
    // ¿hay otra plataforma alcanzable de un salto en esa dirección?
    let land = null;
    for (const q of G.stage.plats) {
      if (q === p) continue;
      const gap = this.moveX > 0 ? q.x - (p.x + p.w) : p.x - (q.x + q.w);
      if (gap > -10 && gap < 230 && q.y > F.y - 150 && q.y < F.y + 260) { land = q; break; }
    }
    const tBeyond = this.moveX > 0 ? T.x > p.x + p.w : T.x < p.x;
    if (land && tBeyond && T.y < F.y + 300) { this.press('jump', 16); return; }   // cruza el hueco saltando
    if (p.oneWay && T.y > F.y + 40) return;                       // bajar de una plataforma fina está bien
    this.moveX = 0;
  }

  dodgeProjectiles(G) {
    const F = this.F;
    if (this.rng.next() > this.p.dodge * 0.25) return;
    for (const pr of G.projectiles) {
      if (pr.owner === F || pr.owner.team === F.team) continue;
      const dx = F.x - pr.x;
      if (Math.abs(dx) < 240 && sign(dx) === sign(pr.vx) && Math.abs(F.y - 50 - pr.y) < 70) {
        if (F.onGround) this.press('jump', 10);
        else if (F.cd.dash === 0 && this.groundBelow(F.x, F.y)) { this.holdUp = true; this.press('dash'); }
        return;
      }
    }
  }
}

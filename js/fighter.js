'use strict';
// ─────────────────────────────────────────────────────────────
//  Luchador: física, máquina de estados, ataques y animación.
// ─────────────────────────────────────────────────────────────

const PHYS = {
  grav: 0.8, maxFall: 13.5, fastFall: 19, groundAccel: 1.5, groundFric: 1.15, airAccel: 0.72,
  coyote: 6, buf: 9, jumpsquat: 4, dashLen: 11, dashCd: 34, tumbleKB: 12.5,
};
const TIER = { L1: 1, L2: 1, L3: 1, airLight: 1, sideHeavy: 2, upHeavy: 2, downHeavy: 2, airHeavy: 2, airDown: 2, skill1: 3, skill2: 3, counterStrike: 4 };
const ACTION_KEYS = ['light', 'heavy', 'skill1', 'skill2', 'jump', 'dash', 'down'];

// Estela de extremidad (puños, patadas, dagas): curva suavizada
class LimbTrail {
  constructor() { this.pts = []; }
  push(x, y) { this.pts.push({ x, y, age: 0 }); if (this.pts.length > 8) this.pts.shift(); }
  age() { for (const p of this.pts) p.age++; while (this.pts.length && this.pts[0].age > 5) this.pts.shift(); }
  clear() { this.pts.length = 0; }
  draw(ctx, color, s, head) {
    let P = this.pts;
    if (head && P.length && P[P.length - 1].age === 0) P = P.slice(0, -1).concat([{ x: head.x, y: head.y, age: 0 }]);
    if (P.length < 2) return;
    // Catmull-Rom
    const S = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 1; k <= 4; k++) {
        const t = k / 4, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        S.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), age: lerp(p1.age, p2.age, t) });
      }
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const N = S.length;
    for (let i = 1; i < N; i++) {
      const t = i / (N - 1), fade = clamp(1 - S[i].age / 6, 0, 1);
      ctx.strokeStyle = rgba(color, 0.5 * t * fade);
      ctx.lineWidth = (3 + 13 * t) * s;
      ctx.beginPath(); ctx.moveTo(S[i - 1].x, S[i - 1].y); ctx.lineTo(S[i].x, S[i].y); ctx.stroke();
    }
    for (let i = 1; i < N; i++) {
      const t = i / (N - 1), fade = clamp(1 - S[i].age / 6, 0, 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * t * fade})`; ctx.lineWidth = (1 + 2 * t) * s;
      ctx.beginPath(); ctx.moveTo(S[i - 1].x, S[i - 1].y); ctx.lineTo(S[i].x, S[i].y); ctx.stroke();
    }
    ctx.restore();
  }
}

class Fighter {
  constructor(cfg) {
    this.id = cfg.id;
    this.slot = cfg.slot;
    this.char = cfg.char;
    this.ctrl = cfg.ctrl;
    this.team = cfg.team == null ? cfg.id : cfg.team;
    this.name = cfg.name || this.char.name;
    this.tag = cfg.tag || ('J' + (cfg.slot + 1));
    this.tagColor = cfg.tagColor || '#ffffff';
    this.bot = cfg.bot || null;
    this.color = cfg.color || this.char.color;
    this.shade = cfg.shade || this.char.shade;
    this.dummy = !!cfg.dummy;
    this.rng = cfg.rng || VISUAL_RNG;     // aleatoriedad que afecta a la lógica
    this.ragPrev = makeJoints();
    this.s = this.char.stats.scale;
    this.w = 26 * this.s;
    this.h = 88 * this.s;
    this.maxHp = this.char.stats.hp;
    this.pose = new PoseSpring(this.char.stance);
    this.target = makePose(this.char.stance);
    this.J = makeJoints(); this.Jprev = makeJoints(); this.JR = makeJoints();
    this.chains = (this.char.cloth || []).map((c) => Object.assign(new Chain(c.n, c.seg, c), { spec: c }));
    this.wTrail = new Trail(6);
    this.lTrail = new LimbTrail();
    this.ghosts = [];
    this.wins = 0;
    this.stats = { dmgDealt: 0, maxCombo: 0, kos: 0 };
  }

  reset(x, y, facing) {
    this.x = x; this.y = y; this.prevX = x; this.vx = 0; this.vy = 0;
    this.facing = facing; this.fv = facing;   // fv: orientación visual (giro animado)
    this.hp = this.maxHp; this.ghostHp = this.maxHp; this.ghostDelay = 0;
    this.alive = true; this.rag = null;
    this.state = 'air'; this.stateTime = 0;
    this.onGround = false; this.groundPlat = null; this.coyote = 0; this.dropT = 0;
    this.jumpsLeft = this.char.stats.jumps - 1; this.airDashUsed = false; this.wallJumps = 0; this.wallDir = 0;
    this.fastFall = false; this.jumpCut = false; this.flipT = 0;
    this.atk = null; this.atkTime = 0; this.atkState = {}; this.hitGroups = {}; this.chainCount = 0;
    this.hitstop = 0; this.hitstun = 0; this.pendingKB = null; this.spin = 0; this.bounces = 0;
    this.invuln = 0; this.armorT = 0; this.hidden = 0; this.flash = 0; this.hideWeapon = 0; this.ghostTrail = 0; this.flashGlint = 0;
    this.cd = { skill1: 0, skill2: 0, dash: 0 };
    this.buf = {}; for (const a of ACTION_KEYS) this.buf[a] = 99;
    this.lastDownTap = 99;
    this.comboHits = 0; this.comboDmg = 0; this.comboIdle = 0; this.lastAttacker = null;
    this.ground = 0; this.runPhase = 0; this.idleT = this.rng.int(0, 100); this.hurtVar = 0;
    this.legOverride = null; this.crouching = false; this.shakeT = 0; this.victim = false;
    this.noInterp = true;
    this.pose.snap(this.char.stancePose);
    this.ghosts.length = 0;
    this.wTrail.clear(); this.lTrail.clear();
    this.chains.forEach((c) => (c.init = false));
    this.computeJoints();
    copyJoints(this.Jprev, this.J);
  }

  get rx() { return this.alive ? this.JR.hip.x : this.rag ? this.rag.x : this.x; }
  get ry() { return this.alive ? this.y : this.rag ? this.rag.y : this.y; }
  get stats_() { return this.char.stats; }

  // ── utilidades para los scripts de movimientos ──
  at(n) { return this.atk && this.atkTime === Math.max(1, Math.round(n * this.atk.speed)); }
  endAttackSoon(n) { if (this.atk) this.atkTime = Math.max(this.atkTime, this.atk.len - n); }
  legCycle(ph) { this.legOverride = ph; }
  muzzle(big) {
    const J = this.J;
    FX.hitFlash(J.wTip.x + this.facing * 8, J.wTip.y, '#ffd23f', big ? 0.7 : 0.55);
    FX.sparks(J.wTip.x, J.wTip.y, this.facing, 0, '#ffd23f', 4, 0.8);
    Sfx.play('shoot');
  }
  teleport(x, y, G) {
    this.x = x; this.y = y;
    const p = G.stage.solidAt(x, y - 10);
    if (p) this.y = p.y;
    this.vx = 0; this.vy = 0; this.noInterp = true;
    this.chains.forEach((c) => (c.init = false));
  }

  bufHas(a, win = PHYS.buf) { return this.buf[a] <= win; }
  consume(a) { this.buf[a] = 99; }

  hurtbox() {
    const J = this.J, s = this.s;
    if (this.state === 'down') return { x: this.x - 30 * s, y: this.y - 24 * s, w: 60 * s, h: 24 * s };
    let x0 = J.head.x, x1 = J.head.x, y0 = J.head.y - 10 * s, y1 = this.y;
    for (const n of ['neck', 'hip', 'knF', 'knB', 'ftF', 'ftB', 'elF', 'elB']) {
      const q = J[n];
      if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
    }
    // siempre incluye una columna alrededor del tronco (estable aunque se incline)
    x0 = Math.min(x0 - 4 * s, this.x - 14 * s); x1 = Math.max(x1 + 4 * s, this.x + 14 * s);
    return { x: x0, y: y0 - 4, w: x1 - x0, h: y1 - y0 + 6 };
  }
  get invulnerable() { return this.invuln > 0 || this.hidden > 0 || !this.alive || this.state === 'getup'; }
  get armored() { return this.armorT > 0; }
  get inHitstun() { return this.state === 'hurt' || this.state === 'tumble' || (this.state === 'down' && this.stateTime < 10); }
  get acting() { return this.state === 'attack'; }

  setState(s) { this.state = s; this.stateTime = 0; }

  // ═══════════════════════ UPDATE ═══════════════════════
  update(G) {
    if (!this.alive) {
      if (this.rag) {
        copyJoints(this.ragPrev, this.rag.joints());
        this.rag.update(G.stage.plats);
        const J = this.rag.joints();
        this.updateChains(J, (this.rag.p.hip.x - this.rag.p.hip.px) * -0.2);
      }
      return;
    }
    // entrada
    const c = this.ctrl;
    for (const a of ACTION_KEYS) {
      if (c.pressed[a]) this.buf[a] = 0;
      else if (this.hitstop === 0 && this.buf[a] < 99) this.buf[a]++;
    }
    if (c.pressed.down) { this.downDouble = this.lastDownTap < 14; this.lastDownTap = 0; } else { this.lastDownTap++; this.downDouble = false; }

    if (this.hitstop > 0) {
      this.hitstop--;
      copyJoints(this.Jprev, this.J);
      if (this.hitstop === 0 && this.pendingFollow) { this.vx = this.pendingFollow; this.pendingFollow = 0; }
      if (this.hitstop === 0 && this.pendingKB) {
        this.vx = this.pendingKB.kx; this.vy = this.pendingKB.ky; this.pendingKB = null;
        if (this.vy < -1) this.onGround = false;
      }
      return;
    }

    // temporizadores
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k]--;
    if (this.invuln > 0) this.invuln--;
    if (this.hidden > 0) this.hidden--;
    if (this.flash > 0) this.flash--;
    if (this.hideWeapon > 0) this.hideWeapon--;
    if (this.ghostTrail > 0) this.ghostTrail--;
    if (this.flashGlint > 0) this.flashGlint--;
    if (this.dropT > 0) this.dropT--;
    if (this.coyote > 0) this.coyote--;
    if (this.flipT > 0) this.flipT--;
    if (this.ghostDelay > 0) this.ghostDelay--; else this.ghostHp = approach(this.ghostHp, this.hp, 0.6);
    this.armorT = 0;
    this.stateTime++;
    this.idleT++;

    // combo del que recibe: se reinicia cuando escapa
    if (!this.inHitstun) { this.comboIdle++; if (this.comboIdle > 4) { this.comboHits = 0; this.comboDmg = 0; } }
    else this.comboIdle = 0;

    if (this.dummy && this.comboIdle > 90 && this.hp < this.maxHp) { this.hp = this.maxHp; this.ghostHp = this.maxHp; }

    this.crouching = false;
    this.legOverride = null;

    switch (this.state) {
      case 'ground': this.stGround(G); break;
      case 'jumpsquat': this.stJumpsquat(G); break;
      case 'air': this.stAir(G); break;
      case 'land': this.stLand(G); break;
      case 'wall': this.stWall(G); break;
      case 'dash': this.stDash(G); break;
      case 'attack': this.stAttack(G); break;
      case 'hurt': this.stHurt(G); break;
      case 'tumble': this.stTumble(G); break;
      case 'down': this.stDown(G); break;
      case 'getup': this.stGetup(G); break;
    }
    if (!this.alive) return;
    this.physics(G);
    this.animate(G);
  }

  // ── acciones neutrales ──
  tryAttack(G) {
    const c = this.ctrl;
    const order = ['skill1', 'skill2', 'heavy', 'light'];
    for (const k of order) {
      if (!this.bufHas(k)) continue;
      if ((k === 'skill1' || k === 'skill2') && this.cd[k] > 0) continue;
      const name = this.moveFor(k);
      const m = this.char.compiled[name];
      if (!m) continue;
      if (!this.onGround && !m.air && !name.startsWith('air')) continue;
      this.consume(k);
      if (c.x !== 0) this.facing = sign(c.x);
      this.startAttack(name, G);
      return true;
    }
    return false;
  }
  moveFor(kind) {
    const c = this.ctrl, up = c.held.up && !c.held.down, down = c.held.down;
    if (kind === 'light') return this.onGround ? 'L1' : 'airLight';
    if (kind === 'heavy') {
      if (up) return 'upHeavy';
      if (this.onGround) return down ? 'downHeavy' : 'sideHeavy';
      return down ? 'airDown' : 'airHeavy';
    }
    return kind;
  }
  tryDash(G) {
    if (!this.bufHas('dash') || this.cd.dash > 0) return false;
    if (!this.onGround && this.airDashUsed) return false;
    this.consume('dash');
    this.startDash(G);
    return true;
  }
  tryJump(G) {
    if (!this.bufHas('jump')) return false;
    if (this.onGround || this.coyote > 0) {
      this.consume('jump');
      this.setState('jumpsquat');
      return true;
    }
    if (this.wallDir !== 0 && this.wallJumps < 4) { this.consume('jump'); this.doJump('wall', G); return true; }
    if (this.jumpsLeft > 0) { this.consume('jump'); this.doJump('air', G); return true; }
    return false;
  }
  tryDrop() {
    if (!this.onGround || !this.groundPlat || !this.groundPlat.oneWay) return false;
    const c = this.ctrl;
    if (this.downDouble || (c.held.down && this.bufHas('jump', 2))) {
      if (c.held.down && this.bufHas('jump', 2)) this.consume('jump');
      this.dropT = 12; this.y += 2; this.onGround = false; this.groundPlat = null; this.coyote = 0;
      this.setState('air');
      return true;
    }
    return false;
  }
  neutralActions(G) {
    if (this.tryDrop()) return true;
    if (this.tryAttack(G)) return true;
    if (this.tryJump(G)) return true;
    if (this.tryDash(G)) return true;
    return false;
  }

  doJump(kind, G) {
    const st = this.char.stats, c = this.ctrl;
    if (kind === 'ground') {
      const full = c.held.jump;
      this.vy = -(full ? st.jump : st.jump * 0.68);
      this.vx += c.x * 1.2;
      this.onGround = false; this.coyote = 0;
      this.jumpsLeft = st.jumps - 1; this.jumpCut = !full;
      Sfx.play('jump');
      FX.landDust(this.x, this.y, 0.5);
      this.pose.vel.sq += 0.06;
    } else if (kind === 'air') {
      this.jumpsLeft--;
      this.vy = -st.djump;
      this.vx = c.x * st.run * 0.95;
      this.flipT = 20; this.jumpCut = true; this.fastFall = false;
      Sfx.play('djump');
      FX.ring(this.x, this.y - 6, this.color, 36, 12, 3);
      FX.dust(this.x, this.y, 3, 0.6);
    } else if (kind === 'wall') {
      this.wallJumps++;
      this.vy = -st.djump * 1.0;
      this.vx = -this.wallDir * 6.5;
      // rebotar en una pared devuelve un salto en el aire: se puede trepar y coronar
      if (this.wallJumps <= 2) this.jumpsLeft = Math.max(this.jumpsLeft, 1);
      this.facing = -this.wallDir;
      this.flipT = 16; this.jumpCut = true; this.fastFall = false;
      Sfx.play('jump');
      FX.dust(this.x + this.wallDir * 12, this.y - 40, 5, 0.8, -this.wallDir);
    }
    this.setState('air');
  }

  startDash(G) {
    const c = this.ctrl;
    let dx = c.x, dy = this.onGround ? 0 : c.y;
    if (!dx && !dy) dx = this.facing;
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    if (dx) this.facing = sign(dx);
    this.dashDir = { dx, dy };
    this.setState('dash');
    this.cd.dash = PHYS.dashCd;
    this.invuln = 8;
    if (!this.onGround) this.airDashUsed = true;
    this.fastFall = false;
    const type = this.char.dashType || 'slide';
    if (type === 'blink') {
      FX.sparks(this.x, this.y - 45, 0, -1, this.color, 8, 0.6);
      FX.ring(this.x, this.y - 45, this.color, 40, 10, 3);
      let tx = this.x + dx * 175, ty = this.y + dy * 150;
      // no aparecer dentro de un bloque
      for (let i = 0; i < 10 && G.stage.solidAt(tx, ty - 20); i++) { tx -= dx * 17; ty -= dy * 15; }
      this.ghostAt();
      this.x = tx; this.y = ty; this.noInterp = true; this.hidden = 3;
      this.vx = dx * 4; this.vy = dy * 2;
      Sfx.play('blink');
      FX.sparks(this.x, this.y - 45, 0, -1, this.color, 10, 0.7);
      this.chains.forEach((ch) => (ch.init = false));
    } else {
      Sfx.play('dash');
      if (this.onGround) FX.dust(this.x, this.y, 5, 1, -dx);
    }
  }

  startAttack(name, G) {
    const m = this.char.compiled[name];
    this.chainCount = this.state === 'attack' ? this.chainCount + 1 : 0;
    // instancia propia: varios luchadores pueden compartir personaje
    this.atk = Object.create(m); this.atkTime = 0; this.atkState = {}; this.hitGroups = {};
    this.atk.hasHit = false; this.atkHitAt = -1;
    if (name === 'skill1' || name === 'skill2') {
      const sk = this.char.skills.find((s) => s.key === name);
      this.cd[name] = sk ? sk.cd : 120;
    }
    this.setState('attack');
    this.pose.unwrap(this.target);
    this.fastFall = false;
    this.wTrail.cut(); this.lTrail.clear(); this.trailJoint = null;
  }
  endAttack() {
    this.atk = null;
    this.setState(this.onGround ? 'ground' : 'air');
    this.pose.unwrap(this.char.stancePose);
  }

  // ═══════════════════ ESTADOS ═══════════════════
  stGround(G) {
    const c = this.ctrl, st = this.char.stats;
    if (this.neutralActions(G)) return;
    this.crouching = c.held.down && c.x === 0;
    const target = this.crouching ? 0 : c.x * st.run;
    if (c.x !== 0) {
      const turning = sign(this.vx) !== 0 && sign(this.vx) !== sign(c.x);
      this.vx = approach(this.vx, target, PHYS.groundAccel * (turning ? 1.7 : 1));
      this.facing = sign(c.x);
      if (turning && Math.abs(this.vx) > 3.5 && this.stateTime % 3 === 0) FX.dust(this.x, this.y, 1, 0.6, -this.facing);
    } else {
      this.vx = approach(this.vx, 0, PHYS.groundFric);
    }
  }

  stJumpsquat(G) {
    const c = this.ctrl;
    // arriba + fuerte durante el impulso = ataque hacia arriba sin saltar
    if (this.bufHas('heavy') && c.held.up) { this.consume('heavy'); this.startAttack('upHeavy', G); return; }
    if (this.bufHas('skill1') && this.cd.skill1 === 0) { this.consume('skill1'); this.startAttack('skill1', G); return; }
    if (this.bufHas('skill2') && this.cd.skill2 === 0) { this.consume('skill2'); this.startAttack('skill2', G); return; }
    this.vx *= 0.9;
    if (c.x !== 0) this.facing = sign(c.x);
    if (this.stateTime >= PHYS.jumpsquat) this.doJump('ground', G);
  }

  stAir(G) {
    const c = this.ctrl, st = this.char.stats;
    if (this.neutralActions(G)) return;
    this.airControl();
    // salto variable: soltar el botón corta la subida
    if (!this.jumpCut && !c.held.jump && this.vy < -5) { this.vy *= 0.55; this.jumpCut = true; }
    // caída rápida
    if (c.pressed.down && this.vy > -3 && !this.fastFall) {
      this.fastFall = true; this.vy = Math.max(this.vy, PHYS.fastFall * 0.75);
      FX.speedLine(this.x, this.y - 90, 0, -6, 'rgba(255,255,255,0.8)');
    }
    // deslizarse por la pared
    if (this.wallDir !== 0 && c.x === this.wallDir && this.vy > 0 && this.wallJumps < 4) {
      this.setState('wall');
    }
  }
  airControl() {
    const c = this.ctrl, st = this.char.stats;
    if (c.x !== 0) {
      this.vx = approach(this.vx, c.x * st.run * 0.95, PHYS.airAccel);
      this.facing = sign(c.x);
    } else this.vx = approach(this.vx, 0, 0.12);
  }

  stLand(G) {
    this.vx = approach(this.vx, 0, PHYS.groundFric * 1.2);
    if (this.stateTime >= this.landLag) { this.setState('ground'); this.stGround(G); }
  }

  stWall(G) {
    const c = this.ctrl;
    this.facing = -this.wallDir;
    if (this.vy > 3.2) this.vy = 3.2;
    if (this.stateTime % 5 === 0) FX.dust(this.x + this.wallDir * 13, this.y - 70, 1, 0.3);
    if (this.bufHas('jump')) { this.consume('jump'); this.doJump('wall', G); return; }
    if (this.tryAttack(G)) return;
    if (this.tryDash(G)) return;
    if (this.wallDir === 0 || c.x !== this.wallDir) this.setState('air');
  }

  stDash(G) {
    const t = this.stateTime, L = PHYS.dashLen, d = this.dashDir;
    const type = this.char.dashType || 'slide';
    if (type === 'blink') {
      this.vx *= 0.8; this.vy = Math.min(this.vy, 2);
      if (t >= 7) { this.setState(this.onGround ? 'ground' : 'air'); return; }
    } else {
      const u = t / L;
      const v = 17 * Math.pow(1 - u, 1.4) + 2;
      this.vx = d.dx * v;
      if (!this.onGround) this.vy = d.dy * v;
      if (t % 2 === 0) this.ghostAt();
      if (this.onGround && t % 3 === 0) FX.dust(this.x, this.y, 1, 0.5, -d.dx);
      if (t >= L) {
        this.vx *= 0.55; if (!this.onGround) this.vy *= 0.4;
        this.setState(this.onGround ? 'ground' : 'air');
        return;
      }
    }
    // dash → ataque o salto (muy fluido)
    if (t >= 3) {
      if (this.tryAttack(G)) return;
      if (this.tryJump(G)) return;
    }
  }

  stAttack(G) {
    const m = this.atk;
    this.atkTime++;
    const t = this.atkTime;
    for (const mv of m.moves) if (mv.f === t) {
      if (mv.mulX != null) this.vx *= mv.mulX;
      if (mv.vx != null) this.vx = mv.vx * this.facing;
      if (mv.vy != null) this.vy = mv.vy;
    }
    if (m.swish && t === m.swish[0]) Sfx.play(m.swish[2], m.swish[1]);
    if (m.armor && t >= m.armor[0] && t <= m.armor[1]) this.armorT = 1;
    if (m.invuln && t >= m.invuln[0] && t <= m.invuln[1]) this.invuln = Math.max(this.invuln, 1);
    if (this.onGround) this.vx = approach(this.vx, 0, 0.7);
    else if (!(m.noGrav && t >= m.noGrav[0] && t <= m.noGrav[1])) this.airControlWeak();

    if (m.tick) m.tick(this, t / m.speed, G);
    if (this.state !== 'attack' || this.atk !== m) return;

    // ── cancelaciones ──
    const hit = m.hasHit && t > this.atkHitAt;
    // la cadena ligera no puede saltarse los fotogramas activos del golpe actual
    const chainOk = m.next && m.chainFrom != null && t >= m.chainFrom && (m.hasHit || m.lastHit == null || t > m.lastHit);
    if (chainOk && this.bufHas('light')) {
      this.consume('light'); this.startAttack(m.next, G); return;
    }
    if (hit && this.chainCount < 6) {
      const myTier = TIER[m.name] || 0;
      for (const k of ['skill1', 'skill2', 'heavy']) {
        if (!this.bufHas(k)) continue;
        if ((k === 'skill1' || k === 'skill2') && this.cd[k] > 0) continue;
        const name = this.moveFor(k);
        if (name === m.name || (TIER[name] || 0) < myTier) continue;
        const nm = this.char.compiled[name];
        if (!this.onGround && !nm.air && !name.startsWith('air')) continue;
        this.consume(k);
        if (this.ctrl.x) this.facing = sign(this.ctrl.x);
        this.startAttack(name, G); return;
      }
      if ((m.jumpCancel || !this.onGround) && this.bufHas('jump')) {
        if (this.onGround) { this.consume('jump'); this.atk = null; this.setState('jumpsquat'); this.stateTime = PHYS.jumpsquat - 1; return; }
        if (this.jumpsLeft > 0) { this.consume('jump'); this.atk = null; this.doJump('air', G); return; }
      }
      if (this.cd.dash === 0 && this.bufHas('dash') && (this.onGround || !this.airDashUsed)) {
        this.consume('dash'); this.atk = null; this.startDash(G); return;
      }
    }
    if (t >= m.iasa && t < m.len) {
      if (this.onGround ? this.neutralActions(G) : (this.tryAttack(G) || this.tryJump(G) || this.tryDash(G))) return;
    }
    if (t >= m.len) this.endAttack();
  }
  airControlWeak() {
    const c = this.ctrl, st = this.char.stats;
    if (c.x !== 0) this.vx = approach(this.vx, c.x * st.run * 0.9, PHYS.airAccel * 0.6);
  }

  stHurt(G) {
    this.hitstun--;
    if (this.onGround) this.vx = approach(this.vx, 0, 0.55);
    else this.vx *= 0.985;
    if (this.hitstun <= 0) {
      this.setState(this.onGround ? 'ground' : 'air');
      if (!this.onGround) this.jumpsLeft = Math.max(this.jumpsLeft, 1);
      this.airDashUsed = false;
    }
  }
  stTumble(G) {
    this.hitstun--;
    this.vx *= 0.99;
    this.spin *= 0.985;
    if (this.stateTime % 2 === 0 && Math.hypot(this.vx, this.vy) > 9) FX.speedLine(this.x, this.y - 45, -this.vx * 0.2, -this.vy * 0.2, rgba(this.color, 0.7));
    if (this.hitstun <= 0) {
      this.setState('air');
      this.jumpsLeft = Math.max(this.jumpsLeft, 1);
      this.airDashUsed = false;
    }
  }
  stDown(G) {
    this.vx = approach(this.vx, 0, 0.6);
    if (this.stateTime === 10) this.invuln = Math.max(this.invuln, 40);
    const c = this.ctrl;
    const wantUp = this.stateTime > 14 && (c.pressed.jump || c.pressed.light || c.pressed.heavy || c.pressed.dash || c.pressed.up || c.x !== 0);
    if (this.stateTime >= 40 || wantUp) {
      this.setState('getup'); this.getupLen = 16; this.invuln = 18;
      if (c.x !== 0) { this.vx = sign(c.x) * 7; this.facing = sign(c.x); }
    }
  }
  stGetup(G) {
    this.vx = approach(this.vx, 0, 0.5);
    if (this.stateTime >= this.getupLen) this.setState('ground');
  }

  // ═══════════════════ GOLPES ═══════════════════
  takeHit(kx, ky, stun, tumble) {
    this.atk = null;
    this.setState(tumble ? 'tumble' : 'hurt');
    this.hitstun = stun;
    this.pendingKB = { kx, ky };
    this.vx = 0; this.vy = 0;
    this.fastFall = false; this.bounces = 0;
    this.spin = tumble ? sign(kx || 1) * clamp(Math.hypot(kx, ky) * 1.6, 12, 34) : 0;
    this.hurtVar = this.rng.range(-1, 1);
    this.flash = 3;
    this.pose.unwrap(this.target);
    // sacudida de la pose: se nota el impacto en el cuerpo
    this.pose.vel.t -= 9 * sign(kx * this.facing || 1);
    this.pose.vel.n -= 10;
  }

  die(kx, ky, G, ringout) {
    this.alive = false;
    this.state = 'dead';
    this.hp = 0;
    this.atk = null;
    if (!ringout) {
      this.rag = new Ragdoll(this.J, kx, ky, kx * 0.012 + rand(-0.03, 0.03));
      copyJoints(this.ragPrev, this.rag.joints());
    }
  }

  // ═══════════════════ FÍSICA ═══════════════════
  physics(G) {
    const st = this.char.stats, m = this.atk;
    let g = PHYS.grav * (st.grav || 1);
    if (this.state === 'attack' && m) {
      if (m.grav != null) g *= m.grav;
      if (m.noGrav && this.atkTime >= m.noGrav[0] && this.atkTime <= m.noGrav[1]) g = 0;
    }
    if (this.state === 'hurt' || this.state === 'tumble') g *= 0.82 + Math.min(0.4, this.comboHits * 0.03);
    if (this.state === 'dash' && !this.onGround && (this.char.dashType || 'slide') !== 'blink') g = 0;
    if (this.state === 'wall') g *= 0.5;

    this.vy += g;
    const maxF = this.fastFall ? PHYS.fastFall : PHYS.maxFall;
    if (this.state !== 'tumble' && this.state !== 'hurt' && this.vy > maxF) this.vy = maxF;
    if (this.vy > 26) this.vy = 26;

    // plataforma móvil: nos arrastra
    if (this.onGround && this.groundPlat && (this.groundPlat.dx || this.groundPlat.dy)) {
      this.x += this.groundPlat.dx; this.y += this.groundPlat.dy;
    }

    const plats = G.stage.plats, hw = this.w / 2;
    this.prevX = this.x;
    const prevBottom = this.y;
    const wasGround = this.onGround;

    // eje X
    this.x += this.vx;
    this.wallDir = 0;
    for (const p of plats) {
      if (p.oneWay) continue;
      if (this.y <= p.y + 2 || this.y - this.h >= p.y + p.h) continue;
      if (this.x + hw > p.x && this.x - hw < p.x + p.w) {
        const fromLeft = this.prevX <= p.x + p.w / 2;
        this.x = fromLeft ? p.x - hw : p.x + p.w + hw;
        const wd = fromLeft ? 1 : -1;
        if (this.state === 'tumble' && Math.abs(this.vx) > 8) {
          this.vx = -this.vx * 0.55; G.onWallBounce(this);
        } else if (this.vx * wd > 0) this.vx = 0;
        this.wallDir = wd;
      }
    }
    if (!this.onGround && this.wallDir === 0) {
      // contacto con pared sin solapamiento (para deslizarse)
      for (const p of plats) {
        if (p.oneWay || this.y <= p.y + 20 || this.y - this.h >= p.y + p.h) continue;
        if (Math.abs(this.x + hw - p.x) < 2) this.wallDir = 1;
        else if (Math.abs(this.x - hw - (p.x + p.w)) < 2) this.wallDir = -1;
      }
    }

    // eje Y
    this.y += this.vy;
    this.onGround = false;
    let landPlat = null;
    const passOneWay = this.dropT > 0 || (this.ctrl.held.down && !wasGround && this.state !== 'attack' && this.state !== 'hurt' && this.state !== 'tumble');
    for (const p of plats) {
      if (this.x + hw * 0.55 <= p.x || this.x - hw * 0.55 >= p.x + p.w) continue;
      const top = p.y, prevTop = p.prevY == null ? p.y : p.prevY;
      if (this.vy >= 0 && prevBottom <= Math.max(top, prevTop) + 1 && this.y >= top) {
        if (p.oneWay && passOneWay) continue;
        this.y = top; landPlat = p;
      } else if (!p.oneWay && this.vy < 0 && this.y - this.h < p.y + p.h && prevBottom - this.h >= p.y + p.h - 1 && this.x > p.x && this.x < p.x + p.w) {
        this.y = p.y + p.h + this.h; this.vy = 0;
      }
    }
    if (landPlat) {
      this.onGround = true; this.groundPlat = landPlat;
      const impact = this.vy;
      this.vy = 0;
      if (!wasGround) this.onLand(impact, G);
    } else {
      this.groundPlat = null;
      if (wasGround) {
        if (this.state === 'ground' || this.state === 'land') { this.setState('air'); this.coyote = PHYS.coyote; this.jumpsLeft = this.char.stats.jumps - 1; }
        if (this.state === 'attack' && this.atk && !this.atk.air && !this.atk.name.startsWith('air')) { /* sigue el ataque */ }
      }
    }
  }

  onLand(vy, G) {
    this.jumpsLeft = this.char.stats.jumps - 1;
    this.airDashUsed = false; this.wallJumps = 0; this.fastFall = false; this.flipT = 0;
    const power = clamp(vy / 14, 0, 1.6);
    if (this.state === 'tumble') {
      if (this.bufHas('dash', 14) || (this.bot && this.bot.wantsTech())) {
        this.consume('dash');
        this.setState('getup'); this.getupLen = 9; this.invuln = 16;
        this.vx = this.ctrl.x * 7;
        FX.text(this.x, this.y - 100, '¡TECH!', '#ffffff', 26, 36);
        FX.ring(this.x, this.y - 40, '#ffffff', 50, 10, 3);
        Sfx.play('tech');
        return;
      }
      if (vy > 7 && this.bounces < 2) {
        this.bounces++;
        this.onGround = false; this.vy = -vy * 0.48; this.vx *= 0.75;
        this.y -= 1;
        FX.landDust(this.x, this.y, power * 1.2); FX.debris(this.x, this.y, '#cfc3b0', 4, power);
        Sfx.play('land', 1.6); G.shake(0.12 + power * 0.1);
        this.hitstun = Math.max(this.hitstun, 12);
        this.pendingBounce = true;
        return;
      }
      this.setState('down');
      FX.landDust(this.x, this.y, power + 0.4);
      Sfx.play('land', 1.2);
      return;
    }
    if (this.state === 'hurt') {
      if (vy > 9) { FX.landDust(this.x, this.y, power); Sfx.play('land', power); }
      return;
    }
    if (this.state === 'attack' && this.atk) {
      const m = this.atk;
      if (m.landLag != null) {
        if (m.name === 'airDown' && !m.hasHit) { FX.landDust(this.x, this.y, 1.2); FX.ring(this.x, this.y, this.color, 46, 10, 3); }
        this.atk = null; this.landLag = m.landLag; this.setState('land');
      }
      FX.landDust(this.x, this.y, power * 0.8);
      return;
    }
    // aterrizaje normal: aplastamiento según la velocidad
    FX.landDust(this.x, this.y, power);
    Sfx.play('land', power);
    this.pose.vel.kf += 6 * power + 2; this.pose.vel.kb += 6 * power + 2; this.pose.vel.sq -= 0.05 * power + 0.02;
    this.pose.vel.t += 4 * power;
    if (this.state === 'dash') return;
    if (vy > 12.5) { this.landLag = 4; this.setState('land'); }
    else if (this.state === 'air' || this.state === 'wall') this.setState('ground');
  }

  ghostAt() {
    const g = { J: copyJoints(makeJoints(), this.J), life: 14, max: 14 };
    this.ghosts.push(g);
    if (this.ghosts.length > 10) this.ghosts.shift();
  }

  // ═══════════════════ ANIMACIÓN ═══════════════════
  animate(G) {
    const tp = this.target, st = this.char.stats, c = this.ctrl;
    copyPose(tp, this.char.stancePose);
    let k = 0.28, d = 0.62;
    let groundTarget = this.onGround ? 1 : 0;

    switch (this.state) {
      case 'ground': case 'land': case 'jumpsquat': {
        const sp = Math.abs(this.vx) / st.run;
        if (this.state === 'jumpsquat' || this.state === 'land') {
          tp.lf = 40; tp.kf = 85; tp.lb = -24; tp.kb = 72; tp.t += 14; tp.sq = 0.92;
          k = 0.55; d = 0.7;
        } else if (this.crouching) {
          tp.lf = 52; tp.kf = 105; tp.lb = -28; tp.kb = 88; tp.t += 18; tp.af += 10; tp.ab += 10; k = 0.4;
        } else if (sp > 0.12) {
          this.runCycle(tp, sp);
          const skid = c.x !== 0 && sign(c.x) !== sign(this.vx) && Math.abs(this.vx) > 2.5;
          if (skid) { tp.t = -12; tp.lf = 42; tp.kf = 14; tp.lb = -26; tp.kb = 40; tp.af += 30; }
        } else {
          // respiración y balanceo sutil
          const b = Math.sin(this.idleT * 0.06);
          tp.t += b * 1.6; tp.kf += b * 3; tp.kb += b * 3;
          tp.af += Math.sin(this.idleT * 0.06 + 0.6) * 3; tp.ab += Math.sin(this.idleT * 0.06 + 1.2) * 3;
          tp.n = Math.sin(this.idleT * 0.03) * 2;
        }
        break;
      }
      case 'air': case 'wall': case 'dash': {
        if (this.state === 'wall') {
          tp.t = -6; tp.lf = 50; tp.kf = 80; tp.lb = -10; tp.kb = 60; tp.ab = -100; tp.eb = 20; tp.n = 10;
          groundTarget = 0; k = 0.35;
          break;
        }
        if (this.state === 'dash') {
          const type = this.char.dashType || 'slide';
          if (type === 'roll') {
            const u = clamp(this.stateTime / PHYS.dashLen, 0, 1);
            tp.rot = 360 * Ease.outQuad(u); tp.lf = 80; tp.kf = 130; tp.lb = 60; tp.kb = 130; tp.t = 30; tp.af = 60; tp.ab = 40;
            k = 0.6; d = 0.75; groundTarget = 0;
          } else {
            tp.t = 34; tp.lf = this.onGround ? 52 : 60; tp.kf = 50; tp.lb = -58; tp.kb = 34; tp.af -= 40; tp.ab -= 50; tp.n = -10;
            k = 0.5; d = 0.7;
          }
          break;
        }
        const rise = clamp(-this.vy / 12, 0, 1), fall = clamp(this.vy / 12, 0, 1);
        tp.lf = lerp(lerp(24, 40, rise), 18, fall); tp.kf = lerp(lerp(40, 75, rise), 22, fall);
        tp.lb = lerp(lerp(-14, -6, rise), -24, fall); tp.kb = lerp(lerp(40, 60, rise), 32, fall);
        tp.t += this.vx * this.facing * 1.1 - fall * 4;
        tp.af += fall * 18; tp.ab += fall * 30 + rise * 20; tp.eb += rise * 20;
        if (this.fastFall) { tp.lf = 6; tp.kf = 10; tp.lb = -8; tp.kb = 12; tp.t -= 6; tp.af += 30; tp.ab += 40; }
        if (this.flipT > 0) {
          const u = 1 - this.flipT / 20;
          tp.rot = 360 * Ease.outCubic(u);
          tp.lf = 70; tp.kf = 120; tp.lb = 40; tp.kb = 120; tp.t = 20;
          k = 0.55; d = 0.7;
        }
        break;
      }
      case 'attack': {
        sampleTrack(this.atk.track, this.atkTime, tp);
        const m = this.atk;
        const active = m.firstHit != null && this.atkTime >= m.firstHit - 1 && this.atkTime <= m.lastHit + 1;
        k = active ? 0.6 : 0.42; d = active ? 0.74 : 0.68;
        if (this.legOverride != null) this.runLegs(tp, 1, this.legOverride);
        if (m.name.startsWith('air') && this.onGround) groundTarget = 1;
        break;
      }
      case 'hurt': {
        const v = this.hurtVar;
        tp.t = -16 - Math.abs(v) * 10; tp.n = -18 + v * 8; tp.hx = -4;
        tp.af = 30 + v * 30; tp.ef = 70; tp.ab = -40 - v * 20; tp.eb = 50;
        tp.lf = this.onGround ? 24 : 30; tp.kf = this.onGround ? 40 : 50; tp.lb = -18; tp.kb = 36;
        k = 0.55; d = 0.6;
        break;
      }
      case 'tumble': {
        const ph = this.idleT * 0.5;
        tp.rot = this.pose.cur.rot + this.spin;
        tp.t = -10; tp.af = 150 + Math.sin(ph) * 30; tp.ef = 30; tp.ab = -140 + Math.cos(ph) * 30; tp.eb = 30;
        tp.lf = 40 + Math.sin(ph * 1.3) * 30; tp.kf = 40; tp.lb = -40 + Math.cos(ph * 1.1) * 30; tp.kb = 50; tp.n = -20;
        k = 0.5; d = 0.6; groundTarget = 0;
        break;
      }
      case 'down': {
        tp.rot = -90; tp.hy = 52; tp.t = 0; tp.n = 10;
        tp.lf = 8; tp.kf = 20; tp.lb = -4; tp.kb = 10; tp.af = 150; tp.ef = 20; tp.ab = -150; tp.eb = 20;
        groundTarget = 0;
        k = 0.22; d = 0.55;
        break;
      }
      case 'getup': {
        const u = this.stateTime / this.getupLen;
        if (u < 0.45) { tp.rot = -50; tp.hy = 30; tp.lf = 70; tp.kf = 120; tp.t = 30; groundTarget = 0; }
        k = 0.35; d = 0.65;
        break;
      }
    }
    // el arma sigue al antebrazo cuando no hay ataque
    if (this.state !== 'attack') {
      const wp = this.char.weapon;
      tp.w = tp.af + tp.ef + (wp.grip || 0) + (this.state === 'dash' ? -30 : 0);
      if (this.state === 'ground' && !this.crouching) tp.w = this.char.stance.w + (tp.af - this.char.stance.af) + (tp.ef - this.char.stance.ef);
    }
    this.ground = approach(this.ground, groundTarget, 0.34);
    // giro de 3 fotogramas al cambiar de dirección (instantáneo al atacar o recibir)
    const snapTurn = this.state === 'attack' || this.state === 'hurt' || this.state === 'tumble' || this.state === 'down' || this.state === 'getup' || this.state === 'dash';
    this.fv = snapTurn ? this.facing : approach(this.fv, this.facing, 0.67);
    this.pose.step(tp, k, d);
    // la rotación del giro no debe acumularse a lo loco fuera de estados que la usan
    if (this.state !== 'tumble' && this.state !== 'attack' && this.flipT === 0 && this.state !== 'dash' && this.state !== 'down' && this.state !== 'getup') {
      if (Math.abs(this.pose.cur.rot) > 180) this.pose.unwrap(tp);
    }
    this.computeJoints();
    this.updateTrails();
    this.updateChains(this.J, -this.vx * 0.12);
    for (let i = this.ghosts.length - 1; i >= 0; i--) if (--this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    if (this.ghostTrail > 0 && this.stateTime % 2 === 0) this.ghostAt();
  }

  runCycle(tp, sp) {
    const prev = this.runPhase;
    this.runPhase += Math.abs(this.vx) * 0.105;
    this.runLegs(tp, clamp(sp, 0, 1.2), this.runPhase);
    // pasos: sonido y polvo al apoyar
    if (Math.floor(prev / Math.PI) !== Math.floor(this.runPhase / Math.PI)) {
      Sfx.play('step');
      if (sp > 0.7 && Math.random() < 0.5) FX.dust(this.x - this.facing * 6, this.y, 1, 0.4, -this.facing);
    }
  }
  runLegs(tp, sp, ph) {
    const A = 18 + 26 * sp;
    tp.lf = 14 * sp + Math.sin(ph) * A;
    tp.lb = 14 * sp + Math.sin(ph + Math.PI) * A;
    tp.kf = 12 + Math.max(0, Math.cos(ph)) * 85 * sp + 6;
    tp.kb = 12 + Math.max(0, Math.cos(ph + Math.PI)) * 85 * sp + 6;
    tp.t = this.char.stance.t * 0.5 + 14 * sp;
    const armF = this.char.weapon.twoHand != null || this.char.weapon.type === 'katana' ? 0.35 : 1;
    tp.af += Math.sin(ph + Math.PI) * 28 * sp * armF;
    tp.ab += Math.sin(ph) * 40 * sp;
    tp.ef += 10 * sp;
    tp.n = -4 * sp;
  }

  computeJoints() {
    copyJoints(this.Jprev, this.J);
    const m = this.atk;
    solveFK(this.pose.cur, {
      x: this.x, y: this.y, f: this.fv, s: this.s, ground: this.ground,
      weapon: this.char.weapon, freeBack: this.state === 'attack' && m && m.freeBack,
    }, this.J);
    if (this.noInterp) { copyJoints(this.Jprev, this.J); this.noInterp = false; }
  }

  // muestra de arma para la estela: mano, ángulo absoluto y largo
  weaponSample(J) {
    const dx = J.wTip.x - J.wBase.x, dy = J.wTip.y - J.wBase.y;
    const wt = this.char.weapon.type;
    return { hx: J.wBase.x, hy: J.wBase.y, ang: Math.atan2(dy, dx), len: Math.hypot(dx, dy) + (wt === 'spear' ? 12 * this.s : 0),
      inner: wt === 'katana' ? 0.3 : wt === 'spear' ? 0.55 : 0.45 };
  }
  updateTrails() {
    const m = this.atk, J = this.J;
    this.wTrail.age(); this.lTrail.age();
    const inWindow = this.state === 'attack' && m && m.trailFrom != null && this.atkTime >= m.trailFrom && this.atkTime <= m.trailTo;
    const wt = this.char.weapon.type;
    const blade = wt === 'katana' || wt === 'staff' || wt === 'spear';
    if (inWindow && blade) {
      const q = this.weaponSample(J);
      this.wTrail.push(q.hx, q.hy, q.ang, q.len, q.inner);
    }
    if (inWindow && !blade) {
      // la extremidad que más se mueve
      let best = null, bd = 9;
      const cands = wt === 'daggers' ? ['wTip', 'w2Tip', 'ftF', 'ftB'] : ['haF', 'haB', 'ftF', 'ftB', 'wTip'];
      for (const n of cands) {
        const d2 = dist(J[n].x, J[n].y, this.Jprev[n].x, this.Jprev[n].y);
        if (d2 > bd) { bd = d2; best = n; }
      }
      if (best && best !== this.trailJoint) { this.lTrail.clear(); this.trailJoint = best; }
      if (this.trailJoint) this.lTrail.push(J[this.trailJoint].x, J[this.trailJoint].y);
    } else if (!inWindow) this.trailJoint = null;
  }

  updateChains(J, wind) {
    for (const ch of this.chains) {
      const sp = ch.spec;
      let a;
      if (sp.anchor === 'neck') a = { x: lerp(J.neck.x, J.head.x, 0.25), y: lerp(J.neck.y, J.head.y, 0.25) };
      else if (sp.anchor === 'hatTip') a = headPoint(J, -4, 17);
      else a = headPoint(J, -8.5, 3);
      ch.update(a.x, a.y, wind, this.s);
    }
  }

  // ═══════════════════ DIBUJO ═══════════════════
  draw(ctx, alpha, G) {
    const look = {
      color: this.color, shade: this.shade, accent: this.char.accent, weapon: this.char.weapon,
      accFront: this.char.accFront, accBack: this.char.accBack, fighter: this,
    };
    if (!this.alive) {
      if (!this.rag) return;
      const J = lerpJoints(this.JR, this.ragPrev, this.rag.joints(), alpha);
      look.alpha = 1;
      for (const ch of this.chains) ch.draw(ctx, ch.spec.color, ch.spec.w0 * this.s, ch.spec.w1 * this.s);
      drawFigure(ctx, J, look);
      return;
    }
    const JR = lerpJoints(this.JR, this.Jprev, this.J, alpha);
    // temblor durante el hitstop del que recibe
    if (this.hitstop > 0 && this.victim) {
      const amp = Math.min(6, this.hitstop * 0.8);
      const ox = (this.hitstop % 2 ? 1 : -1) * amp;
      for (const n of JOINT_NAMES) JR[n].x += ox;
    }
    // fantasmas (dash, cargas)
    for (const g of this.ghosts) {
      drawFigure(ctx, g.J, { color: this.color, shade: this.color, alpha: 0.32 * (g.life / g.max), ghost: true, weapon: null, lw: 5.5 });
    }
    if (this.hidden > 0) return;

    for (const ch of this.chains) ch.draw(ctx, ch.spec.color, ch.spec.w0 * this.s, ch.spec.w1 * this.s);

    // indicador de armadura / contraataque
    if (this.armorT > 0 || (this.state === 'attack' && this.atk && this.atk.armor && this.atkTime <= this.atk.armor[1])) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(this.color, 0.35 + 0.2 * Math.sin(this.idleT * 0.8)); ctx.lineWidth = 14 * this.s; ctx.lineCap = 'round';
      strokeLimb(ctx, JR.hip, JR.neck);
      ctx.restore();
    }
    if (this.state === 'attack' && this.atk && this.atk.counter && this.atkTime >= this.atk.counter[0] && this.atkTime <= this.atk.counter[1]) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.08 * Math.sin(this.idleT * 0.6)})`;
      ctx.beginPath(); ctx.ellipse(JR.hip.x, JR.hip.y - 20, 40, 56, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    look.flash = this.flash > 0;
    look.alpha = this.invuln > 0 && (this.state === 'getup' || this.state === 'down') && Math.floor(this.idleT / 3) % 2 ? 0.55 : 1;
    if (this.hideWeapon > 0) look.weapon = null;
    drawFigure(ctx, JR, look);

    // brillo en el arma (iaido)
    if (this.flashGlint > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = JR.haF;
      ctx.fillStyle = `rgba(255,255,255,${this.flashGlint / 8})`;
      ctx.beginPath(); ctx.arc(g.x, g.y, 10 + (8 - this.flashGlint) * 2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // las estelas terminan exactamente donde se dibuja el arma (interpolada)
    this.wTrail.draw(ctx, this.color, this.s, this.weaponSample(JR));
    this.lTrail.draw(ctx, this.color, this.s, this.trailJoint ? JR[this.trailJoint] : null);
  }

  drawTag(ctx, alpha, camZoom) {
    if (!this.alive || this.hidden > 0) return;
    const J = this.JR;
    const x = J.head.x, y = Math.min(J.head.y, J.neck.y) - 26;
    const sz = 1 / Math.max(0.6, camZoom);
    ctx.save(); ctx.translate(x, y); ctx.scale(sz, sz);
    ctx.fillStyle = this.tagColor;
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(6, -8); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.font = '600 13px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,8,14,0.8)'; ctx.strokeText(this.tag, 0, -10);
    ctx.fillText(this.tag, 0, -10);
    ctx.restore();
  }
}

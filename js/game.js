'use strict';
// ─────────────────────────────────────────────────────────────
//  Partida: rondas, impactos, proyectiles, cámara y HUD
// ─────────────────────────────────────────────────────────────

const SLOT_COLORS = ['#ff4d6d', '#4dabff', '#ffd23f', '#5dff9a'];
const ALT_PALETTE = { color: '#f5f5f5', shade: '#9aa0ad' };
// campos del luchador que no se copian tal cual al serializar
const F_SKIP = new Set(['char', 'ctrl', 'bot', 'pose', 'target', 'J', 'Jprev', 'JR', 'chains', 'wTrail', 'lTrail', 'ghosts', 'rng', 'ragPrev',
  'rag', 'atk', 'atkState', 'hitGroups', 'cd', 'buf', 'groundPlat', 'lastAttacker', 'pendingKB', 'dashDir', 'stats', 'trailJoint']);
const F_LOAD_SPECIAL = { poseCur: 1, poseVel: 1, J: 1, Jx: 1, cd: 1, buf: 1, atk: 1, atkState: 1, hitGroups: 1, groundPlat: 1,
  lastAttacker: 1, pendingKB: 1, dashDir: 1, stats: 1, held: 1, pressed: 1 };

class Projectile {
  constructor(owner, o) {
    Object.assign(this, { g: 0, r: 10, life: 60, age: 0, dead: false, hitIds: new Set(), spin: 0 }, o);
    this.owner = owner;
    this.trail = [];
  }
}

class Match {
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode;                       // 'bots' | 'versus' | 'online' | 'training' | 'attract' | 'showcase'
    this.rng = new RNG(cfg.seed);
    this.fx = makeFX();
    FX = this.fx;
    this.stage = new Stage(cfg.stage);
    this.firstTo = cfg.firstTo || 3;
    this.fighters = [];
    this.projectiles = [];
    this.strikes = [];
    this.round = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.tick = 0;
    this.slowT = 0; this.slowScale = 1;
    this.screenFlash = 0;
    this.paused = false;
    this.focus = null;
    this.banner = null;
    this.onEnd = cfg.onEnd || null;
    const usedChars = {};
    cfg.players.forEach((p, i) => {
      const ch = CHAR_BY_ID[p.charId];
      const ctrl = new Controller(p.source);
      const mirror = usedChars[ch.id];
      usedChars[ch.id] = true;
      const F = new Fighter({
        id: i, slot: p.slot, char: ch, ctrl, team: p.team != null ? p.team : i, rng: this.rng,
        tag: p.tag, tagColor: SLOT_COLORS[p.slot % 4],
        color: mirror ? ALT_PALETTE.color : ch.color, shade: mirror ? ALT_PALETTE.shade : ch.shade,
        dummy: p.level === 'dummy',
      });
      if (p.source === 'bot') F.bot = new Bot(F, p.level || 'normal', this.rng);
      F.isHuman = p.source !== 'bot' && p.source !== 'script';
      F.padIndex = p.source && p.source.startsWith('pad') ? +p.source.slice(3) : -1;
      this.fighters.push(F);
    });
    this.cam = { x: this.stage.cx, y: this.stage.cy, zoom: 0.8, w: 1280, h: 720, refZoom: 0.7, trauma: 0, punch: 0, sx: 0, sy: 0, rot: 0, px: 0, py: 0, pz: 0.8 };
    this.startRound();
  }

  get timeScale() {
    if (this.slowT <= 0) return 1;
    return this.slowT < 12 ? lerp(1, this.slowScale, this.slowT / 12) : this.slowScale;
  }
  slowmo(scale, ticks) { this.slowScale = scale; this.slowT = Math.max(this.slowT, ticks); }
  shake(amount) { this.cam.trauma = Math.min(1, this.cam.trauma + amount * Settings.shake); }
  punch(amount) { this.cam.punch = Math.min(0.18, this.cam.punch + amount * Math.min(1, Settings.shake)); }

  startRound() {
    this.round++;
    this.phase = 'intro'; this.phaseT = 0;
    this.projectiles.length = 0; this.strikes.length = 0;
    this.fx.clear();
    const sp = this.stage.spawns;
    const n = this.fighters.length;
    this.fighters.forEach((F, i) => {
      let s = sp[i % sp.length];
      // entrenamiento: los dos en el suelo principal, frente a frente
      if (this.mode === 'training') { const g = this.stage.solids[0]; s = [this.stage.cx + (i ? 110 : -110), g.y]; }
      const facing = s[0] < this.stage.cx ? 1 : -1;
      F.reset(s[0], s[1] - 260 - i * 30, facing);
      F.vy = 4;
    });
    if (this.mode === 'showcase') { this.phase = 'fight'; return; }
    if (this.mode !== 'attract') this.showBanner(this.mode === 'training' ? 'ENTRENAMIENTO' : 'RONDA ' + this.round, 70, '#ffffff');
    if (this.onRound) this.onRound(this);
  }

  showBanner(text, life, color, sub) { this.banner = { text, life, age: 0, color, sub }; }

  // ── bucle de lógica (1 tick = 1/60 s de juego) ──
  update() {
    if (this.paused) return;
    FX = this.fx;
    this.tick++;
    if (this.slowT > 0) this.slowT--;
    this.phaseT++;
    if (this.banner) { this.banner.age++; if (this.banner.age >= this.banner.life) this.banner = null; }
    if (this.screenFlash > 0) this.screenFlash = Math.max(0, this.screenFlash - 0.08);

    const controlsOn = this.phase === 'fight' || this.phase === 'ko';
    if (this.phase === 'intro') {
      if (this.phaseT === 72 && this.mode !== 'attract') { this.showBanner('¡LUCHA!', 50, '#ffd23f'); Sfx.play('go'); }
      if (this.phaseT >= (this.mode === 'attract' ? 40 : 76)) { this.phase = 'fight'; this.phaseT = 0; }
    }

    this.stage.update();
    for (const F of this.fighters) {
      if (F.ctrl.source === 'net' || F.ctrl.source === 'script') {
        // las entradas ya vienen fijadas desde fuera (red / guion)
        if (!controlsOn) F.ctrl.clear();
      } else if (controlsOn) {
        if (F.bot) F.bot.update(this); else F.ctrl.poll();
      } else {
        for (const a of ACTIONS) { F.ctrl.held[a] = false; F.ctrl.pressed[a] = false; }
      }
    }
    for (const F of this.fighters) F.update(this);
    this.updateProjectiles();
    this.updateStrikes();
    this.resolveHits();
    this.checkBlast();
    FX.update();
    this.updateCamera();
    this.updatePhase();
  }

  updatePhase() {
    const alive = this.fighters.filter((F) => F.alive);
    if (this.mode === 'showcase') return;
    if (this.mode === 'training') {
      for (const F of this.fighters) if (!F.alive && this.tickDead(F) > 70) this.respawn(F);
      return;
    }
    if (this.phase === 'fight') {
      const teams = new Set(alive.map((F) => F.team));
      if (teams.size <= 1) {
        this.phase = 'ko'; this.phaseT = 0;
        this.roundWinner = alive[0] || null;
      }
    } else if (this.phase === 'ko') {
      if (this.phaseT === 50) {
        if (this.roundWinner) {
          this.roundWinner.wins++;
          if (this.mode !== 'attract') this.showBanner(this.roundWinner.char.name + ' GANA', 100, this.roundWinner.color, this.roundWinner.tag);
        } else if (this.mode !== 'attract') this.showBanner('EMPATE', 100, '#ffffff');
      }
      if (this.phaseT >= 150) {
        const champ = this.fighters.find((F) => F.wins >= this.firstTo);
        if (champ && this.mode !== 'attract') {
          this.phase = 'end'; this.phaseT = 0;
          if (this.onEnd) this.onEnd(champ, this);
        } else {
          if (this.mode === 'attract' && champ) this.fighters.forEach((F) => (F.wins = 0));
          this.startRound();
        }
      }
    }
  }
  tickDead(F) { F.deadT = (F.deadT || 0) + 1; return F.deadT; }
  respawn(F) {
    F.deadT = 0;
    let s = this.stage.spawns[F.id % this.stage.spawns.length];
    if (this.mode === 'training') { const g = this.stage.solids[0]; s = [this.stage.cx + (F.id ? 110 : -110), g.y]; }
    F.reset(s[0], s[1] - 300, s[0] < this.stage.cx ? 1 : -1);
  }

  // ── golpes ──
  resolveHits() {
    for (const A of this.fighters) {
      if (!A.alive || A.state !== 'attack' || !A.atk || A.hitstop > 0) continue;
      const m = A.atk, t = A.atkTime;
      for (const hb of m.hits) {
        if (t < hb.from || t > hb.to) continue;
        const cx = A.x + hb.x * A.facing, cy = A.y + hb.y;
        for (const D of this.fighters) {
          if (D === A || !D.alive || D.team === A.team) continue;
          const set = A.hitGroups[hb.group] || (A.hitGroups[hb.group] = new Set());
          if (set.has(D.id)) continue;
          if (!circleRect(cx, cy, hb.r, ...Object.values(D.hurtbox()))) continue;
          if (D.invulnerable) continue;
          set.add(D.id);
          this.applyHit(A, D, hb, { cx, cy, dirX: A.facing });
          if (A.state !== 'attack' || !A.atk) break;
        }
        if (A.state !== 'attack' || !A.atk) break;
      }
    }
  }

  applyHit(A, D, hb, info) {
    if (D.invulnerable || !D.alive) return false;
    // contraataque (Kaze)
    if (D.state === 'attack' && D.atk && D.atk.counter && D.atkTime >= D.atk.counter[0] && D.atkTime <= D.atk.counter[1] && !info.projectile) {
      this.triggerCounter(D, A);
      return false;
    }
    const st = A.char.stats;
    const scale = D.comboHits < 3 ? 1 : Math.max(0.45, 1 - (D.comboHits - 2) * 0.08);
    const dmg = hb.dmg * st.dmg * scale * (info.dmgMul || 1);
    D.hp = Math.max(0, D.hp - dmg);
    D.ghostDelay = 34;
    A.stats.dmgDealt += dmg;
    if (A.atk && !info.projectile) { A.atk.hasHit = true; A.atkHitAt = A.atkTime; }

    const lost = 1 - D.hp / D.maxHp;
    let kb = (hb.kb + (hb.g || 4) * lost * 1.5) / D.char.stats.weight;
    const ang = (hb.a || 0) * DEG;
    const dir = info.dirX || 1;
    let ux = Math.cos(ang) * dir, uy = -Math.sin(ang);
    // influencia direccional: el que recibe puede torcer un poco la trayectoria
    const dc = D.ctrl;
    if (dc.x || dc.y) {
      const px = -uy, py = ux;
      const il = Math.hypot(dc.x, dc.y);
      const d = (dc.x * px + dc.y * py) / il;
      ux += px * d * 0.18; uy += py * d * 0.18;
      const L = Math.hypot(ux, uy); ux /= L; uy /= L;
    }
    let kx = ux * kb, ky = uy * kb;
    if (D.onGround && ky > 0) ky = -ky * 0.55;          // los picados en el suelo rebotan
    const tumbleHit = kb > PHYS.tumbleKB;
    // golpes flojos y rasantes: la víctima sigue pisando el suelo (no se escurre)
    if (D.onGround && !tumbleHit && ky < 0 && ky > -3.4) ky = 0;
    // en las cadenas ligeras el atacante acompaña a la víctima para que el combo no se caiga
    if (!info.projectile && A.atk && (TIER[A.atk.name] || 0) === 1 && A.onGround && D.onGround && ky === 0) A.pendingFollow = kx * 0.85;

    const power = clamp(kb / 10, 0.35, 2.2);
    const hs = Math.round(hb.hs || 3 + dmg * 0.45);

    // armadura: aguanta sin salir volando
    if (D.armored && kb < 15) {
      A.hitstop = Math.ceil(hs * 0.7); D.hitstop = Math.ceil(hs * 0.7); D.victim = true; A.victim = false;
      D.flash = 4;
      this.hitFx(A, D, hb, info, power * 0.6, dmg);
      FX.text(D.rx, D.y - 120, 'ARMADURA', D.color, 20, 30);
      if (D.hp <= 0) this.ko(D, A, kx, ky);
      return true;
    }

    const decay = D.comboHits > 6 ? Math.max(0.45, Math.pow(0.88, D.comboHits - 6)) : 1;
    const stun = Math.round(clamp(kb * (hb.stun || 2.5), 12, 75) * decay);
    const tumble = tumbleHit;
    A.hitstop = hs; D.hitstop = hs; D.victim = true; A.victim = false;
    D.takeHit(kx, ky, stun, tumble);
    D.lastAttacker = A;

    D.comboHits++; D.comboDmg += dmg;
    if (D.comboHits >= 2) {
      FX.combo(A, D.comboHits, D.comboDmg);
      A.stats.maxCombo = Math.max(A.stats.maxCombo, D.comboHits);
    }
    if (this.mode === 'training') this.lastCombo = { hits: D.comboHits, dmg: D.comboDmg };

    this.hitFx(A, D, hb, info, power, dmg);
    if (A.atk && A.atk.onHit && !info.projectile) A.atk.onHit(A, D, this);
    if (D.hp <= 0) this.ko(D, A, kx, ky);
    return true;
  }

  hitFx(A, D, hb, info, power, dmg) {
    const hbx = D.hurtbox();
    const px = clamp(info.cx, hbx.x, hbx.x + hbx.w), py = clamp(info.cy, hbx.y, hbx.y + hbx.h);
    const ang = (hb.a || 0) * DEG;
    FX.sparks(px, py, Math.cos(ang) * (info.dirX || 1), -Math.sin(ang), A.color, Math.round(6 + power * 6), 0.7 + power * 0.35);
    FX.hitFlash(px, py, A.color, 0.55 + power * 0.35);
    if (power > 1.05) {
      FX.impactLines(px, py, A.color, 16, 0.6 + power * 0.35);
      this.punch(0.035 * power);
      this.shake(0.22 + power * 0.16);
    } else this.shake(0.08 + power * 0.08);
    if (hb.fx === 'zap') for (let i = 0; i < 3; i++) FX.bolt(px, py, px + rand(-60, 60), py + rand(-60, 60), A.color, 8, 2.5);
    if (hb.fx === 'iaido') FX.slashArc(px, py, 56, -2.4, 0.6, '#ffffff', 12, 8);
    Sfx.play(hb.sfx || 'hit', hb.p || power);
    if (Settings.dmgNumbers) FX.text(px + rand(-10, 10), py - 20, String(Math.max(1, Math.round(dmg))), '#ffffff', 18 + Math.min(14, dmg), 34, { vy: -1.6 });
    if (A.padIndex >= 0) Input.rumble(A.padIndex, 0.25 * power, 0.4 * power, 60);
    if (D.padIndex >= 0) Input.rumble(D.padIndex, 0.6 * power, 0.5 * power, 90 + power * 60);
  }

  triggerCounter(D, A) {
    Sfx.play('parry');
    FX.hitFlash(D.x, D.y - 50, '#ffffff', 1.6);
    FX.impactLines(D.x, D.y - 50, '#ffffff', 22, 1.3);
    FX.text(D.x, D.y - 130, '¡CONTRA!', '#ffffff', 34, 50);
    this.slowmo(0.3, 34);
    this.punch(0.12); this.shake(0.4);
    // el atacante se queda aturdido
    A.takeHit(0, 0, 26, false);
    A.hitstop = 10; A.victim = true; A.pendingKB = { kx: 0, ky: 0 };
    // Kaze aparece a su espalda
    D.ghostAt();
    const side = A.facing;
    D.teleport(A.x - side * 52, A.y, this);
    D.facing = side;
    D.invuln = 24;
    D.startAttack('counterStrike', this);
    D.hitstop = 6;
  }

  ko(D, A, kx, ky) {
    const last = new Set(this.fighters.filter((F) => F.alive && F !== D).map((F) => F.team)).size <= 1;
    D.die(kx * 1.25, ky * 1.25 - 2, this, false);
    if (A) A.stats.kos++;
    Sfx.play('ko');
    this.screenFlash = 0.8;
    this.shake(0.7); this.punch(0.14);
    FX.impactLines(D.x, D.y - 50, '#ffffff', 26, 1.6);
    FX.hitFlash(D.x, D.y - 50, D.color, 2);
    if (this.mode !== 'training') {
      if (last && this.mode !== 'attract') { this.slowmo(0.18, 70); this.focus = D; this.showBanner('K.O.', 90, '#ff3b4e'); }
      else this.slowmo(0.4, 24);
    }
  }

  checkBlast() {
    const b = this.stage.blast;
    for (const F of this.fighters) {
      if (!F.alive) continue;
      if (F.x < b.x || F.x > b.x + b.w || F.y < b.y || F.y > b.y + b.h) {
        let nx = 0, ny = 0;
        if (F.x < b.x) nx = -1; else if (F.x > b.x + b.w) nx = 1;
        if (F.y < b.y) ny = -1; else if (F.y > b.y + b.h) ny = 1;
        // la explosión aparece en el borde visible de la cámara
        const v = this.viewRect();
        const ex = clamp(F.x, v.x + 20, v.x + v.w - 20), ey = clamp(F.y - 40, v.y + 20, v.y + v.h - 20);
        FX.blast(ex, ey, nx, ny, F.color);
        Sfx.play('boom', 1.3);
        this.shake(0.7);
        this.screenFlash = 0.5;
        const killer = F.lastAttacker;
        if (killer && killer !== F) killer.stats.kos++;
        const last = new Set(this.fighters.filter((Q) => Q.alive && Q !== F).map((Q) => Q.team)).size <= 1;
        F.die(0, 0, this, true);
        if (last && this.mode !== 'attract' && this.mode !== 'training') { this.slowmo(0.3, 40); this.showBanner('¡FUERA!', 90, '#ffd23f'); }
      }
    }
  }

  onWallBounce(F) {
    FX.debris(F.x, F.y - 50, '#bfb3a0', 6, 0.8);
    FX.ring(F.x, F.y - 50, '#ffffff', 50, 10, 4);
    Sfx.play('land', 1.6); this.shake(0.3);
  }

  // ── API para habilidades ──
  nearestEnemy(F, maxD = 99999) {
    let best = null, bd = maxD;
    for (const T of this.fighters) {
      if (T === F || !T.alive || T.team === F.team) continue;
      const d = dist(F.x, F.y, T.x, T.y);
      if (d < bd) { bd = d; best = T; }
    }
    return best;
  }
  spawnProjectile(F, o) { this.projectiles.push(new Projectile(F, o)); }
  spawnStrike(F, x, delay, hit) {
    this.strikes.push({ owner: F, x, delay, t: 0, hit, done: false });
  }
  activeHit(F, hb) {
    const s = F.s, cx = F.x + hb.x * s * F.facing, cy = F.y + hb.y * s, r = hb.r * s;
    const set = F.hitGroups.act || (F.hitGroups.act = new Set());
    for (const D of this.fighters) {
      if (D === F || !D.alive || D.team === F.team || set.has(D.id)) continue;
      if (!circleRect(cx, cy, r, ...Object.values(D.hurtbox())) || D.invulnerable) continue;
      set.add(D.id);
      this.applyHit(F, D, hb, { cx, cy, dirX: F.facing });
    }
  }
  slamImpact(F, radius, hb) {
    Sfx.play('shock');
    FX.shockwave(F.x, F.y, F.color, 0);
    FX.ring(F.x, F.y - 10, F.color, radius, 18, 6);
    FX.debris(F.x, F.y, '#c9b8a0', 16, 1.4);
    FX.landDust(F.x, F.y, 2);
    this.shake(0.6); this.punch(0.06);
    for (const D of this.fighters) {
      if (D === F || !D.alive || D.team === F.team || D.invulnerable) continue;
      if (Math.abs(D.x - F.x) < radius && Math.abs(D.y - F.y) < 90) {
        this.applyHit(F, D, hb, { cx: D.x, cy: D.y - 20, dirX: sign(D.x - F.x) || F.facing, projectile: true });
      }
    }
  }
  coneHit(F, mx, my, range, half, hb) {
    for (const D of this.fighters) {
      if (D === F || !D.alive || D.team === F.team || D.invulnerable) continue;
      const h = D.hurtbox(), cx = h.x + h.w / 2, cy = h.y + h.h / 2;
      const dx = cx - mx, dy = cy - my, d = Math.hypot(dx, dy);
      if (d > range + h.w / 2) continue;
      const a = Math.atan2(dy, dx * F.facing);
      if (Math.abs(a) > half && d > 30) continue;
      const near = 1 + (1 - d / range) * 0.35;
      this.applyHit(F, D, Object.assign({}, hb, { kb: hb.kb * near }), { cx, cy, dirX: F.facing, projectile: true });
    }
  }

  updateProjectiles() {
    const P = this.projectiles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age++;
      p.ox = p.x; p.oy = p.y;
      p.vy += p.g;
      p.x += p.vx; p.y += p.vy;
      p.spin += 0.5;
      p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 8) p.trail.shift();
      let hitSomething = false;
      if (this.stage.solidAt(p.x, p.y)) hitSomething = true;
      for (const D of this.fighters) {
        if (hitSomething) break;
        if (D === p.owner || !D.alive || D.team === p.owner.team || p.hitIds.has(D.id) || D.invulnerable) continue;
        if (!circleRect(p.x, p.y, p.r, ...Object.values(D.hurtbox()))) continue;
        p.hitIds.add(D.id);
        if (p.hit) this.applyHit(p.owner, D, p.hit, { cx: p.x, cy: p.y, dirX: sign(p.vx) || 1, projectile: true });
        hitSomething = true;
      }
      if (hitSomething || p.age >= p.life) {
        if (p.explode) this.explode(p);
        else if (hitSomething) { FX.sparks(p.x, p.y, -sign(p.vx), 0, p.owner.color, 5, 0.6); }
        P.splice(i, 1);
      }
    }
  }
  explode(p) {
    const e = p.explode;
    Sfx.play('boom', 0.7);
    FX.hitFlash(p.x, p.y, p.owner.color, 1.4);
    FX.ring(p.x, p.y, p.owner.color, e.r * 1.4, 16, 5);
    FX.sparks(p.x, p.y, 0, -1, p.owner.color, 16, 1.1);
    this.shake(0.3);
    for (const D of this.fighters) {
      if (D === p.owner || !D.alive || D.team === p.owner.team || D.invulnerable) continue;
      if (!circleRect(p.x, p.y, e.r, ...Object.values(D.hurtbox()))) continue;
      this.applyHit(p.owner, D, Object.assign({ sfx: 'zap', fx: 'zap' }, e), { cx: p.x, cy: p.y, dirX: sign(D.x - p.x) || 1, projectile: true });
    }
  }
  updateStrikes() {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t++;
      if (s.t === s.delay) {
        // busca el suelo bajo el rayo
        let gy = this.stage.blast.y + this.stage.blast.h;
        for (const p of this.stage.solids) if (s.x > p.x && s.x < p.x + p.w && p.y < gy) gy = p.y;
        s.gy = gy;
        Sfx.play('zap');
        FX.bolt(s.x + rand(-20, 20), this.cam.y - 900, s.x, gy, s.owner.color, 14, 9);
        FX.bolt(s.x + rand(-30, 30), this.cam.y - 900, s.x, gy, '#ffffff', 10, 4);
        FX.hitFlash(s.x, gy - 20, s.owner.color, 1.6);
        FX.ring(s.x, gy, s.owner.color, 90, 16, 5);
        FX.debris(s.x, gy, '#ffffff', 8, 1);
        this.shake(0.45); this.screenFlash = Math.max(this.screenFlash, 0.25);
        for (const D of this.fighters) {
          if (D === s.owner || !D.alive || D.team === s.owner.team || D.invulnerable) continue;
          const h = D.hurtbox();
          if (h.x + h.w > s.x - 36 && h.x < s.x + 36) this.applyHit(s.owner, D, Object.assign({ sfx: 'zap', fx: 'zap' }, s.hit), { cx: s.x, cy: h.y + h.h / 2, dirX: sign(D.x - s.x) || s.owner.facing, projectile: true });
        }
      }
      if (s.t > s.delay + 14) this.strikes.splice(i, 1);
    }
  }

  // ── estado serializable (resincronización online) ──
  saveState() {
    const plats = this.stage.plats;
    const fighters = this.fighters.map((F) => {
      const o = {};
      for (const k in F) {
        if (F_SKIP.has(k)) continue;
        const v = F[k], t = typeof v;
        if (v === null || t === 'number' || t === 'boolean' || t === 'string') o[k] = v;
      }
      o.poseCur = Object.assign({}, F.pose.cur); o.poseVel = Object.assign({}, F.pose.vel);
      o.J = JOINT_NAMES.flatMap((n) => [F.J[n].x, F.J[n].y]); o.Jx = [F.J.f, F.J.s, F.J.headAng, F.J.wAng];
      o.cd = Object.assign({}, F.cd); o.buf = Object.assign({}, F.buf);
      o.atk = F.atk ? { name: F.atk.name, hasHit: !!F.atk.hasHit } : null;
      o.atkState = JSON.parse(JSON.stringify(F.atkState || {}));
      o.hitGroups = {};
      for (const g in F.hitGroups) o.hitGroups[g] = [...F.hitGroups[g]];
      o.groundPlat = F.groundPlat ? plats.indexOf(F.groundPlat) : -1;
      o.lastAttacker = F.lastAttacker ? F.lastAttacker.id : -1;
      o.pendingKB = F.pendingKB ? Object.assign({}, F.pendingKB) : null;
      o.dashDir = F.dashDir ? Object.assign({}, F.dashDir) : null;
      o.stats = Object.assign({}, F.stats);
      o.held = Object.assign({}, F.ctrl.held); o.pressed = Object.assign({}, F.ctrl.pressed);
      return o;
    });
    const projectiles = this.projectiles.map((p) => {
      const o = {};
      for (const k in p) if (k !== 'owner' && k !== 'hitIds' && k !== 'trail') o[k] = p[k];
      o.owner = p.owner.id; o.hitIds = [...p.hitIds];
      return o;
    });
    const strikes = this.strikes.map((s) => Object.assign({}, s, { owner: s.owner.id }));
    return {
      tick: this.tick, phase: this.phase, phaseT: this.phaseT, round: this.round, slowT: this.slowT, slowScale: this.slowScale,
      roundWinner: this.roundWinner ? this.roundWinner.id : -1, rng: this.rng.s,
      stage: { time: this.stage.time, plats: plats.map((p) => [p.x, p.y, p.prevY, p.dx, p.dy]) },
      fighters, projectiles, strikes,
    };
  }
  loadState(S) {
    this.tick = S.tick; this.phase = S.phase; this.phaseT = S.phaseT; this.round = S.round;
    this.slowT = S.slowT; this.slowScale = S.slowScale; this.rng.s = S.rng;
    this.roundWinner = S.roundWinner >= 0 ? this.fighters[S.roundWinner] : null;
    this.stage.time = S.stage.time;
    S.stage.plats.forEach((a, i) => { const p = this.stage.plats[i]; [p.x, p.y, p.prevY, p.dx, p.dy] = a; });
    S.fighters.forEach((o, i) => {
      const F = this.fighters[i];
      for (const k in o) {
        if (k in F_LOAD_SPECIAL) continue;
        F[k] = o[k];
      }
      Object.assign(F.pose.cur, o.poseCur); Object.assign(F.pose.vel, o.poseVel);
      JOINT_NAMES.forEach((n, j) => { F.J[n].x = o.J[j * 2]; F.J[n].y = o.J[j * 2 + 1]; });
      [F.J.f, F.J.s, F.J.headAng, F.J.wAng] = o.Jx;
      copyJoints(F.Jprev, F.J);
      F.cd = Object.assign({}, o.cd); F.buf = Object.assign({}, o.buf);
      if (o.atk) { F.atk = Object.create(F.char.compiled[o.atk.name]); F.atk.hasHit = o.atk.hasHit; } else F.atk = null;
      F.atkState = o.atkState;
      F.hitGroups = {};
      for (const g in o.hitGroups) F.hitGroups[g] = new Set(o.hitGroups[g]);
      F.groundPlat = o.groundPlat >= 0 ? this.stage.plats[o.groundPlat] : null;
      F.lastAttacker = o.lastAttacker >= 0 ? this.fighters[o.lastAttacker] : null;
      F.pendingKB = o.pendingKB; F.dashDir = o.dashDir; F.stats = o.stats;
      Object.assign(F.ctrl.held, o.held); Object.assign(F.ctrl.pressed, o.pressed);
      if (!F.alive) F.rag = null;
      F.chains.forEach((c) => (c.init = false));
      F.ghosts.length = 0;
    });
    this.projectiles = S.projectiles.map((o) => {
      const p = new Projectile(this.fighters[o.owner], {});
      Object.assign(p, o, { owner: this.fighters[o.owner], hitIds: new Set(o.hitIds), trail: [] });
      return p;
    });
    this.strikes = S.strikes.map((s) => Object.assign({}, s, { owner: this.fighters[s.owner] }));
  }
  // huella del estado de juego: si difiere entre los dos ordenadores, hay desincronización
  hash() {
    let h = 2166136261 >>> 0;
    const mix = (v) => { h ^= Math.round(v * 64) | 0; h = Math.imul(h, 16777619) >>> 0; };
    mix(this.tick); mix(this.rng.s & 0xffff); mix(this.rng.s >>> 16); mix(this.projectiles.length);
    for (const F of this.fighters) {
      mix(F.x); mix(F.y); mix(F.vx); mix(F.vy); mix(F.hp); mix(F.atkTime); mix(F.facing);
      mix(F.alive ? 1 : 0); mix(F.wins); mix(F.state.length); mix(F.state.charCodeAt(0));
    }
    for (const p of this.projectiles) { mix(p.x); mix(p.y); }
    return h;
  }

  // ── cámara ──
  viewRect() {
    const c = this.cam;
    return { x: c.x - c.w / 2 / c.zoom, y: c.y - c.h / 2 / c.zoom, w: c.w / c.zoom, h: c.h / c.zoom };
  }
  updateCamera() {
    const c = this.cam;
    c.px = c.x; c.py = c.y; c.pz = c.zoom;
    if (this.mode === 'showcase') {
      const F = this.fighters[0];
      c.x = damp(c.x, F.x, 4, STEP); c.y = damp(c.y, F.y - 62 * F.s - 6, 4, STEP);
      c.zoom = c.h / (215 * F.s); c.refZoom = c.zoom;
      c.punch *= 0.86; c.trauma = Math.max(0, c.trauma - 0.04);
      const tr = c.trauma * c.trauma, t = this.tick * 0.9;
      c.sx = 10 * tr * noise1(t); c.sy = 10 * tr * noise1(t + 50); c.rot = 0;
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
    const add = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); n++; };
    const b = this.stage.blast;
    for (const F of this.fighters) {
      if (F.alive) add(clamp(F.x, b.x + 200, b.x + b.w - 200), clamp(F.y - 50, b.y + 150, b.y + b.h - 250));
      else if (F.rag && F.rag.age < 140) add(clamp(F.rag.x, b.x + 200, b.x + b.w - 200), clamp(F.rag.y, b.y + 150, b.y + b.h - 250));
    }
    if (!n) add(this.stage.cx, this.stage.cy);
    let tx = (minX + maxX) / 2, ty = (minY + maxY) / 2 - 30;
    const spanX = maxX - minX + 520, spanY = maxY - minY + 420;
    const zMin = c.h / 1350, zMax = c.h / 560;
    let tz = clamp(Math.min(c.w / spanX, c.h / spanY), zMin, zMax);
    if (this.focus && this.slowT > 0) {
      const f = this.focus, fx = f.rag ? f.rag.x : f.x, fy = f.rag ? f.rag.y : f.y - 50;
      tx = lerp(tx, fx, 0.6); ty = lerp(ty, fy, 0.6); tz = Math.min(zMax, tz * 1.35);
    } else this.focus = null;
    c.x = damp(c.x, tx, 5, STEP);
    c.y = damp(c.y, ty, 5, STEP);
    c.zoom = damp(c.zoom, tz, 3.2, STEP);
    c.refZoom = c.h / 1100;
    c.punch *= 0.86;
    c.trauma = Math.max(0, c.trauma - 0.028);
    const tr = c.trauma * c.trauma;
    const t = this.tick * 0.9;
    c.sx = 30 * tr * noise1(t); c.sy = 30 * tr * noise1(t + 50); c.rot = 0.035 * tr * noise1(t + 99);
  }

  // ═══════════════════ DIBUJO ═══════════════════
  draw(ctx, alpha, w, h) {
    FX = this.fx; FX.alpha = alpha;
    const c = this.cam;
    c.w = w; c.h = h;
    // cámara interpolada
    const cx = lerp(c.px, c.x, alpha), cy = lerp(c.py, c.y, alpha), z = lerp(c.pz, c.zoom, alpha) * (1 + c.punch);
    const viewCam = { x: cx, y: cy, zoom: z, w, h, refZoom: c.refZoom, base: ctx.getTransform() };
    ctx.save();
    this.stage.drawBg(ctx, viewCam);
    ctx.translate(w / 2 + c.sx, h / 2 + c.sy);
    ctx.rotate(c.rot);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);

    // telegrafía del rayo
    for (const s of this.strikes) {
      if (s.t < s.delay) {
        const u = s.t / s.delay;
        ctx.fillStyle = rgba(s.owner.color, 0.08 + 0.18 * u);
        ctx.fillRect(s.x - 36 * u, cy - 2000, 72 * u, 4000);
        ctx.strokeStyle = rgba(s.owner.color, 0.5 + 0.5 * Math.sin(s.t * 0.8));
        ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.moveTo(s.x, cy - 2000); ctx.lineTo(s.x, cy + 2000); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    this.stage.drawPlats(ctx);
    // sombras en el suelo
    for (const F of this.fighters) {
      if (!F.alive) continue;
      let gy = null;
      for (const p of this.stage.plats) if (F.x > p.x && F.x < p.x + p.w && p.y >= F.y - 1 && (gy == null || p.y < gy)) gy = p.y;
      if (gy == null) continue;
      const d = gy - F.y, a = clamp(1 - d / 400, 0, 1) * 0.35;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath(); ctx.ellipse(F.JR.hip.x || F.x, gy + 2, 24 * (0.6 + 0.4 * a / 0.35), 5, 0, 0, TAU); ctx.fill();
    }
    // los muertos debajo
    for (const F of this.fighters) if (!F.alive) F.draw(ctx, alpha, this);
    for (const F of this.fighters) if (F.alive) F.draw(ctx, alpha, this);
    this.drawProjectiles(ctx, alpha);
    FX.draw(ctx);
    if (this.mode !== 'attract' && this.mode !== 'showcase') for (const F of this.fighters) F.drawTag(ctx, alpha, z);
    FX.drawTexts(ctx);
    if (this.debug) this.drawDebug(ctx);
    if (this.stage.drawFg) this.stage.drawFg(ctx, viewCam);
    ctx.restore();

    if (this.screenFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.screenFlash * 0.6})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.slowT > 0 && this.slowScale < 0.5) {
      // viñeta durante la cámara lenta
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.45 * Math.min(1, this.slowT / 12)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (this.mode !== 'attract' && this.mode !== 'showcase') {
      this.drawOffscreen(ctx, viewCam);
      if (!this.hideHUD) this.drawHUD(ctx, w, h);
    }
    this.drawBanner(ctx, w, h);
  }

  drawProjectiles(ctx, alpha) {
    for (const q of this.projectiles) {
      const col = q.owner.color;
      // copia con la posición interpolada
      const p = Object.create(q);
      if (q.ox != null) { p.x = lerp(q.ox, q.x, alpha); p.y = lerp(q.oy, q.y, alpha); }
      ctx.save();
      if (p.kind === 'shuriken') {
        ctx.translate(p.x, p.y); ctx.rotate(p.spin);
        ctx.fillStyle = '#d9dde8';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : 10, a = (i / 8) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
      } else if (p.kind === 'orb') {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < p.trail.length; i++) {
          const q = p.trail[i], a = i / p.trail.length;
          ctx.fillStyle = rgba(col, 0.15 * a); ctx.beginPath(); ctx.arc(q.x, q.y, p.r * a, 0, TAU); ctx.fill();
        }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, rgba(col, 0.9)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2, 0, TAU); ctx.fill();
        if (p.age % 3 === 0) FX.bolt(p.x, p.y, p.x + rand(-30, 30), p.y + rand(-30, 30), col, 4, 1.5);
      } else if (p.kind === 'javelin') {
        ctx.globalCompositeOperation = 'lighter';
        const a = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(8, -6); ctx.lineTo(8, 6); ctx.closePath(); ctx.fill();
      } else if (p.kind === 'bullet') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,230,140,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawDebug(ctx) {
    ctx.lineWidth = 1.5;
    for (const F of this.fighters) {
      if (!F.alive) continue;
      const h = F.hurtbox();
      ctx.strokeStyle = 'rgba(80,200,255,0.8)'; ctx.strokeRect(h.x, h.y, h.w, h.h);
      if (F.state === 'attack' && F.atk) {
        for (const hb of F.atk.hits) {
          const on = F.atkTime >= hb.from && F.atkTime <= hb.to;
          ctx.strokeStyle = on ? 'rgba(255,50,50,0.9)' : 'rgba(255,150,150,0.25)';
          ctx.beginPath(); ctx.arc(F.x + hb.x * F.facing, F.y + hb.y, hb.r, 0, TAU); ctx.stroke();
        }
      }
    }
  }

  drawOffscreen(ctx, cam) {
    const pad = 46;
    for (const F of this.fighters) {
      if (!F.alive) continue;
      const sx = (F.JR.hip.x - cam.x) * cam.zoom + cam.w / 2, sy = (F.y - 50 - cam.y) * cam.zoom + cam.h / 2;
      if (sx > -10 && sx < cam.w + 10 && sy > -10 && sy < cam.h + 10) continue;
      const ex = clamp(sx, pad, cam.w - pad), ey = clamp(sy, pad, cam.h - 160);
      const a = Math.atan2(sy - ey, sx - ex);
      ctx.save(); ctx.translate(ex, ey);
      ctx.fillStyle = 'rgba(10,10,18,0.8)'; ctx.strokeStyle = F.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.rotate(a); ctx.fillStyle = F.color;
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(24, -8); ctx.lineTo(24, 8); ctx.closePath(); ctx.fill();
      ctx.rotate(-a);
      ctx.fillStyle = F.color; ctx.beginPath(); ctx.arc(0, -2, 9, 0, TAU); ctx.fill();
      ctx.font = '600 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText(F.tag, 0, 18);
      ctx.restore();
    }
  }

  drawHUD(ctx, w, h) {
    const n = this.fighters.length;
    const cardW = Math.min(300, (w - 40) / n - 14), cardH = 74;
    const total = n * cardW + (n - 1) * 14;
    let x0 = (w - total) / 2;
    const y0 = h - cardH - 16;
    ctx.save();
    for (const F of this.fighters) {
      const x = x0;
      x0 += cardW + 14;
      ctx.globalAlpha = F.alive ? 1 : 0.5;
      // tarjeta
      ctx.fillStyle = 'rgba(10,10,20,0.72)';
      ctx.beginPath(); ctx.moveTo(x + 12, y0); ctx.lineTo(x + cardW, y0); ctx.lineTo(x + cardW - 12, y0 + cardH); ctx.lineTo(x, y0 + cardH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F.tagColor; ctx.fillRect(x + 12, y0, cardW - 12, 3);
      // retrato
      const px = x + 38, py = y0 + 38;
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.arc(px, py, 25, 0, TAU); ctx.fill();
      ctx.fillStyle = F.color; ctx.beginPath(); ctx.arc(px, py, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(10,10,18,0.85)'; ctx.beginPath(); ctx.ellipse(px + 7, py - 2, 2.5, 4, 0, 0, TAU); ctx.fill();
      // nombre
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '26px "Bebas Neue", Impact, sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(F.char.name, x + 70, y0 + 27);
      const nw = ctx.measureText(F.char.name).width;
      ctx.font = '600 13px "Barlow Condensed", sans-serif'; ctx.fillStyle = F.tagColor;
      ctx.fillText(F.tag, x + 76 + nw, y0 + 26);
      // victorias
      if (this.mode !== 'training') {
        for (let i = 0; i < this.firstTo; i++) {
          const wx = x + cardW - 22 - i * 16, wy = y0 + 18;
          ctx.save(); ctx.translate(wx, wy); ctx.rotate(Math.PI / 4);
          ctx.fillStyle = i < F.wins ? '#ffd23f' : 'rgba(255,255,255,0.15)';
          ctx.fillRect(-5, -5, 10, 10); ctx.restore();
        }
      }
      // barra de vida
      const bx = x + 70, by = y0 + 36, bw = cardW - 96, bh = 14;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ff4d4d'; ctx.fillRect(bx, by, bw * (F.ghostHp / F.maxHp), bh);
      const hpw = bw * (F.hp / F.maxHp);
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, F.color); g.addColorStop(1, F.shade);
      ctx.fillStyle = g; ctx.fillRect(bx, by, hpw, bh);
      ctx.fillStyle = 'rgba(10,10,20,0.6)';
      for (let i = 1; i < 10; i++) ctx.fillRect(bx + (bw * i) / 10 - 1, by, 2, bh);
      // habilidades
      const sx = bx;
      const skw = (bw - 4) / 2;
      F.char.skills.forEach((sk, i) => {
        const cx = sx + i * (skw + 4), cy = by + 20, cw = skw, ch = 14;
        const cd = F.cd[sk.key], max = sk.cd;
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(cx, cy, cw, ch);
        const ready = cd <= 0;
        ctx.fillStyle = ready ? rgba(F.color, 0.85) : 'rgba(255,255,255,0.25)';
        ctx.fillRect(cx, cy, cw * (1 - cd / max), ch);
        ctx.fillStyle = ready ? '#0b0b12' : '#ffffff';
        let fs = 11;
        ctx.font = `600 ${fs}px "Barlow Condensed", sans-serif`;
        while (fs > 7 && ctx.measureText(sk.name.toUpperCase()).width > cw - 6) { fs -= 0.5; ctx.font = `600 ${fs}px "Barlow Condensed", sans-serif`; }
        ctx.fillText(sk.name.toUpperCase(), cx + 3, cy + 11);
      });
    }
    ctx.restore();

    if (this.mode === 'training') {
      ctx.save();
      ctx.font = '600 15px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('ENTRENAMIENTO · el muñeco se cura solo · F2: ver cajas de golpe', 20, 30);
      if (this.lastCombo) {
        ctx.font = '30px "Bebas Neue", Impact, sans-serif'; ctx.fillStyle = '#ffd23f';
        ctx.fillText(`ÚLTIMO COMBO: ${this.lastCombo.hits} GOLPES · ${Math.round(this.lastCombo.dmg)} DAÑO`, 20, 64);
      }
      ctx.restore();
    }
  }

  drawBanner(ctx, w, h) {
    const b = this.banner;
    if (!b) return;
    const u = b.age / b.life;
    const inT = Ease.outBack(clamp(b.age / 12, 0, 1));
    const out = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
    ctx.save();
    ctx.translate(w / 2, h * 0.38);
    // franja
    ctx.globalAlpha = out * 0.85;
    ctx.fillStyle = 'rgba(8,8,14,0.75)';
    const bandH = 110 * clamp(b.age / 8, 0, 1);
    ctx.fillRect(-w / 2, -bandH / 2, w, bandH);
    ctx.globalAlpha = out;
    const sc = lerp(2.2, 1, inT);
    ctx.scale(sc, sc);
    ctx.font = '96px "Bebas Neue", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = b.color;
    ctx.shadowColor = rgba(b.color.startsWith('#') ? b.color : '#ffffff', 0.6); ctx.shadowBlur = 24;
    ctx.fillText(b.text, 0, 4);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = '600 20px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(b.sub, 0, 54);
    }
    ctx.restore();
  }
}

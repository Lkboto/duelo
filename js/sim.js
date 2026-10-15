// Simulación del combate. No toca el DOM ni dibuja nada: solo recibe
// entradas por frame y actualiza el estado. Con las mismas entradas da
// siempre el mismo resultado, que es lo que necesitará el online (rollback).

export const STAGE_W = 960;
export const STAGE_H = 540;
export const GROUND = 470;
const WALL = 30;

const FREE_STATES = ['idle', 'walk', 'crouch', 'block', 'jump'];
const SKILL_KEYS = ['neutral', 'forward', 'down'];

export const EMPTY_INPUT = Object.freeze({
  up: false, down: false, left: false, right: false,
  light: false, heavy: false, skill: false, block: false,
  upP: false, downP: false, leftP: false, rightP: false,
  lightP: false, heavyP: false, skillP: false, blockP: false,
});

export class Fighter {
  constructor(def, index) {
    this.def = def;
    this.index = index;
    this.wins = 0;
    this.reset(index === 0 ? 300 : STAGE_W - 300, index === 0 ? 1 : -1);
  }

  reset(x, facing) {
    this.hp = this.def.maxHp;
    this.x = x;
    this.y = GROUND;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.state = 'idle';
    this.stateTime = 0;
    this.move = null;
    this.moveKey = null;
    this.moveFrame = 0;
    this.hasHit = false;
    this.stun = 0;
    this.combo = 0;
    this.flash = 0;
    this.cooldowns = { neutral: 0, forward: 0, down: 0 };
  }

  get grounded() { return this.y >= GROUND && this.vy >= 0; }
  get canAct() { return FREE_STATES.includes(this.state); }

  setState(s) {
    if (this.state !== s) { this.state = s; this.stateTime = 0; }
  }

  hurtbox() {
    const h = this.state === 'crouch' ? this.def.height * 0.62 : this.def.height;
    const w = this.def.width;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  phase() {
    if (!this.move) return null;
    const m = this.move;
    if (this.moveFrame < m.startup) return 'startup';
    if (this.moveFrame < m.startup + m.active) return 'active';
    return 'recovery';
  }

  moveLength() {
    const m = this.move;
    return m.startup + m.active + m.recovery;
  }

  startMove(key, spec) {
    this.move = spec;
    this.moveKey = key;
    this.moveFrame = 0;
    this.hasHit = false;
    this.setState('attack');
    if (this.grounded) this.vx = 0;
  }
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function worldHitbox(f, hb) {
  const x = f.facing === 1 ? f.x + hb.x : f.x - hb.x - hb.w;
  return { x, y: f.y + hb.y, w: hb.w, h: hb.h };
}

export class Match {
  constructor({ p1, p2, winsNeeded = 2, roundTime = 60 }) {
    this.fighters = [new Fighter(p1, 0), new Fighter(p2, 1)];
    this.winsNeeded = winsNeeded;
    this.roundTime = roundTime;
    this.round = 1;
    this.projectiles = [];
    this.events = [];      // efectos visuales que consume el renderizador
    this.hitstop = 0;
    this.frame = 0;
    this.startRound();
  }

  startRound() {
    const [a, b] = this.fighters;
    a.reset(300, 1);
    b.reset(STAGE_W - 300, -1);
    this.projectiles = [];
    this.timer = this.roundTime * 60;
    this.phase = 'intro';
    this.phaseTime = 0;
    this.roundWinner = null;
    this.roundEndReason = null;
    this.matchWinner = null;
  }

  setPhase(p) { this.phase = p; this.phaseTime = 0; }

  step(inputs) {
    this.frame++;
    this.phaseTime++;

    if (this.hitstop > 0) { this.hitstop--; return; }

    const acting = this.phase === 'fight';
    const [a, b] = this.fighters;
    const ia = acting ? inputs[0] : EMPTY_INPUT;
    const ib = acting ? inputs[1] : EMPTY_INPUT;

    if (this.phase === 'intro' && this.phaseTime >= 110) this.setPhase('fight');

    // Orientación: se miran mutuamente cuando pueden actuar
    for (const [f, o] of [[a, b], [b, a]]) {
      if (f.canAct && f.grounded) f.facing = o.x >= f.x ? 1 : -1;
    }

    this.updateFighter(a, ia);
    this.updateFighter(b, ib);
    this.physics(a);
    this.physics(b);
    this.separate(a, b);

    if (this.phase === 'fight' || this.phase === 'ko') {
      this.checkMelee(a, b);
      this.checkMelee(b, a);
      this.updateProjectiles();
    }

    if (this.phase === 'fight') {
      this.timer--;
      if (a.hp <= 0 || b.hp <= 0) {
        this.endRound(a.hp <= 0 && b.hp <= 0 ? null : (a.hp <= 0 ? b : a), 'ko');
      } else if (this.timer <= 0) {
        const winner = a.hp === b.hp ? null : (a.hp > b.hp ? a : b);
        this.endRound(winner, 'time');
      }
    } else if (this.phase === 'ko' && this.phaseTime >= 160) {
      const champ = this.fighters.find(f => f.wins >= this.winsNeeded);
      if (champ) {
        this.matchWinner = champ;
        this.setPhase('matchover');
      } else {
        this.round++;
        this.startRound();
      }
    }
  }

  endRound(winner, reason) {
    this.roundWinner = winner;
    this.roundEndReason = reason;
    if (winner) winner.wins++;
    this.setPhase('ko');
    this.events.push({ type: 'roundEnd', reason });
  }

  updateFighter(f, inp) {
    f.stateTime++;
    for (const k of SKILL_KEYS) if (f.cooldowns[k] > 0) f.cooldowns[k]--;
    if (f.flash > 0) f.flash--;

    switch (f.state) {
      case 'ko':
        return;

      case 'hitstun':
      case 'blockstun':
        f.stun--;
        if (f.stun <= 0 && f.grounded) { f.setState('idle'); f.combo = 0; }
        return;

      case 'attack': {
        const m = f.move;
        if (m.dash && f.moveFrame >= m.dash.from && f.moveFrame < m.dash.to) {
          f.vx = f.facing * m.dash.speed;
          if (f.moveFrame % 4 === 0) this.events.push({ type: 'dust', x: f.x - f.facing * 20, y: f.y });
        } else if (f.grounded) {
          f.vx *= 0.6;
        }
        if (m.projectile && f.moveFrame === m.startup) this.spawnProjectile(f, m.projectile);
        if (m.anim === 'slam' && f.moveFrame === m.startup) {
          this.events.push({ type: 'slam', x: f.x + f.facing * 40, y: f.y });
        }
        f.moveFrame++;
        if (f.moveFrame >= f.moveLength()) {
          f.move = null;
          f.moveKey = null;
          f.setState(f.grounded ? 'idle' : 'jump');
        }
        return;
      }
    }

    // Estados libres: el jugador controla al personaje
    f.combo = 0;
    const toward = (inp.right && f.facing === 1) || (inp.left && f.facing === -1);
    const def = f.def;

    if (!f.grounded) {
      if (inp.lightP) f.startMove('light', def.attacks.light);
      else if (inp.heavyP) f.startMove('heavy', def.attacks.heavy);
      return;
    }

    if (inp.skillP) {
      const key = inp.down ? 'down' : (toward ? 'forward' : 'neutral');
      if (f.cooldowns[key] <= 0) {
        f.startMove(key, def.skills[key]);
        f.cooldowns[key] = def.skills[key].cooldown;
        return;
      }
    }
    if (inp.lightP) { f.startMove('light', def.attacks.light); return; }
    if (inp.heavyP) { f.startMove('heavy', def.attacks.heavy); return; }

    if (inp.block) { f.setState('block'); f.vx = 0; return; }

    if (inp.up) {
      const dir = inp.right ? 1 : inp.left ? -1 : 0;
      f.vy = def.jumpVel;
      f.vx = dir * def.walkSpeed * 1.15;
      f.y -= 1;
      f.setState('jump');
      return;
    }

    if (inp.down) { f.setState('crouch'); f.vx = 0; return; }

    const dir = inp.right ? 1 : inp.left ? -1 : 0;
    if (dir !== 0) {
      const backwards = dir !== f.facing;
      f.vx = dir * def.walkSpeed * (backwards ? 0.8 : 1);
      f.setState('walk');
    } else {
      f.vx = 0;
      f.setState('idle');
    }
  }

  physics(f) {
    if (!f.grounded || f.vy < 0) {
      f.vy += f.def.gravity;
      f.y += f.vy;
      if (f.y >= GROUND) {
        f.y = GROUND;
        f.vy = 0;
        this.events.push({ type: 'dust', x: f.x, y: f.y });
        if (f.state === 'jump') f.setState('idle');
        if (f.state === 'attack' && f.move && !f.move.dash) {
          // Aterrizar cancela el ataque aéreo
          f.move = null;
          f.setState('idle');
        }
      }
    }
    f.x += f.vx;
    if (f.grounded && ['hitstun', 'blockstun', 'ko'].includes(f.state)) f.vx *= 0.85;
    const half = f.def.width / 2;
    f.x = Math.max(WALL + half, Math.min(STAGE_W - WALL - half, f.x));
  }

  separate(a, b) {
    const ha = a.hurtbox();
    const hb = b.hurtbox();
    if (!overlap(ha, hb)) return;
    const overlapX = Math.min(ha.x + ha.w, hb.x + hb.w) - Math.max(ha.x, hb.x);
    if (overlapX <= 0) return;
    const dir = a.x < b.x ? -1 : a.x > b.x ? 1 : (a.index === 0 ? -1 : 1);
    a.x += dir * overlapX / 2;
    b.x -= dir * overlapX / 2;
    for (const f of [a, b]) {
      const half = f.def.width / 2;
      f.x = Math.max(WALL + half, Math.min(STAGE_W - WALL - half, f.x));
    }
    // Si uno está contra la pared, empuja al otro entero
    const ha2 = a.hurtbox();
    const hb2 = b.hurtbox();
    const rest = Math.min(ha2.x + ha2.w, hb2.x + hb2.w) - Math.max(ha2.x, hb2.x);
    if (rest > 0 && overlap(ha2, hb2)) {
      const atWall = f => f.x <= WALL + f.def.width / 2 + 0.5 || f.x >= STAGE_W - WALL - f.def.width / 2 - 0.5;
      if (atWall(a)) b.x -= dir * rest;
      else if (atWall(b)) a.x += dir * rest;
    }
  }

  checkMelee(att, def) {
    if (att.state !== 'attack' || att.hasHit) return;
    const m = att.move;
    if (!m.hitbox || att.phase() !== 'active') return;
    if (m.groundOnly && !def.grounded) return;
    if (def.state === 'ko') return;
    const box = worldHitbox(att, m.hitbox);
    const hurt = def.hurtbox();
    if (!overlap(box, hurt)) return;
    att.hasHit = true;
    const hx = (Math.max(box.x, hurt.x) + Math.min(box.x + box.w, hurt.x + hurt.w)) / 2;
    const hy = (Math.max(box.y, hurt.y) + Math.min(box.y + box.h, hurt.y + hurt.h)) / 2;
    this.resolveHit(att, def, m, att.facing, false, hx, hy);
  }

  // Devuelve true si el golpe se ha consumido
  resolveHit(att, def, spec, dir, isProjectile, hx, hy) {
    // Contraataque (Kael): anula golpes cuerpo a cuerpo y responde
    if (def.state === 'attack' && def.move.counter && def.phase() === 'active') {
      if (isProjectile) {
        this.events.push({ type: 'text', text: '¡DESVIADO!', x: def.x, y: def.y - def.def.height - 20, color: '#bfe9ff' });
        this.events.push({ type: 'block', x: hx, y: hy });
        this.hitstop = 5;
        return true;
      }
      const c = def.move.counter;
      def.moveFrame = def.move.startup + def.move.active;
      this.events.push({ type: 'text', text: '¡CONTRA!', x: def.x, y: def.y - def.def.height - 20, color: '#7fe3ff' });
      this.applyDamage(def, att, { ...c, damage: c.damage }, def.facing, hx, hy, true);
      return true;
    }

    const facingAttack = def.facing === -dir;
    const blocking = def.state === 'block' && facingAttack;

    if (blocking && !spec.guardBreak) {
      def.setState('blockstun');
      def.stun = spec.blockstun ?? Math.round(spec.hitstun * 0.6);
      def.vx = dir * spec.push * 1.2;
      const chip = Math.round(spec.damage * 0.1);
      def.hp = Math.max(1, def.hp - chip);
      this.hitstop = Math.max(3, Math.round(spec.hitstop * 0.6));
      this.events.push({ type: 'block', x: hx, y: hy });
      return true;
    }

    // Blindaje (Brakka): recibe la mitad de daño y no se interrumpe
    if (def.state === 'attack' && def.move.armor &&
        def.moveFrame >= def.move.armor.from && def.moveFrame < def.move.armor.to) {
      const dmg = Math.round(spec.damage * 0.5);
      def.hp -= dmg;
      def.flash = 8;
      this.hitstop = spec.hitstop;
      this.events.push({ type: 'text', text: '¡BLINDAJE!', x: def.x, y: def.y - def.def.height - 20, color: '#ffc27a' });
      this.events.push({ type: 'hit', x: hx, y: hy, strength: 1, damage: dmg });
      if (def.hp <= 0) this.knockOut(def, dir);
      return true;
    }

    const broke = blocking && spec.guardBreak;
    if (broke) {
      this.events.push({ type: 'text', text: '¡GUARDIA ROTA!', x: def.x, y: def.y - def.def.height - 20, color: '#ff8a5c' });
    }
    this.applyDamage(att, def, spec, dir, hx, hy, false, broke ? 14 : 0);
    return true;
  }

  applyDamage(att, def, spec, dir, hx, hy, isCounter, extraStun = 0) {
    const scale = Math.max(0.35, 1 - def.combo * 0.12);
    const dmg = Math.round(spec.damage * scale);
    def.hp -= dmg;
    def.combo++;
    def.move = null;
    def.moveKey = null;
    def.setState('hitstun');
    def.stun = spec.hitstun + extraStun;
    def.vx = dir * spec.push;
    if (!def.grounded || spec.launch) def.vy = spec.launch ? -9 : -6;
    def.flash = 6;
    this.hitstop = spec.hitstop;
    const strength = spec.damage >= 100 ? 3 : spec.damage >= 65 ? 2 : 1;
    this.events.push({ type: 'hit', x: hx, y: hy, strength: isCounter ? 3 : strength, damage: dmg, combo: def.combo });
    if (def.hp <= 0) this.knockOut(def, dir);
  }

  knockOut(f, dir) {
    f.hp = 0;
    f.move = null;
    f.setState('ko');
    f.vy = -10;
    f.y -= 1;
    f.vx = dir * 6;
    this.hitstop = 22;
  }

  spawnProjectile(owner, p) {
    this.projectiles.push({
      owner: owner.index,
      x: owner.x + owner.facing * p.x,
      y: owner.y + p.y,
      vx: owner.facing * p.speed,
      w: p.w,
      h: p.h,
      life: p.life,
      age: 0,
      spec: p,
      dead: false,
    });
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.vx;
      p.life--;
      p.age++;
      if (p.life <= 0 || p.x < -60 || p.x > STAGE_W + 60) p.dead = true;
    }
    // Proyectiles enfrentados se anulan
    for (let i = 0; i < this.projectiles.length; i++) {
      for (let j = i + 1; j < this.projectiles.length; j++) {
        const a = this.projectiles[i];
        const b = this.projectiles[j];
        if (a.dead || b.dead || a.owner === b.owner) continue;
        if (overlap(projBox(a), projBox(b))) {
          a.dead = b.dead = true;
          this.events.push({ type: 'block', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const target = this.fighters[1 - p.owner];
      if (target.state === 'ko') continue;
      if (p.spec.groundOnly && !target.grounded) continue;
      const box = projBox(p);
      if (overlap(box, target.hurtbox())) {
        p.dead = true;
        this.resolveHit(this.fighters[p.owner], target, p.spec, Math.sign(p.vx), true, p.x, p.y);
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }
}

export function projBox(p) {
  return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
}

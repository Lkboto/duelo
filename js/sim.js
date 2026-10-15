// Simulación del combate. No toca el DOM ni dibuja nada: solo recibe
// entradas por frame y actualiza el estado. Con las mismas entradas da
// siempre el mismo resultado, que es lo que necesitará el online (rollback).

import { buildMoves } from './moves.js';

export const STAGE_W = 960;
export const STAGE_H = 540;
export const GROUND = 470;
const WALL = 30;

const FREE_STATES = ['idle', 'walk', 'crouch', 'block', 'jump'];
const SKILL_KEYS = ['neutral', 'forward', 'down'];
const DOUBLE_TAP = 14;   // frames para el doble toque del dash
const DOWN_TIME = 40;    // frames tendido en el suelo tras un derribo
const GETUP_TIME = 16;   // frames levantándose
const BUFFER = 10;       // frames que se recuerda una pulsación hecha antes de tiempo

export const EMPTY_INPUT = Object.freeze({
  up: false, down: false, left: false, right: false,
  light: false, heavy: false, skill: false, block: false,
  upP: false, downP: false, leftP: false, rightP: false,
  lightP: false, heavyP: false, skillP: false, blockP: false,
  dash: 0,
});

export class Fighter {
  constructor(def, index) {
    this.def = def;
    this.index = index;
    this.wins = 0;
    this.color = def.color;
    this.moves = buildMoves(def);
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
    this.lastHit = -99;
    this.stun = 0;
    this.combo = 0;
    this.flash = 0;
    this.knock = false;
    this.buffer = null;
    this.jumpBuf = -99;
    this.airJumps = def_airJumps(this.def);
    this.landT = 99;
    this.flipT = 99;
    this.dashDir = 0;
    this.tapDir = 0;
    this.tapFrame = -99;
    this.cooldowns = { neutral: 0, forward: 0, down: 0 };
  }

  get grounded() { return this.y >= GROUND && this.vy >= 0; }
  get canAct() { return FREE_STATES.includes(this.state); }

  setState(s) {
    if (this.state !== s) { this.state = s; this.stateTime = 0; }
  }

  hurtbox() {
    let h = this.def.height;
    if (this.state === 'crouch' || (this.state === 'attack' && this.move?.anim === 'sweepKick')) h *= 0.62;
    if (this.state === 'down' || this.state === 'ko') h = 30;
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

  get invulnerable() {
    if (this.state === 'down' || this.state === 'getup') return true;
    if (this.state === 'dash' && this.dashDir !== this.facing && this.stateTime < 9) return true;
    const m = this.move;
    return this.state === 'attack' && m && m.invuln && this.moveFrame >= m.invuln.from && this.moveFrame < m.invuln.to;
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
    this.lastHit = -99;
    this.setState('attack');
    if (this.grounded) this.vx = 0;
  }
}

function def_airJumps(def) { return def.airJumps ?? 1; }

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
    this.slowmo = 0;
    this.projectiles = [];
    this.events = [];      // efectos visuales que consume el renderizador
    this.hitstop = 0;
    this.frame = 0;
    this.tick = 0;
    this.startRound();
  }

  startRound() {
    const [a, b] = this.fighters;
    a.reset(300, 1);
    b.reset(STAGE_W - 300, -1);
    this.projectiles = [];
    this.prevPos = null;
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

    if (this.slowmo > 0) this.slowmo--;
    const acting = this.phase === 'fight';
    const [a, b] = this.fighters;
    const ia = acting ? inputs[0] : EMPTY_INPUT;
    const ib = acting ? inputs[1] : EMPTY_INPUT;
    // Las pulsaciones se recuerdan incluso durante la pausa de impacto
    this.recordInput(a, ia);
    this.recordInput(b, ib);

    if (this.hitstop > 0) { this.hitstop--; return; }
    this.tick++;

    if (this.phase === 'intro' && this.phaseTime >= 110) this.setPhase('fight');

    // Orientación: se miran mutuamente cuando pueden actuar
    for (const [f, o] of [[a, b], [b, a]]) {
      if (f.canAct && f.grounded) f.facing = o.x >= f.x ? 1 : -1;
    }

    this.updateFighter(a, ia, b);
    this.updateFighter(b, ib, a);
    this.physics(a);
    this.physics(b);
    this.separate(a, b);

    if (this.phase === 'fight' || this.phase === 'ko') {
      this.checkClash(a, b);
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
    if (reason === 'ko') this.slowmo = 50;
    this.events.push({ type: 'roundEnd', reason });
  }

  updateFighter(f, inp, opp) {
    f.stateTime++;
    if (f.landT < 99) f.landT++;
    if (f.flipT < 99) f.flipT++;
    for (const k of SKILL_KEYS) if (f.cooldowns[k] > 0) f.cooldowns[k]--;
    if (f.flash > 0) f.flash--;

    if (f.buffer && this.tick - f.buffer.tick > BUFFER) f.buffer = null;
    const req = f.buffer;
    const moves = f.moves;
    const def = f.def;

    switch (f.state) {
      case 'ko':
        return;

      case 'hitstun':
      case 'blockstun':
        f.stun--;
        if (f.stun <= 0 && f.grounded && !f.knock) { f.setState('idle'); f.combo = 0; }
        else return;
        break;

      case 'down':
        if (--f.stun <= 0) { f.setState('getup'); f.stun = GETUP_TIME; }
        return;

      case 'getup':
        if (--f.stun <= 0) { f.setState('idle'); f.combo = 0; f.knock = false; }
        return;

      case 'dash': {
        const back = f.dashDir !== f.facing;
        const t = f.stateTime;
        f.vx = f.dashDir * (back ? 10 : 12.5) * Math.max(0.15, 1 - t / 14);
        if (t % 3 === 0) this.events.push({ type: 'dust', x: f.x - f.dashDir * 16, y: f.y });
        if (t > 2 && req && (req.type === 'light' || req.type === 'heavy')) {
          const v = f.vx;
          if (req.type === 'light') f.startMove('dashLight', moves.dashLight);
          else f.startMove('heavy', moves.heavy);
          f.vx = v * (req.type === 'light' ? 0.9 : 0.6);
          f.buffer = null;
          return;
        }
        if (t >= 14) f.setState('idle');
        return;
      }

      case 'attack': {
        const m = f.move;
        const ph = f.phase();
        if (m.dash && f.moveFrame >= m.dash.from && f.moveFrame < m.dash.to) {
          f.vx = f.facing * m.dash.speed;
          if (f.moveFrame % 4 === 0) this.events.push({ type: 'dust', x: f.x - f.facing * 20, y: f.y });
        } else if (m.dive) {
          if (ph === 'startup') { f.vy = Math.min(f.vy, -1.5); f.vx *= 0.8; }
          else if (ph === 'active') { f.vy = m.dive; f.vx = f.facing * 3; }
        } else if (f.grounded) {
          if (m.step && f.moveFrame >= m.startup - 2 && f.moveFrame < m.startup + m.active) f.vx = f.facing * m.step;
          else f.vx *= m.keepMomentum ? 0.9 : 0.6;
        }
        if (m.hop && f.moveFrame === m.hop.at) { f.vy = m.hop.vy; f.y -= 1; }
        if (m.teleport && f.moveFrame === m.teleport.at) this.teleport(f, opp);
        if (m.heal && f.moveFrame === m.startup) {
          const before = f.hp;
          f.hp = Math.min(def.maxHp, f.hp + m.heal);
          this.events.push({ type: 'text', text: `+${f.hp - before}`, x: f.x, y: f.y - def.height - 20, color: '#5dff9d' });
          this.events.push({ type: 'heal', x: f.x, y: f.y - def.height / 2, color: f.color });
        }
        if (m.projectile && f.moveFrame === m.startup) this.spawnProjectile(f, m.projectile);
        if (m.anim === 'slam' && f.moveFrame === m.startup) {
          this.events.push({ type: 'slam', x: f.x + f.facing * 40, y: f.y });
        }

        // Cancelaciones: encadenar el combo, rematar con habilidad o saltar tras un lanzador
        if (req && this.tryCancel(f, m, ph, req, inp)) return;
        const wantsJump = inp.up || this.tick - f.jumpBuf <= BUFFER;
        if (m.jumpCancel && f.hasHit && ph !== 'startup' && wantsJump && f.grounded && f.moveFrame >= m.startup + 2) {
          f.jumpBuf = -99;
          f.move = null; f.moveKey = null;
          this.jump(f, inp);
          return;
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

    if (!f.grounded) {
      // Control en el aire y doble salto
      const dir = inp.right ? 1 : inp.left ? -1 : 0;
      f.vx += (dir * def.walkSpeed * 1.1 - f.vx) * (dir ? 0.12 : 0.03);
      if (req && req.type === 'light') { f.startMove('airLight', moves.airLight); f.buffer = null; return; }
      if (req && req.type === 'heavy') {
        f.startMove(req.down ? 'plunge' : 'airHeavy', req.down ? moves.plunge : moves.airHeavy);
        f.buffer = null;
        return;
      }
      if ((inp.upP || this.tick - f.jumpBuf <= 2) && f.airJumps > 0 && f.stateTime > 4) {
        f.jumpBuf = -99;
        f.airJumps--;
        f.vy = def.jumpVel * 0.88;
        if (dir) f.vx = dir * def.walkSpeed * 1.15;
        f.flipT = 0;
        this.events.push({ type: 'airjump', x: f.x, y: f.y });
      }
      return;
    }

    // Dash: doble toque de dirección (o petición directa del bot)
    const tap = inp.rightP ? 1 : inp.leftP ? -1 : 0;
    let dashDir = inp.dash || 0;
    if (tap) {
      if (tap === f.tapDir && this.frame - f.tapFrame <= DOUBLE_TAP) dashDir = tap;
      f.tapDir = tap;
      f.tapFrame = this.frame;
    }
    if (dashDir && !inp.down && !inp.block) {
      f.dashDir = dashDir;
      f.tapDir = 0;
      f.setState('dash');
      f.stateTime = 0;
      this.events.push({ type: 'dash', x: f.x, y: f.y, dir: dashDir, color: f.color });
      return;
    }

    if (req && this.startRequested(f, req)) return;

    if (inp.block) { f.setState('block'); f.vx = 0; return; }
    if (inp.up) { this.jump(f, inp); return; }
    if (inp.down) { f.setState('crouch'); f.vx *= 0.5; return; }

    // Caminar con una pequeña aceleración: arranques y frenadas suaves
    const dir = inp.right ? 1 : inp.left ? -1 : 0;
    const target = dir * def.walkSpeed * (dir && dir !== f.facing ? 0.8 : 1);
    f.vx += (target - f.vx) * 0.35;
    if (Math.abs(f.vx) < 0.15) f.vx = 0;
    f.setState(dir !== 0 ? 'walk' : 'idle');
  }

  // Búfer de entrada: una pulsación hecha un poco antes de tiempo no se pierde
  recordInput(f, inp) {
    const toward = (inp.right && f.facing === 1) || (inp.left && f.facing === -1);
    const press = inp.skillP ? 'skill' : inp.heavyP ? 'heavy' : inp.lightP ? 'light' : null;
    if (press) f.buffer = { type: press, down: inp.down, toward, tick: this.tick };
    if (inp.upP) f.jumpBuf = this.tick;
  }

  jump(f, inp) {
    const dir = inp.right ? 1 : inp.left ? -1 : 0;
    f.vy = f.def.jumpVel;
    f.vx = dir ? dir * f.def.walkSpeed * 1.15 : f.vx * 0.5;
    f.y -= 1;
    f.setState('jump');
    this.events.push({ type: 'dust', x: f.x, y: f.y });
  }

  // Empieza el golpe pedido desde un estado libre en el suelo
  startRequested(f, req) {
    const moves = f.moves;
    if (req.type === 'skill') {
      const key = req.down ? 'down' : (req.toward ? 'forward' : 'neutral');
      if (f.cooldowns[key] > 0) return false;
      f.startMove(key, f.def.skills[key]);
      f.cooldowns[key] = f.def.skills[key].cooldown;
    } else if (req.type === 'light') {
      if (req.down) f.startMove('sweep', moves.sweep);
      else f.startMove('light1', moves.light1);
    } else {
      if (req.down) f.startMove('launcher', moves.launcher);
      else f.startMove('heavy', moves.heavy);
    }
    f.buffer = null;
    return true;
  }

  // Ventanas de cancelación durante un ataque
  tryCancel(f, m, ph, req, inp) {
    const late = ph === 'recovery' || (ph === 'active' && f.hasHit);
    if (!late || !f.grounded) return false;
    // Siguiente golpe del combo (G, G, G)
    if (m.chain && req.type === 'light' && !req.down) {
      f.startMove(m.chain, f.moves[m.chain]);
      f.buffer = null;
      return true;
    }
    if (!f.hasHit) return false;
    // Tras acertar un golpe del combo se puede rematar con el fuerte o con una habilidad
    if (req.type === 'heavy' && (m.chain || f.moveKey === 'light3')) return this.startRequested(f, req);
    if (req.type === 'skill' && !SKILL_KEYS.includes(f.moveKey)) return this.startRequested(f, req);
    return false;
  }

  physics(f) {
    if (!f.grounded || f.vy < 0) {
      f.vy += f.def.gravity;
      f.y += f.vy;
      if (f.y >= GROUND) {
        f.y = GROUND;
        f.vy = 0;
        f.landT = 0;
        f.airJumps = def_airJumps(f.def);
        if (f.state === 'attack' && f.move?.dive) {
          f.moveFrame = Math.max(f.moveFrame, f.move.startup + f.move.active);
          this.events.push({ type: 'slam', x: f.x + f.facing * 10, y: f.y });
        }
        if (f.state === 'hitstun' && f.knock) {
          f.setState('down');
          f.stun = DOWN_TIME;
          f.vx *= 0.35;
          this.events.push({ type: 'thud', x: f.x, y: f.y });
        } else if (f.state === 'ko') {
          this.events.push({ type: 'thud', x: f.x, y: f.y });
        } else {
          this.events.push({ type: 'dust', x: f.x, y: f.y });
        }
        if (f.state === 'jump') f.setState('idle');
        if (f.state === 'attack' && f.move && !f.move.dash && !f.move.dive) {
          // Aterrizar cancela el ataque aéreo
          f.move = null;
          f.setState('idle');
        }
      }
    }
    f.x += f.vx;
    if (f.grounded && ['hitstun', 'blockstun', 'ko', 'down', 'getup'].includes(f.state)) f.vx *= 0.82;
    const half = f.def.width / 2;
    f.x = Math.max(WALL + half, Math.min(STAGE_W - WALL - half, f.x));
  }

  separate(a, b) {
    if (['down', 'ko'].includes(a.state) || ['down', 'ko'].includes(b.state)) return;
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
    if (att.state !== 'attack') return;
    const m = att.move;
    if (att.hasHit && !(m.rehit && att.moveFrame - att.lastHit >= m.rehit)) return;
    if (!m.hitbox || att.phase() !== 'active') return;
    if (m.groundOnly && !def.grounded) return;
    if (def.state === 'ko' || def.invulnerable) return;
    const box = worldHitbox(att, m.hitbox);
    const hurt = def.hurtbox();
    if (!overlap(box, hurt)) return;
    att.hasHit = true;
    att.lastHit = att.moveFrame;
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
    // Derribo: los golpes fuertes lanzan al rival, que cae y se queda tendido
    const knock = spec.knockdown || spec.launch || spec.damage >= 95 || isCounter || def.combo >= 5;
    if (knock) {
      def.knock = true;
      def.vy = spec.launch ? -11.5 : -7.5;
      // Los lanzadores suben al rival casi en vertical para poder seguirle en el aire
      def.vx = spec.launch ? dir * 1.2 : dir * Math.max(Math.abs(spec.push), 5) * 1.25 * (spec.push < 0 ? -1 : 1);
      def.y -= 1;
    } else if (!def.grounded) {
      def.vy = -6;
    }
    def.flash = 6;
    this.hitstop = spec.hitstop;
    if (spec.lifesteal && att.state !== 'ko') {
      const gain = Math.round(dmg * spec.lifesteal);
      att.hp = Math.min(att.def.maxHp, att.hp + gain);
      this.events.push({ type: 'text', text: `+${gain}`, x: att.x, y: att.y - att.def.height - 20, color: '#5dff9d' });
    }
    const strength = spec.damage >= 100 ? 3 : spec.damage >= 65 ? 2 : 1;
    this.events.push({ type: 'hit', x: hx, y: hy, dir, strength: isCounter || knock ? Math.max(strength, 2) + (isCounter ? 1 : 0) : strength, damage: dmg, combo: def.combo, knock });
    if (def.hp <= 0) this.knockOut(def, dir);
  }

  knockOut(f, dir) {
    f.hp = 0;
    f.move = null;
    f.setState('ko');
    f.vy = -11;
    f.y -= 1;
    f.vx = dir * 8;
    this.hitstop = 24;
  }

  // Si dos golpes cuerpo a cuerpo se cruzan, las armas chocan y nadie recibe daño
  checkClash(a, b) {
    const live = f => f.state === 'attack' && !f.hasHit && f.move.hitbox && f.phase() === 'active';
    if (!live(a) || !live(b)) return;
    const ba = worldHitbox(a, a.move.hitbox);
    const bb = worldHitbox(b, b.move.hitbox);
    if (!overlap(ba, bb)) return;
    for (const [f, o] of [[a, b], [b, a]]) {
      f.hasHit = true;
      f.moveFrame = f.move.startup + f.move.active;
      f.vx = (f.x < o.x ? -1 : 1) * 7;
    }
    const x = (Math.max(ba.x, bb.x) + Math.min(ba.x + ba.w, bb.x + bb.w)) / 2;
    const y = (Math.max(ba.y, bb.y) + Math.min(ba.y + ba.h, bb.y + bb.h)) / 2;
    this.hitstop = 10;
    this.events.push({ type: 'clash', x, y });
    this.events.push({ type: 'text', text: '¡CHOQUE!', x, y: y - 50, color: '#ffffff' });
  }

  teleport(f, opp) {
    const side = opp.x >= f.x ? 1 : -1;
    const half = f.def.width / 2;
    let nx = opp.x + side * (opp.def.width / 2 + half + 18);
    if (nx < WALL + half || nx > STAGE_W - WALL - half) nx = opp.x - side * (opp.def.width / 2 + half + 18);
    this.events.push({ type: 'teleport', x: f.x, y: f.y - f.def.height / 2, color: f.color });
    f.x = Math.max(WALL + half, Math.min(STAGE_W - WALL - half, nx));
    f.facing = opp.x >= f.x ? 1 : -1;
    this.events.push({ type: 'teleport', x: f.x, y: f.y - f.def.height / 2, color: f.color });
  }

  spawnProjectile(owner, spec) {
    if (Array.isArray(spec)) { for (const s of spec) this.spawnProjectile(owner, s); return; }
    const p = spec;
    if (p.unique) this.projectiles = this.projectiles.filter(q => !(q.owner === owner.index && q.spec === p));
    this.projectiles.push({
      owner: owner.index,
      facing: owner.facing,
      x: owner.x + owner.facing * p.x,
      y: owner.y + p.y,
      vx: owner.facing * p.speed,
      vy: p.vy || 0,
      g: p.g || 0,
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
      p.y += p.vy;
      p.vy += p.g;
      p.life--;
      p.age++;
      if (p.life <= 0 || p.x < -60 || p.x > STAGE_W + 60) p.dead = true;
      if (p.g && p.vy > 0 && p.y >= GROUND - p.h / 2) {
        p.dead = true;
        this.events.push({ type: 'dust', x: p.x, y: GROUND });
      }
    }
    // Proyectiles enfrentados se anulan
    for (let i = 0; i < this.projectiles.length; i++) {
      for (let j = i + 1; j < this.projectiles.length; j++) {
        const a = this.projectiles[i];
        const b = this.projectiles[j];
        if (a.dead || b.dead || a.owner === b.owner || a.vx === 0 || b.vx === 0) continue;
        if (overlap(projBox(a), projBox(b))) {
          a.dead = b.dead = true;
          this.events.push({ type: 'block', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const target = this.fighters[1 - p.owner];
      if (target.state === 'ko' || target.invulnerable) continue;
      if (p.spec.groundOnly && !target.grounded) continue;
      const box = projBox(p);
      if (overlap(box, target.hurtbox())) {
        p.dead = true;
        const dir = p.vx !== 0 ? Math.sign(p.vx) : (target.x >= p.x ? 1 : -1);
        this.resolveHit(this.fighters[p.owner], target, p.spec, dir, true, p.x, p.y);
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }
}

export function projBox(p) {
  return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c =>
    Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt));
  return '#' + ch.map(c => c.toString(16).padStart(2, '0')).join('');
}

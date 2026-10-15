// IA del bot. Genera las MISMAS entradas que un jugador (botones virtuales),
// así el personaje funciona igual lo controle una persona, el bot o la red.

import { EMPTY_INPUT } from './sim.js';

export const DIFFICULTIES = {
  facil:   { label: 'Fácil',   reaction: 26, block: 0.2,  aggression: 0.35, error: 0.25, think: [22, 40] },
  normal:  { label: 'Normal',  reaction: 15, block: 0.5,  aggression: 0.6,  error: 0.1,  think: [12, 26] },
  dificil: { label: 'Difícil', reaction: 7,  block: 0.82, aggression: 0.85, error: 0.03, think: [6, 14] },
};

// Generador aleatorio con semilla (determinista)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Bot {
  constructor(level = 'normal', seed = 12345) {
    this.cfg = DIFFICULTIES[level] || DIFFICULTIES.normal;
    this.rng = mulberry32(seed);
    this.history = [];
    this.intent = null;
    this.timer = 0;
    this.lastPress = 0;
  }

  rand(a, b) { return a + this.rng() * (b - a); }

  snapshot(match, me, opp) {
    const incoming = match.projectiles.some(p =>
      p.owner === opp.index && Math.sign(p.vx) === Math.sign(me.x - p.x) && Math.abs(me.x - p.x) < 260);
    const ph = opp.phase();
    return {
      oppState: opp.state,
      oppAttacking: opp.state === 'attack' && (ph === 'startup' || ph === 'active') && !opp.move?.counter,
      oppCountering: opp.state === 'attack' && !!opp.move?.counter,
      oppStunned: opp.state === 'hitstun' && !opp.knock,
      oppDown: opp.state === 'down' || opp.state === 'getup' || (opp.state === 'hitstun' && opp.knock),
      oppRecovering: opp.state === 'attack' && ph === 'recovery',
      oppAir: !opp.grounded,
      dist: Math.abs(opp.x - me.x),
      incoming,
    };
  }

  getInput(match, me, opp) {
    this.history.push(this.snapshot(match, me, opp));
    if (this.history.length > 60) this.history.shift();
    if (match.phase !== 'fight') { this.intent = null; return EMPTY_INPUT; }

    const seen = this.history[Math.max(0, this.history.length - 1 - this.cfg.reaction)];

    // Reacciones urgentes (con retraso de reacción ya aplicado en "seen")
    const threatened = (seen.oppAttacking && seen.dist < 210) || seen.incoming;
    if (threatened && me.canAct && this.intent?.kind !== 'block' && this.intent?.kind !== 'react') {
      if (this.rng() < this.cfg.block * 0.12) {
        // Solo intenta reaccionar en algunos frames para no ser perfecto
        if (seen.incoming && this.rng() < 0.4) this.setIntent('react', { up: true, toward: true }, 2, null);
        else this.setIntent('block', { block: true }, Math.round(this.rand(14, 26)), null);
      }
    }

    if (!this.intent || this.timer <= 0) this.decide(me, opp, seen);
    this.timer--;
    return this.build(me);
  }

  setIntent(kind, hold, frames, press) {
    this.intent = { kind, hold, press, pressed: false };
    this.timer = frames;
  }

  decide(me, opp, seen) {
    const c = this.cfg;
    const r = this.rng();
    const dist = Math.abs(opp.x - me.x);
    const reach = m => m.hitbox ? m.hitbox.x + m.hitbox.w + opp.def.width / 2 - 6 : (m.projectile ? 600 : 0);
    const lightRange = reach(me.def.attacks.light);
    const heavyRange = reach(me.def.attacks.heavy);
    const sk = me.def.skills;
    const ready = k => me.cooldowns[k] <= 0;
    const ranged = !!me.def.ranged;
    const think = Math.round(this.rand(c.think[0], c.think[1]));

    if (!me.canAct) { this.setIntent('wait', {}, 2, null); return; }

    // Error aleatorio: hace algo poco óptimo
    if (r < c.error) {
      const opts = [['wait', {}, null], ['retreat', { away: true }, null], ['jump', { up: true }, null], ['crouch', { down: true }, null]];
      const [k, h, p] = opts[Math.floor(this.rng() * opts.length)];
      this.setIntent(k, h, think, p);
      return;
    }

    // Curarse si va mal de vida y hay espacio
    if (sk.down.heal && ready('down') && me.hp < me.def.maxHp * 0.6 && dist > 260 && this.rng() < 0.5) {
      this.setIntent('skill', { down: true }, 8, 'skill');
      return;
    }

    // Personajes a distancia: alejarse si el rival se acerca demasiado
    if (ranged && dist < 150 && this.rng() < 0.45) {
      if (sk.forward.teleport && !sk.forward.hitbox && ready('forward')) this.setIntent('skill', { toward: true }, 8, 'skill');
      else this.setIntent('retreat', { away: true }, think, null);
      return;
    }

    // Castigar al rival si está aturdido o recuperándose
    if ((seen.oppStunned || seen.oppRecovering) && dist < heavyRange) {
      const p = dist < lightRange ? 'light' : 'heavy';
      this.setIntent('punish', {}, 6, p);
      return;
    }

    // Rival derribado: acercarse y esperar a que se levante
    if (seen.oppDown) {
      if (dist > lightRange + 20 && !ranged) this.setIntent('approach', { toward: true }, 8, null);
      else this.setIntent('wait', {}, 8, null);
      return;
    }

    // No atacar a un rival que está contraatacando
    if (seen.oppCountering && dist < 200) {
      this.setIntent('wait', {}, 10, null);
      return;
    }

    if (dist > 320) {
      if (ready('neutral') && this.rng() < c.aggression * 0.45) {
        this.setIntent('skill', {}, 8, 'skill');
      } else if (ranged && me.def.attacks.heavy.projectile && this.rng() < c.aggression * 0.5) {
        this.setIntent('attack', {}, 8, 'heavy');
      } else if (ranged && this.rng() < 0.5) {
        this.setIntent('wait', {}, think, null);
      } else if (!ranged && this.rng() < 0.35 + c.aggression * 0.2) {
        this.setIntent('dash', { dash: 1 }, 14, null);
      } else {
        this.setIntent('approach', { toward: true }, think + 10, null);
      }
      return;
    }

    if (dist > lightRange + 10) {
      const x = this.rng();
      const fwdUseful = sk.forward.hitbox || sk.forward.projectile;
      if (fwdUseful && ready('forward') && x < c.aggression * 0.25 && dist < 300) {
        this.setIntent('skill', { toward: true }, 8, 'skill');
      } else if (ready('neutral') && x < c.aggression * 0.35) {
        this.setIntent('skill', {}, 8, 'skill');
      } else if (x < 0.12 * c.aggression + 0.05) {
        this.setIntent('jump', { up: true, toward: true }, 3, null);
      } else if (x > 0.92 - (1 - c.aggression) * 0.15) {
        this.setIntent('retreat', { away: true }, think, null);
      } else if (dist < heavyRange && x < 0.5 * c.aggression) {
        this.setIntent('attack', {}, 8, 'heavy');
      } else {
        this.setIntent('approach', { toward: true }, think, null);
      }
      return;
    }

    // Cuerpo a cuerpo
    const x = this.rng();
    if (x < c.aggression * 0.45) this.setIntent('attack', {}, 6, 'light');
    else if (x < c.aggression * 0.65) this.setIntent('attack', {}, 8, 'heavy');
    else if (x < c.aggression * 0.75 && ready('down') && !sk.down.heal) this.setIntent('skill', { down: true }, 8, 'skill');
    else if (x < c.aggression * 0.82) this.setIntent('attack', { down: true }, 8, 'light');
    else if (x < 0.85) this.setIntent('block', { block: true }, think, null);
    else if (x < 0.92) this.setIntent('dash', { dash: -1 }, 14, null);
    else this.setIntent('retreat', { away: true }, think, null);
  }

  build(me) {
    const inp = { ...EMPTY_INPUT };
    const it = this.intent;
    if (!it) return inp;
    const h = it.hold;
    const towardKey = me.facing === 1 ? 'right' : 'left';
    const awayKey = me.facing === 1 ? 'left' : 'right';
    if (h.toward) inp[towardKey] = true;
    if (h.away) inp[awayKey] = true;
    if (h.up) inp.up = true;
    if (h.down) inp.down = true;
    if (h.block) inp.block = true;
    if (h.dash) { inp.dash = me.facing * h.dash; h.dash = 0; }
    if (it.press && !it.pressed && me.canAct) {
      inp[it.press] = true;
      inp[it.press + 'P'] = true;
      it.pressed = true;
    }
    if (h.up) { inp.upP = true; h.up = false; } // salto de un solo frame
    return inp;
  }
}

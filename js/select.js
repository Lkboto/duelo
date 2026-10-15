// Pantalla de selección de personaje: cuadrícula de retratos con
// previsualización animada de cada jugador.

import { CHARACTERS, CHARACTER_LIST } from './characters.js';
import { Fighter, GROUND, STAGE_W } from './sim.js';
import { drawFigure, hexA, BODY } from './render.js';
import { controlName } from './input.js';

const MOVE_KEYS = [['light', 'attacks'], ['heavy', 'attacks'], ['neutral', 'skills'], ['forward', 'skills'], ['down', 'skills']];

// Valores para las barras de estadísticas (1-5)
function stats(c) {
  const clamp = v => Math.max(1, Math.min(5, Math.round(v)));
  const reach = m => m.hitbox ? m.hitbox.x + m.hitbox.w : (m.projectile ? 220 : 60);
  const dmg = (c.attacks.light.damage || 0) + (c.attacks.heavy.damage || c.attacks.heavy.projectile?.damage || 0);
  const ranged = Object.values(c.skills).filter(s => s.projectile).length + (c.attacks.heavy.projectile ? 1 : 0);
  return [
    ['Vida', clamp((c.maxHp - 820) / 70)],
    ['Velocidad', clamp((c.walkSpeed - 2.6) / 0.5)],
    ['Daño', clamp((dmg - 100) / 22)],
    ['Alcance', clamp((Math.max(reach(c.attacks.light), reach(c.attacks.heavy)) - 50) / 22 + ranged * 0.6)],
  ];
}

export class CharacterSelect {
  constructor({ getBindings, onChange }) {
    this.getBindings = getBindings;
    this.onChange = onChange;
    this.mode = 'vsbot';
    this.picks = ['kael', 'random'];
    this.active = 0;
    this.hover = null;
    this.t = 0;
    this.roster = document.getElementById('roster');
    this.sides = [0, 1].map(i => {
      const el = document.getElementById(`side-${i}`);
      return { el, canvas: el.querySelector('canvas'), info: el.querySelector('.info'), fighter: null, shownId: null, nextMove: 90 };
    });
    this.sides.forEach((s, i) => s.el.addEventListener('click', () => {
      if (this.mode === 'local' && this.active !== i) { this.active = i; this.refresh(); }
    }));
    this.buildRoster();
  }

  open(mode) {
    this.mode = mode;
    if (mode === 'vsbot') this.picks[1] = 'random';
    this.active = 0;
    this.hover = null;
    document.getElementById('select-title').textContent = mode === 'vsbot' ? 'Elige tu luchador' : 'Elegid luchadores';
    document.getElementById('side-1-tag').textContent = mode === 'vsbot' ? 'Bot' : 'Jugador 2';
    document.getElementById('difficulty').classList.toggle('hidden', mode !== 'vsbot');
    this.refresh();
  }

  // Resuelve las elecciones "aleatorio" en personajes concretos
  resolve() {
    const rnd = () => CHARACTER_LIST[Math.floor(Math.random() * CHARACTER_LIST.length)].id;
    return this.picks.map((p, i) => (p === 'random' || (i === 1 && this.mode === 'vsbot')) ? rnd() : p);
  }

  buildRoster() {
    this.roster.innerHTML = '';
    this.tiles = [];
    for (const c of [...CHARACTER_LIST, null]) {
      const b = document.createElement('button');
      b.className = 'tile' + (c ? '' : ' random');
      const id = c ? c.id : 'random';
      if (c) {
        const cv = document.createElement('canvas');
        cv.width = 160; cv.height = 130;
        b.appendChild(cv);
        drawPortrait(cv, c);
        b.style.setProperty('--c', c.color);
      } else {
        const q = document.createElement('div');
        q.className = 'q';
        q.textContent = '?';
        b.appendChild(q);
      }
      const n = document.createElement('div');
      n.className = 'tn';
      n.textContent = c ? c.name : 'Aleatorio';
      b.appendChild(n);
      b.addEventListener('mouseenter', () => { this.hover = id; this.refresh(); });
      b.addEventListener('mouseleave', () => { if (this.hover === id) { this.hover = null; this.refresh(); } });
      b.addEventListener('click', () => this.pick(id));
      this.roster.appendChild(b);
      this.tiles.push({ id, el: b, color: c?.color });
    }
  }

  pick(id) {
    this.picks[this.active] = id;
    if (this.mode === 'local' && this.active === 0) this.active = 1;
    this.hover = null;
    this.refresh();
    this.onChange?.();
  }

  // Lo que muestra cada lado: si es el jugador activo y está pasando el ratón, el personaje bajo el cursor
  shown(i) {
    if (i === 1 && this.mode === 'vsbot') return 'random';
    if (i === this.active && this.hover) return this.hover;
    return this.picks[i];
  }

  refresh() {
    const turn = document.getElementById('select-turn');
    turn.textContent = this.mode === 'local' ? `Elige: Jugador ${this.active + 1}` : '';

    for (const t of this.tiles) {
      t.el.querySelectorAll('.badge').forEach(x => x.remove());
      const selected = [];
      if (this.picks[0] === t.id) selected.push(0);
      if (this.mode === 'local' && this.picks[1] === t.id) selected.push(1);
      for (const p of selected) {
        const b = document.createElement('span');
        b.className = `badge p${p + 1}`;
        b.textContent = `J${p + 1}`;
        t.el.appendChild(b);
      }
      const col = t.color || '#ffffff';
      t.el.style.borderColor = selected.length ? (selected.includes(0) ? 'var(--accent)' : '#8fd3ff') : '';
      t.el.style.background = selected.length ? hexA(col, 0.18) : '';
    }

    this.sides.forEach((s, i) => {
      s.el.classList.toggle('active', this.mode === 'local' && this.active === i);
      s.el.classList.toggle('clickable', this.mode === 'local');
      const id = this.shown(i);
      if (id !== s.shownId) {
        s.shownId = id;
        s.fighter = id === 'random' ? null : new Fighter(CHARACTERS[id], i);
        if (s.fighter) { s.fighter.x = STAGE_W / 2; s.fighter.facing = i === 0 ? 1 : -1; }
        s.nextMove = 50;
        this.renderInfo(i, id);
      }
    });
  }

  renderInfo(i, id) {
    const s = this.sides[i];
    if (id === 'random') {
      const bot = i === 1 && this.mode === 'vsbot';
      s.info.innerHTML = `
        <div><span class="nm">Aleatorio</span></div>
        <div class="ds">${bot ? 'El bot elegirá un luchador al azar en cada combate.' : 'Se elegirá un luchador al azar al empezar.'}</div>`;
      return;
    }
    const c = CHARACTERS[id];
    const b = this.getBindings()[i];
    const k = a => controlName(b[a]);
    const fwd = i === 0 ? '→' : '←';
    s.info.innerHTML = `
      <div><span class="nm" style="color:${c.color}">${c.name}</span><span class="wp">${c.weapon}</span></div>
      <div class="ds">${c.description}</div>
      <div class="stats">${stats(c).map(([n, v]) =>
        `<span>${n}</span><div class="bar">${[1, 2, 3, 4, 5].map(j => `<i style="${j <= v ? `background:${c.color}` : ''}"></i>`).join('')}</div>`).join('')}
      </div>
      <div class="moves">
        <kbd>${k('light')}</kbd><span>${c.attacks.light.name}</span>
        <kbd>↓+${k('light')}</kbd><span>Barrido</span>
        <kbd>${k('heavy')}</kbd><span>${c.attacks.heavy.name}</span>
        <kbd>${k('skill')}</kbd><span>${c.skills.neutral.name}</span>
        <kbd>${fwd}+${k('skill')}</kbd><span>${c.skills.forward.name}</span>
        <kbd>↓+${k('skill')}</kbd><span>${c.skills.down.name}</span>
      </div>`;
  }

  // Se llama cada frame mientras la pantalla está visible
  tick() {
    this.t++;
    this.sides.forEach((s, i) => {
      const ctx = s.canvas.getContext('2d');
      const W = s.canvas.width, H = s.canvas.height;
      ctx.clearRect(0, 0, W, H);
      const f = s.fighter;
      const col = f ? f.color : '#8a8494';
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#d2d2d2'); bg.addColorStop(1, '#b6b6b6');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, H * 0.6, 10, W / 2, H * 0.6, W * 0.5);
      g.addColorStop(0, hexA(col, 0.35));
      g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, H - 26, W, 26);

      if (!f) {
        // Ruleta de siluetas para "aleatorio"
        const c = CHARACTER_LIST[Math.floor(this.t / 8) % CHARACTER_LIST.length];
        const ghost = new Fighter({ ...c, color: '#7a7a7a' }, i);
        ghost.x = STAGE_W / 2;
        ghost.facing = i === 0 ? 1 : -1;
        ghost.stateTime = this.t;
        drawInto(ctx, ghost, this.t, W, H, 1.3, { body: '#8c8c8c' });
        ctx.font = '72px "Bebas Neue", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 8; ctx.strokeStyle = '#17131c';
        ctx.strokeText('?', W / 2, H * 0.45);
        ctx.fillStyle = '#fff';
        ctx.fillText('?', W / 2, H * 0.45);
        return;
      }

      // Hace un movimiento de demostración de vez en cuando
      f.stateTime++;
      if (f.state === 'attack') {
        f.moveFrame++;
        if (f.moveFrame >= f.moveLength()) { f.move = null; f.setState('idle'); }
      } else if (--s.nextMove <= 0) {
        const [key, group] = MOVE_KEYS[Math.floor(Math.random() * MOVE_KEYS.length)];
        f.startMove(key, f.def[group][key]);
        s.nextMove = 80 + Math.floor(Math.random() * 60);
      }
      drawInto(ctx, f, this.t, W, H, 1.3);
    });
  }
}

function drawInto(ctx, f, t, W, H, k, opts = {}) {
  f.y = GROUND;
  ctx.save();
  ctx.translate(W / 2 - f.x * k, H - 20 - GROUND * k);
  ctx.scale(k, k);
  drawFigure(ctx, f, t, opts);
  ctx.restore();
}

function drawPortrait(cv, def) {
  const ctx = cv.getContext('2d');
  const f = new Fighter(def, 0);
  f.x = STAGE_W / 2;
  f.facing = 1;
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, '#d4d4d4');
  g.addColorStop(1, '#b4b4b4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = hexA(def.color, 0.85);
  ctx.fillRect(0, cv.height - 8, cv.width, 8);
  ctx.save();
  const k = 1.15;
  ctx.translate(cv.width / 2 - f.x * k - 6, cv.height + 34 - GROUND * k);
  ctx.scale(k, k);
  drawFigure(ctx, f, 0, { noShadow: true });
  ctx.restore();
}

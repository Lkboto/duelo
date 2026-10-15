// Punto de entrada: menús, bucle principal a 60 frames por segundo fijos.

import { CHARACTERS, CHARACTER_LIST } from './characters.js';
import { Match } from './sim.js';
import { Bot, DIFFICULTIES } from './bot.js';
import { Input, ACTIONS, controlName } from './input.js';
import { Renderer } from './render.js';

const STEP = 1000 / 60;

const input = new Input();
const renderer = new Renderer(document.getElementById('canvas'));

const state = {
  screen: 'menu',
  mode: 'vsbot',            // 'vsbot' | 'local'
  picks: ['kael', 'brakka'],
  difficulty: 'normal',
  match: null,
  bot: null,
  paused: false,
  showHitboxes: false,
  resultShown: false,
  controlsReturn: 'menu',
  controlsPlayer: 0,
};

// ---------- Pantallas ----------
const screens = {
  menu: document.getElementById('screen-menu'),
  select: document.getElementById('screen-select'),
  controls: document.getElementById('screen-controls'),
  pause: document.getElementById('screen-pause'),
  result: document.getElementById('screen-result'),
};

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  state.screen = name || 'game';
  input.gameActive = !name;
}

function go(target) {
  switch (target) {
    case 'vsbot': state.mode = 'vsbot'; openSelect(); break;
    case 'local': state.mode = 'local'; openSelect(); break;
    case 'select': state.match = null; openSelect(); break;
    case 'controls': openControls(state.screen === 'pause' ? 'pause' : 'menu'); break;
    case 'menu': state.match = null; state.paused = false; show('menu'); break;
  }
}

document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

// ---------- Selección de personaje ----------
function openSelect() {
  document.getElementById('select-title').textContent = state.mode === 'vsbot' ? 'Contra bot' : '2 jugadores';
  document.getElementById('p2-title').textContent = state.mode === 'vsbot' ? 'Bot' : 'Jugador 2';
  document.getElementById('difficulty').classList.toggle('hidden', state.mode !== 'vsbot');
  renderCards();
  renderDifficulty();
  show('select');
}

function renderCards() {
  document.querySelectorAll('.cards').forEach(container => {
    const player = +container.dataset.player;
    container.innerHTML = '';
    for (const c of CHARACTER_LIST) {
      const b = document.createElement('button');
      b.className = 'card' + (state.picks[player] === c.id ? ' selected' : '');
      b.innerHTML = `
        <div class="swatch" style="background:linear-gradient(135deg, ${c.color}, ${c.dark})">${c.name[0]}</div>
        <div>
          <div><span class="name">${c.name}</span><span class="weapon">${c.weapon}</span></div>
          <div class="desc">${c.description}</div>
          <div class="skills">${c.skills.neutral.name} · ${c.skills.forward.name} · ${c.skills.down.name}</div>
        </div>`;
      b.addEventListener('click', () => { state.picks[player] = c.id; renderCards(); });
      container.appendChild(b);
    }
  });
}

function renderDifficulty() {
  const seg = document.querySelector('#difficulty .seg');
  seg.innerHTML = '';
  for (const [id, d] of Object.entries(DIFFICULTIES)) {
    const b = document.createElement('button');
    b.textContent = d.label;
    b.className = state.difficulty === id ? 'selected' : '';
    b.addEventListener('click', () => { state.difficulty = id; renderDifficulty(); });
    seg.appendChild(b);
  }
}

document.getElementById('btn-fight').addEventListener('click', startMatch);

function startMatch() {
  state.match = new Match({ p1: CHARACTERS[state.picks[0]], p2: CHARACTERS[state.picks[1]] });
  state.bot = state.mode === 'vsbot' ? new Bot(state.difficulty, (Math.random() * 1e9) | 0) : null;
  state.paused = false;
  state.resultShown = false;
  renderer.trail = [null, null];
  show(null);
}

// ---------- Controles ----------
function openControls(returnTo) {
  state.controlsReturn = returnTo;
  renderBinds();
  setNotice('');
  show('controls');
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  if (input.listening) return;
  state.controlsPlayer = +t.dataset.player;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  renderBinds();
  setNotice('');
}));

function setNotice(text) {
  document.getElementById('bind-notice').innerHTML = text || '&nbsp;';
}

function renderBinds(flashAction = null) {
  const container = document.getElementById('binds');
  const p = state.controlsPlayer;
  container.innerHTML = '';
  for (const a of ACTIONS) {
    const b = document.createElement('button');
    b.className = 'bind' + (flashAction === a.id ? ' flash' : '');
    b.innerHTML = `<span>${a.label}</span><span class="key">${controlName(input.bindings[p][a.id])}</span>`;
    b.addEventListener('click', () => {
      if (input.listening) return;
      document.querySelectorAll('.bind').forEach(x => x.classList.remove('listening', 'flash'));
      b.classList.add('listening');
      b.querySelector('.key').textContent = 'Pulsa…';
      setNotice('Pulsa una tecla o un botón del ratón · <kbd>Esc</kbd> para cancelar');
      input.listen(p, a.id, res => {
        if (res.cancelled) { renderBinds(); setNotice('Cancelado'); return; }
        if (res.rejected) {
          renderBinds();
          setNotice(`<b>${controlName(res.rejected)}</b> está reservada y no se puede asignar`);
          return;
        }
        renderBinds(a.id);
        if (res.swapped) {
          const other = ACTIONS.find(x => x.id === res.swapped.action).label;
          const who = res.swapped.player === p ? '' : ` del Jugador ${res.swapped.player + 1}`;
          setNotice(`${a.label}: <b>${controlName(res.code)}</b> · se ha intercambiado con «${other}»${who}`);
        } else {
          setNotice(`${a.label}: <b>${controlName(res.code)}</b>`);
        }
      });
    });
    container.appendChild(b);
  }
}

document.getElementById('btn-reset').addEventListener('click', () => {
  if (input.listening) return;
  input.resetDefaults();
  renderBinds();
  setNotice('Controles restaurados');
});

document.getElementById('btn-controls-back').addEventListener('click', () => {
  if (input.listening) return;
  closeControls();
});

function closeControls() {
  show(state.controlsReturn);
}

// ---------- Pausa y resultado ----------
document.getElementById('btn-resume').addEventListener('click', resume);
document.getElementById('btn-quit').addEventListener('click', () => go('menu'));
document.getElementById('btn-rematch').addEventListener('click', startMatch);
document.getElementById('chk-hitboxes').addEventListener('change', e => { state.showHitboxes = e.target.checked; });

function pause() {
  if (!state.match || state.screen !== 'game') return;
  state.paused = true;
  show('pause');
}

function resume() {
  state.paused = false;
  show(null);
}

window.addEventListener('keydown', e => {
  if (e.code !== 'Escape' || e.repeat) return;
  if (state.screen === 'game') pause();
  else if (state.screen === 'pause') resume();
  else if (state.screen === 'controls') closeControls();
  else if (state.screen === 'select') go('menu');
});

function showResult() {
  const m = state.match;
  const w = m.matchWinner;
  let title = `¡Gana ${w.def.name}!`;
  if (state.mode === 'vsbot') title = w.index === 0 ? '¡Victoria!' : 'Derrota';
  document.getElementById('result-title').textContent = title;
  const [a, b] = m.fighters;
  document.getElementById('result-sub').textContent =
    `${a.def.name} ${a.wins} – ${b.wins} ${b.def.name}` +
    (state.mode === 'vsbot' ? ` · Bot ${DIFFICULTIES[state.difficulty].label.toLowerCase()}` : '');
  show('result');
}

// ---------- Bucle principal ----------
let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.min(100, now - last);
  last = now;

  while (acc >= STEP) {
    const m = state.match;
    if (m && state.screen === 'game' && !state.paused) {
      const i1 = input.poll(0);
      const i2 = state.bot ? state.bot.getInput(m, m.fighters[1], m.fighters[0]) : input.poll(1);
      input.endPoll();
      m.step([i1, i2]);
      if (m.phase === 'matchover' && m.phaseTime > 100 && !state.resultShown) {
        state.resultShown = true;
        showResult();
      }
    } else {
      input.endPoll();
    }
    acc -= STEP;
  }

  const m = state.match;
  if (m) renderer.consume(m.events);
  renderer.draw(m, {
    showHitboxes: state.showHitboxes,
    bindings: input.bindings,
    botIndex: state.bot ? 1 : -1,
    labels: state.mode === 'vsbot'
      ? ['Tú', `Bot ${DIFFICULTIES[state.difficulty].label.toLowerCase()}`]
      : ['Jugador 1', 'Jugador 2'],
  });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Exponer para depuración desde la consola
window.duelo = { state, input };

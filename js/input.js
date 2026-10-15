'use strict';
// ─────────────────────────────────────────────────────────────
//  Entrada: teclado, ratón y mandos. Cada jugador lee un
//  "controlador virtual" con held / pressed, igual que los bots.
// ─────────────────────────────────────────────────────────────

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'light', 'heavy', 'skill1', 'skill2', 'dash'];

const ACTION_LABELS = {
  left: 'Izquierda', right: 'Derecha', up: 'Arriba (apuntar)', down: 'Abajo / agacharse',
  jump: 'Saltar', light: 'Ataque ligero', heavy: 'Ataque fuerte',
  skill1: 'Habilidad 1', skill2: 'Habilidad 2', dash: 'Esquiva / dash',
};

const DEFAULT_BINDINGS = {
  kb1: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['KeyW', 'Space'], light: ['KeyG', 'Mouse0'], heavy: ['KeyH', 'Mouse2'],
    skill1: ['KeyJ'], skill2: ['KeyL'], dash: ['KeyK', 'ShiftLeft'],
  },
  kb2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['ArrowUp'], light: ['Comma', 'Numpad1'], heavy: ['Period', 'Numpad2'],
    skill1: ['Slash', 'Numpad3'], skill2: ['Semicolon', 'Numpad6'], dash: ['ShiftRight', 'Numpad0'],
  },
};

// Mando estándar (Xbox / PlayStation con mapping "standard")
const PAD_MAP = {
  jump: [0], light: [2], heavy: [1], skill1: [3], skill2: [5], dash: [4, 6, 7],
};

function keyLabel(code) {
  if (!code) return '—';
  const map = {
    Space: 'Espacio', ShiftLeft: 'Shift izq', ShiftRight: 'Shift der', ControlLeft: 'Ctrl izq',
    ControlRight: 'Ctrl der', AltLeft: 'Alt', AltRight: 'Alt Gr', ArrowLeft: '←', ArrowRight: '→',
    ArrowUp: '↑', ArrowDown: '↓', Enter: 'Intro', Backspace: 'Retroceso', Tab: 'Tab',
    Mouse0: 'Clic izq', Mouse1: 'Clic central', Mouse2: 'Clic der', Mouse3: 'Ratón 4', Mouse4: 'Ratón 5',
    Comma: ',', Period: '.', Slash: '-', Semicolon: 'Ñ', Quote: '´', BracketLeft: '`', BracketRight: '+',
    Backslash: 'Ç', Minus: "'", Equal: '¡', IntlBackslash: '<',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

const Input = {
  down: new Set(),
  tapped: new Set(),
  bindings: null,
  captureCb: null,          // para el panel de reasignar teclas
  padPrev: {},              // estado anterior de cada mando
  padState: {},             // estado actual {held:{}, pressed:{}}
  menuTapped: new Set(),    // teclas pulsadas desde el último fotograma (menús)
  padMenu: {},              // flancos de botones de mando para los menús
  lastDevice: 'kb',         // último dispositivo usado (para los textos de ayuda)

  init(canvas) {
    const saved = Store.get('bindings', null);
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    if (saved) {
      for (const k of ['kb1', 'kb2']) {
        if (saved[k]) for (const a of ACTIONS) if (Array.isArray(saved[k][a])) this.bindings[k][a] = saved[k][a];
      }
    }

    const press = (code, e) => {
      if (this.captureCb) {
        e && e.preventDefault();
        const cb = this.captureCb; this.captureCb = null;
        cb(code);
        return;
      }
      if (!this.down.has(code)) { this.tapped.add(code); this.menuTapped.add(code); }
      this.down.add(code);
      this.lastDevice = 'kb';
    };
    const release = (code) => this.down.delete(code);

    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && !this.captureCb) {
        if (e.code === 'Escape' || e.code === 'Enter') this.menuTapped.add(e.code);
        return;
      }
      // los menús gestionan Intro/Espacio ellos mismos (evita el doble clic nativo)
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.repeat) { if (this.isGameKey(e.code)) e.preventDefault(); return; }
      if (this.isGameKey(e.code) || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      press(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      const tag = e.target && e.target.tagName;
      if (e.code === 'Space' && tag !== 'INPUT') e.preventDefault();
      release(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('mousedown', (e) => { press('Mouse' + e.button, e); });
    // al reasignar controles también se aceptan los botones del ratón
    window.addEventListener('mousedown', (e) => {
      if (this.captureCb && e.target !== canvas) { e.preventDefault(); press('Mouse' + e.button, e); }
    }, true);
    window.addEventListener('mouseup', (e) => release('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  isGameKey(code) {
    for (const k of ['kb1', 'kb2']) for (const a of ACTIONS) if (this.bindings[k][a].includes(code)) return true;
    return false;
  },

  saveBindings() { Store.set('bindings', this.bindings); },
  resetBindings() {
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.saveBindings();
  },

  pollPads() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    for (let i = 0; i < 4; i++) {
      const p = pads[i];
      if (!p || !p.connected) { this.padState[i] = null; continue; }
      const prev = this.padPrev[i] || {};
      const held = {};
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const b = (n) => p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.5);
      held.left = ax < -0.4 || b(14);
      held.right = ax > 0.4 || b(15);
      held.up = ay < -0.5 || b(12);
      held.down = ay > 0.5 || b(13);
      for (const a in PAD_MAP) held[a] = PAD_MAP[a].some(b);
      held.start = b(9);
      const old = this.padState[i];
      const pressed = old ? old.pressed : {};
      const menu = this.padMenu[i] || (this.padMenu[i] = {});
      for (const a in held) {
        const edge = held[a] && !prev[a];
        if (edge) this.lastDevice = 'pad';
        pressed[a] = pressed[a] || edge;
        menu[a] = menu[a] || edge;
      }
      this.padPrev[i] = held;
      this.padState[i] = { held, pressed, id: p.id, pad: p };
    }
  },

  padConnected(i) { return !!this.padState[i]; },

  rumble(i, strong = 0.5, weak = 0.5, ms = 80) {
    const s = this.padState[i];
    if (!s || !s.pad || !s.pad.vibrationActuator) return;
    try {
      s.pad.vibrationActuator.playEffect('dual-rumble', {
        duration: ms, strongMagnitude: strong, weakMagnitude: weak,
      });
    } catch (e) {}
  },

  // Lee un controlador de teclado ('kb1'/'kb2'), mando ('pad0'...) o
  // 'any' (ambos teclados + todos los mandos: modos de un solo jugador)
  read(source, out) {
    if (source === 'any') {
      const tmp = this._tmp || (this._tmp = { held: {}, pressed: {} });
      for (const a of ACTIONS) { out.held[a] = false; out.pressed[a] = false; }
      out.held.start = false; out.pressed.start = false;
      for (const src of ['kb1', 'kb2', 'pad0', 'pad1', 'pad2', 'pad3']) {
        if (src.startsWith('pad') && !this.padState[+src.slice(3)]) continue;
        this.read(src, tmp);
        for (const a in tmp.held) { out.held[a] = out.held[a] || tmp.held[a]; out.pressed[a] = out.pressed[a] || tmp.pressed[a]; }
      }
      return out;
    }
    if (source === 'kb1' || source === 'kb2') {
      const map = this.bindings[source];
      for (const a of ACTIONS) {
        const codes = map[a];
        let h = false, p = false;
        for (const c of codes) {
          if (this.down.has(c)) h = true;
          if (this.tapped.has(c)) p = true;
        }
        out.held[a] = h || p;
        out.pressed[a] = p;
      }
      out.held.start = this.down.has('Escape');
      out.pressed.start = this.tapped.has('Escape');
    } else if (source && source.startsWith('pad')) {
      const s = this.padState[+source.slice(3)];
      for (const a of ACTIONS) { out.held[a] = !!(s && s.held[a]); out.pressed[a] = !!(s && s.pressed[a]); }
      out.held.start = !!(s && s.held.start); out.pressed.start = !!(s && s.pressed.start);
    }
    return out;
  },

  endTick() {
    this.tapped.clear();
    for (let i = 0; i < 4; i++) if (this.padState[i]) this.padState[i].pressed = {};
  },
  clearMenu() { this.menuTapped.clear(); this.padMenu = {}; },

  // Entradas comprimidas en un entero (online): 10 bits mantenidos + 10 pulsados
  encode(c) {
    let m = 0;
    for (let i = 0; i < ACTIONS.length; i++) {
      if (c.held[ACTIONS[i]]) m |= 1 << i;
      if (c.pressed[ACTIONS[i]]) m |= 1 << (i + 10);
    }
    return m;
  },
  decode(m, c) {
    for (let i = 0; i < ACTIONS.length; i++) {
      c.held[ACTIONS[i]] = !!(m & (1 << i));
      c.pressed[ACTIONS[i]] = !!(m & (1 << (i + 10)));
    }
    return c;
  },

  // Navegación genérica de menús: cualquier teclado o mando
  menu() {
    const t = this.menuTapped;
    const ev = { up: false, down: false, left: false, right: false, ok: false, back: false, pause: false };
    const has = (...codes) => codes.some((c) => t.has(c));
    ev.up = has('ArrowUp', 'KeyW');
    ev.down = has('ArrowDown', 'KeyS');
    ev.left = has('ArrowLeft', 'KeyA');
    ev.right = has('ArrowRight', 'KeyD');
    ev.ok = has('Enter', 'Space', 'KeyG', 'NumpadEnter');
    ev.back = has('Escape', 'Backspace');
    ev.pause = has('Escape', 'KeyP');
    for (let i = 0; i < 4; i++) {
      const s = this.padMenu[i];
      if (!s) continue;
      ev.up = ev.up || s.up; ev.down = ev.down || s.down;
      ev.left = ev.left || s.left; ev.right = ev.right || s.right;
      ev.ok = ev.ok || s.jump || s.light;
      ev.back = ev.back || s.heavy;
      ev.pause = ev.pause || s.start;
    }
    return ev;
  },
  // Navegación de un jugador concreto (pantalla de selección)
  menuFor(source) {
    const ev = { up: false, down: false, left: false, right: false, ok: false, back: false };
    if (source === 'kb1' || source === 'kb2') {
      const map = this.bindings[source], t = this.menuTapped;
      const any = (a) => map[a].some((c) => t.has(c));
      ev.up = any('up'); ev.down = any('down'); ev.left = any('left'); ev.right = any('right');
      ev.ok = any('light') || (source === 'kb1' && t.has('Enter')) || (source === 'kb2' && t.has('NumpadEnter'));
      ev.back = any('heavy');
    } else if (source && source.startsWith('pad')) {
      const s = this.padMenu[+source.slice(3)];
      if (s) { ev.up = s.up; ev.down = s.down; ev.left = s.left; ev.right = s.right; ev.ok = s.jump || s.light; ev.back = s.heavy; }
    }
    return ev;
  },
};

// Controlador virtual que usan luchadores (humanos y bots)
class Controller {
  constructor(source) {
    this.source = source;      // 'kb1' | 'kb2' | 'pad0'.. | 'bot'
    this.held = {};
    this.pressed = {};
    for (const a of ACTIONS) { this.held[a] = false; this.pressed[a] = false; }
  }
  poll() {
    if (this.source !== 'bot' && this.source !== 'net' && this.source !== 'script') Input.read(this.source, this);
  }
  clear() { for (const a of ACTIONS) { this.held[a] = false; this.pressed[a] = false; } }
  get x() { return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0); }
  get y() { return (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0); }
}

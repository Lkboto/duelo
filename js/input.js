// Entrada de teclado y ratón con controles reasignables.
// El juego nunca pregunta por teclas concretas, sino por acciones
// ("¿está pulsado atacar?"). Cada control se guarda como "Key:KeyG" o "Mouse:2".

export const ACTIONS = [
  { id: 'up', label: 'Saltar' },
  { id: 'down', label: 'Agacharse' },
  { id: 'left', label: 'Izquierda' },
  { id: 'right', label: 'Derecha' },
  { id: 'light', label: 'Ataque ligero' },
  { id: 'heavy', label: 'Ataque fuerte' },
  { id: 'skill', label: 'Habilidad' },
  { id: 'block', label: 'Bloquear' },
];

export const DEFAULT_BINDINGS = [
  {
    up: 'Key:KeyW', down: 'Key:KeyS', left: 'Key:KeyA', right: 'Key:KeyD',
    light: 'Key:KeyG', heavy: 'Key:KeyH', skill: 'Key:KeyJ', block: 'Key:KeyL',
  },
  {
    up: 'Key:ArrowUp', down: 'Key:ArrowDown', left: 'Key:ArrowLeft', right: 'Key:ArrowRight',
    light: 'Key:Numpad1', heavy: 'Key:Numpad2', skill: 'Key:Numpad3', block: 'Key:Numpad0',
  },
];

// Teclas que no se pueden asignar (menú, recargar, herramientas…)
const RESERVED = new Set([
  'Key:Escape', 'Key:F5', 'Key:F11', 'Key:F12', 'Key:Tab',
  'Key:MetaLeft', 'Key:MetaRight', 'Key:ContextMenu',
]);

const STORAGE_KEY = 'duelo.bindings.v1';

const MOUSE_NAMES = ['Clic izq.', 'Clic central', 'Clic der.', 'Ratón atrás', 'Ratón adelante'];
const KEY_NAMES = {
  Space: 'Espacio', Enter: 'Intro', Backspace: 'Retroceso',
  ShiftLeft: 'Shift izq.', ShiftRight: 'Shift der.',
  ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.',
  AltLeft: 'Alt', AltRight: 'Alt Gr',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  CapsLock: 'Bloq Mayús', Semicolon: 'Ñ', Quote: '´', BracketLeft: '`',
  BracketRight: '+', Backslash: 'Ç', Comma: ',', Period: '.', Slash: '-',
  Minus: "'", Equal: '¡', Backquote: 'º', IntlBackslash: '<',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Intro',
  Insert: 'Insert', Delete: 'Supr', Home: 'Inicio', End: 'Fin',
  PageUp: 'Re Pág', PageDown: 'Av Pág',
};

export function controlName(code) {
  if (!code) return '—';
  const [kind, value] = code.split(':');
  if (kind === 'Mouse') return MOUSE_NAMES[+value] || `Ratón ${+value + 1}`;
  if (KEY_NAMES[value]) return KEY_NAMES[value];
  if (value.startsWith('Key')) return value.slice(3);
  if (value.startsWith('Digit')) return value.slice(5);
  if (value.startsWith('Numpad')) return 'Num ' + value.slice(6);
  return value;
}

function loadBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length === 2) {
      return saved.map((b, i) => ({ ...DEFAULT_BINDINGS[i], ...b }));
    }
  } catch { /* sin almacenamiento disponible */ }
  return DEFAULT_BINDINGS.map(b => ({ ...b }));
}

export class Input {
  constructor() {
    this.bindings = loadBindings();
    this.held = new Set();
    this.tapped = new Set();
    this.prev = [{}, {}];
    this.listening = null;   // { player, action, onDone }
    this.gameActive = false; // si es true, las teclas asignadas no hacen scroll, etc.
    this.attach();
  }

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings)); } catch { /* ignorar */ }
  }

  resetDefaults() {
    this.bindings = DEFAULT_BINDINGS.map(b => ({ ...b }));
    this.save();
  }

  isBound(code) {
    return this.bindings.some(b => Object.values(b).includes(code));
  }

  listen(player, action, onDone) {
    this.listening = { player, action, onDone };
  }

  cancelListen() {
    const l = this.listening;
    this.listening = null;
    l?.onDone?.({ cancelled: true });
  }

  // Asigna un control a una acción. Si ya lo usaba otra acción (de cualquier
  // jugador), se intercambian para que ninguna se quede sin control.
  assign(code) {
    const l = this.listening;
    if (!l) return;
    if (RESERVED.has(code)) {
      l.onDone?.({ rejected: code });
      return;
    }
    const old = this.bindings[l.player][l.action];
    let swapped = null;
    this.bindings.forEach((b, p) => {
      for (const a of Object.keys(b)) {
        if (b[a] === code && !(p === l.player && a === l.action)) {
          b[a] = old;
          swapped = { player: p, action: a };
        }
      }
    });
    this.bindings[l.player][l.action] = code;
    this.listening = null;
    this.held.clear();
    this.save();
    l.onDone?.({ code, swapped });
  }

  attach() {
    // Fase de captura: el panel de controles tiene prioridad sobre todo
    window.addEventListener('keydown', e => {
      if (this.listening) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code === 'Escape') this.cancelListen();
        else this.assign('Key:' + e.code);
        return;
      }
      const code = 'Key:' + e.code;
      if (this.gameActive && this.isBound(code)) e.preventDefault();
      if (e.repeat) return;
      this.held.add(code);
      this.tapped.add(code);
    }, true);

    window.addEventListener('keyup', e => {
      this.held.delete('Key:' + e.code);
    }, true);

    window.addEventListener('mousedown', e => {
      const code = 'Mouse:' + e.button;
      if (this.listening) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.assign(code);
        return;
      }
      if (e.button !== 0 || this.gameActive) e.preventDefault(); // evita autoscroll y selección
      this.held.add(code);
      this.tapped.add(code);
    }, true);

    window.addEventListener('mouseup', e => {
      this.held.delete('Mouse:' + e.button);
      // Los botones laterales hacen "Atrás/Adelante" en el navegador
      if (e.button === 3 || e.button === 4) e.preventDefault();
    }, true);

    window.addEventListener('auxclick', e => e.preventDefault(), true);
    window.addEventListener('contextmenu', e => e.preventDefault(), true);
    window.addEventListener('blur', () => this.held.clear());
  }

  poll(player) {
    const b = this.bindings[player];
    const prev = this.prev[player];
    const out = {};
    for (const { id } of ACTIONS) {
      const code = b[id];
      const down = this.held.has(code);
      out[id] = down;
      out[id + 'P'] = this.tapped.has(code) || (down && !prev[id]);
      prev[id] = down;
    }
    return out;
  }

  endPoll() {
    this.tapped.clear();
  }
}

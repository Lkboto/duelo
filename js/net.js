'use strict';
// ─────────────────────────────────────────────────────────────
//  Online 1 contra 1 por WebRTC (PeerJS).
//
//  Los dos ordenadores simulan la misma partida (misma semilla) y
//  solo intercambian las teclas de cada tick, con un pequeño retardo
//  de entrada. Si la tecla del rival aún no ha llegado se PREDICE
//  (sigue haciendo lo mismo que en su último tick conocido) y se
//  avanza; cuando llega la real y no coincide, se vuelve al último
//  estado seguro y se resimulan los ticks ("rollback"). Con
//  window = 0 no se predice nunca y es lockstep puro.
//
//  · Entradas redundantes con acuse de recibo por un canal no
//    ordenado: una pérdida no bloquea a los mensajes siguientes.
//  · Ritmo sincronizado: el que va por delante frena un poco y el
//    que va por detrás acelera, sin saltos.
//  · El anfitrión envía una huella del estado confirmado cada medio
//    segundo; si no coincide, manda el estado y el invitado se
//    resincroniza sin perder lo que ya ha simulado después.
// ─────────────────────────────────────────────────────────────

const NET_VERSION = 4;
const NET_PREFIX = 'duelo-lkb-v' + NET_VERSION + '-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEERJS_URLS = [
  'js/vendor/peerjs.min.js',                                  // copia local (licencia MIT)
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
];
// mensajes que van por el canal rápido (no ordenado): toleran llegar en cualquier orden
const FAST_MSGS = new Set(['i', 'h', 'ping', 'pong']);
const HELD_MASK = 0x3ff;           // bits de teclas mantenidas (las pulsaciones no se predicen)
const ROLLBACK_WINDOW = 8;         // ticks máximos que se avanza prediciendo

function loadScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.async = true; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function loadPeerJS() {
  if (window.Peer) return;
  for (const u of PEERJS_URLS) {
    try { await loadScript(u); if (window.Peer) return; } catch (e) { /* siguiente CDN */ }
  }
  throw new Error('No se pudo cargar la librería de red (PeerJS). ¿Hay conexión a internet?');
}
// mensajes de error de PeerJS en castellano
function netErrorMsg(e) {
  const t = e && e.type;
  const map = {
    'network': 'No se puede contactar con el servidor de salas. Revisa tu conexión a internet.',
    'server-error': 'El servidor de salas no responde. Prueba de nuevo en un rato.',
    'socket-error': 'Se perdió la conexión con el servidor de salas.',
    'socket-closed': 'Se perdió la conexión con el servidor de salas.',
    'browser-incompatible': 'Tu navegador no soporta conexiones WebRTC.',
    'webrtc': 'No se pudo abrir la conexión directa (puede que tu red la bloquee).',
    'peer-unavailable': 'No existe ninguna sala con ese código.',
    'disconnected': 'Desconectado del servidor de salas.',
  };
  return map[t] || (e && e.message) || String(e);
}
function randomCode(n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// ── transporte real: WebRTC con PeerJS ──
// Dos canales con el mismo rival: "main" (fiable y ordenado: menús, estado)
// y "fast" (no ordenado: entradas, huellas y ping).
class PeerTransport {
  constructor() { this.peer = null; this.conn = null; this.fast = null; this.onmessage = null; this.onclose = null; this.onopen = null; }
  host(code) {
    return loadPeerJS().then(() => new Promise((resolve, reject) => {
      const peer = this.peer = new Peer(NET_PREFIX + code, { debug: 0 });
      let opened = false;
      peer.on('open', () => { opened = true; resolve(); });
      setTimeout(() => { if (!opened) reject({ type: 'network' }); }, 12000);
      peer.on('error', (e) => {
        if (!opened) reject(e);
        else if (!this.conn && this.onerror) this.onerror(e);
      });
      peer.on('connection', (conn) => {
        if (conn.label === 'fast') {
          if (this.conn && conn.peer === this.conn.peer) this._bindFast(conn);
          else conn.on('open', () => conn.close());
          return;
        }
        if (this.conn) {   // sala llena
          conn.on('open', () => { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 400); });
          return;
        }
        this._bind(conn);
      });
      // si se cae la señalización, la conexión directa sigue viva
      peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} });
    }));
  }
  join(code) {
    return loadPeerJS().then(() => new Promise((resolve, reject) => {
      const peer = this.peer = new Peer({ debug: 0 });
      let done = false;
      const fail = (e) => { if (!done) { done = true; reject(e); } };
      peer.on('error', fail);
      peer.on('open', () => {
        const conn = peer.connect(NET_PREFIX + code, { reliable: true, serialization: 'json', label: 'main' });
        this._bind(conn);
        conn.on('open', () => {
          // canal rápido: sin orden (una pérdida no frena a los siguientes)
          try { this._bindFast(peer.connect(NET_PREFIX + code, { reliable: false, serialization: 'json', label: 'fast' })); } catch (e) {}
          if (!done) { done = true; resolve(); }
        });
        setTimeout(() => fail(new Error('timeout')), 15000);
      });
    }));
  }
  _bind(conn) {
    this.conn = conn;
    conn.on('open', () => this.onopen && this.onopen());
    conn.on('data', (d) => this.onmessage && this.onmessage(d));
    conn.on('close', () => this.onclose && this.onclose());
    conn.on('error', () => this.onclose && this.onclose());
  }
  _bindFast(conn) {
    this.fast = conn;
    conn.on('data', (d) => this.onmessage && this.onmessage(d));
    conn.on('close', () => { if (this.fast === conn) this.fast = null; });
    conn.on('error', () => { if (this.fast === conn) this.fast = null; });
  }
  send(m) {
    if (FAST_MSGS.has(m.t) && this.fast && this.fast.open) this.fast.send(m);
    else if (this.conn && this.conn.open) this.conn.send(m);
  }
  close() {
    try { if (this.fast) this.fast.close(); } catch (e) {}
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.conn = null; this.fast = null; this.peer = null;
  }
}

// ── transporte de pruebas entre pestañas (?net=local&lag=80&jitter=20&loss=0.02) ──
class LocalTransport {
  constructor(lag = 0, jitter = 0, loss = 0) {
    this.lag = lag; this.jitter = jitter; this.loss = loss; this.lastAt = 0;
    this.onmessage = null; this.onclose = null; this.onopen = null; this.open = false;
  }
  _chan(code) {
    this.ch = new BroadcastChannel('duelo-test-' + code);
    this.ch.onmessage = (e) => {
      const d = e.data;
      if (d.from === this.id) return;
      if (d.sys === 'hello' && this.role === 'host' && !this.open) { this.open = true; this._raw({ sys: 'ack' }); this.onopen && this.onopen(); return; }
      if (d.sys === 'ack' && this.role === 'guest' && !this.open) { this.open = true; this._resolve && this._resolve(); this.onopen && this.onopen(); return; }
      if (d.sys === 'bye') { this.onclose && this.onclose(); return; }
      if (d.msg) this.onmessage && this.onmessage(d.msg);
    };
  }
  host(code) { this.role = 'host'; this.id = 'h'; this._chan(code); return Promise.resolve(); }
  join(code) {
    this.role = 'guest'; this.id = 'g'; this._chan(code);
    return new Promise((res, rej) => {
      this._resolve = res;
      this._raw({ sys: 'hello' });
      setTimeout(() => { if (!this.open) rej(Object.assign(new Error('no hay sala'), { type: 'peer-unavailable' })); }, 3000);
    });
  }
  _raw(d) { d.from = this.id; this.ch.postMessage(d); }
  send(m) {
    if (!this.open) return;
    const now = performance.now();
    const fast = FAST_MSGS.has(m.t);
    // el canal rápido puede perder y desordenar; el principal entrega en orden
    if (fast && Math.random() < this.loss) return;
    let at = now + this.lag + Math.random() * this.jitter;
    if (!fast) { at = Math.max(this.lastAt, at); this.lastAt = at; }
    const payload = JSON.parse(JSON.stringify(m));
    setTimeout(() => this._raw({ msg: payload }), at - now);
  }
  close() { try { this._raw({ sys: 'bye' }); this.ch.close(); } catch (e) {} this.open = false; }
}

const Net = {
  t: null, role: null, code: null, connected: false,
  rtt: 0, jitter: 0, rttSamples: [], pingTimer: null,
  remoteName: 'RIVAL',
  on: {},                 // callbacks de la interfaz
  // estado de partida
  match: null, me: 0, them: 1, delay: 2, window: ROLLBACK_WINDOW,
  inputs: [new Map(), new Map()], sampledUpTo: 0, acked: 0,
  remoteContig: 0, lastRemote: 0, predicted: new Map(), snaps: new Map(), provisional: new Map(), rollbackFrom: Infinity,
  myHash: new Map(), theirHash: new Map(), lastResync: -1, resyncs: 0, waitingResync: false, pendingRsq: false,
  acc: 0, stall: 0, speed: 1, adv: 0, resendT: 0, tmpCtrl: null,
  rollbackCount: 0, maxRollback: 0, rolledTicks: 0,

  params() {
    const q = new URLSearchParams(location.search);
    return { local: q.get('net') === 'local', lag: +(q.get('lag') || 0), jitter: +(q.get('jitter') || 0), loss: +(q.get('loss') || 0),
      window: q.get('rollback') === '0' ? 0 : ROLLBACK_WINDOW };
  },
  makeTransport() {
    const p = this.params();
    return p.local ? new LocalTransport(p.lag, p.jitter, p.loss) : new PeerTransport();
  },
  emit(name, ...a) { if (this.on[name]) this.on[name](...a); },

  async create() {
    this.close();
    for (let tries = 0; tries < 4; tries++) {
      const code = randomCode();
      const t = this.makeTransport();
      try {
        await t.host(code);
        this.t = t; this.role = 'host'; this.code = code;
        this._wire();
        return code;
      } catch (e) {
        t.close();
        if (e && e.type === 'unavailable-id') continue;   // código ocupado: otro
        throw new Error(netErrorMsg(e));
      }
    }
    throw new Error('No se pudo crear la sala');
  },
  async join(code) {
    this.close();
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const t = this.makeTransport();
    this.t = t; this.role = 'guest'; this.code = code;
    this._wire();
    try { await t.join(code); }
    catch (e) {
      this.close();
      if (e && e.type === 'peer-unavailable') throw new Error('No existe ninguna sala con el código ' + code);
      if (e && e.message === 'timeout') throw new Error('El anfitrión no responde');
      throw new Error(netErrorMsg(e));
    }
  },
  _wire() {
    const t = this.t;
    t.onopen = () => {
      this.connected = true;
      this.send({ t: 'hello', v: NET_VERSION });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 250);
      this.emit('connect');
    };
    t.onmessage = (m) => this.recv(m);
    t.onclose = () => {
      const was = this.connected;
      this.connected = false;
      clearInterval(this.pingTimer);
      if (was) this.emit('disconnect');
    };
    t.onerror = (e) => this.emit('error', new Error(netErrorMsg(e)));
  },
  send(m) { if (this.t) this.t.send(m); },
  close() {
    clearInterval(this.pingTimer);
    if (this.t) { try { this.send({ t: 'bye' }); } catch (e) {} this.t.close(); }
    this.t = null; this.connected = false; this.role = null; this.match = null;
    this.rtt = 0; this.jitter = 0; this.rttSamples.length = 0;
  },

  recv(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        if (m.v !== NET_VERSION) { this.emit('error', new Error('Versiones distintas del juego: recargad la página los dos')); return; }
        this.emit('hello');
        break;
      case 'busy': this.emit('error', new Error('La sala ya está llena')); break;
      case 'ping': this.send({ t: 'pong', ts: m.ts }); break;
      case 'pong': this.addRtt(performance.now() - m.ts); break;
      case 'i': this.recvInputs(m); break;
      case 'h':
        this.theirHash.set(m.k, m.h);
        this.checkHash(m.k);
        break;
      case 'rsq':
        if (this.role === 'host' && this.match) { this.pendingRsq = true; this.answerResync(); }
        break;
      case 'rs':
        if (this.role === 'guest' && this.match) this.applyResync(m.s);
        break;
      case 'bye': this.emit('bye'); break;
      default: this.emit('msg', m);
    }
  },

  addRtt(r) {
    this.rttSamples.push(r); if (this.rttSamples.length > 20) this.rttSamples.shift();
    const sorted = [...this.rttSamples].sort((a, b) => a - b);
    this.rtt = sorted[Math.floor(sorted.length / 2)];
    // dispersión: del percentil 50 al 90 (lo que hay que cubrir para no esperar)
    this.jitter = Math.max(0, sorted[Math.floor(sorted.length * 0.9)] - this.rtt);
  },

  // Retardo de entrada recomendado. Sin rollback debe cubrir la ida y el
  // jitter enteros; con rollback basta con lo que no cubra la ventana de
  // predicción (y nunca menos de 2 ticks, para corregir poco y raramente).
  suggestDelay(window = this.params().window) {
    const oneWay = (this.rtt || 60) / 2 + (this.jitter || 0) * 0.75;
    const need = Math.ceil(oneWay / (1000 / 60)) + 1;
    return clamp(need - window, 2, 10);
  },

  // ── partida ──
  begin(match, me, delay, window = this.params().window) {
    this.match = match; this.me = me; this.them = 1 - me; this.delay = delay; this.window = window;
    this.inputs = [new Map(), new Map()];
    for (let k = 1; k <= delay; k++) { this.inputs[0].set(k, 0); this.inputs[1].set(k, 0); }
    this.sampledUpTo = delay; this.acked = delay;
    this.remoteContig = delay; this.lastRemote = 0;
    this.predicted = new Map(); this.snaps = new Map(); this.provisional = new Map(); this.rollbackFrom = Infinity;
    this.myHash.clear(); this.theirHash.clear(); this.lastResync = -1; this.waitingResync = false; this.pendingRsq = false;
    this.acc = 0; this.stall = 0; this.speed = 1; this.adv = 0; this.resendT = 0;
    this.rollbackCount = 0; this.maxRollback = 0; this.rolledTicks = 0;
    this.tmpCtrl = { held: {}, pressed: {} };
    for (const F of match.fighters) F.ctrl.clear();
  },
  end() { this.match = null; },

  sampleLocal(upTo) {
    if (this.sampledUpTo >= upTo) return;
    Input.read('any', this.tmpCtrl);
    const full = Input.encode(this.tmpCtrl);
    const heldOnly = full & HELD_MASK;
    for (let k = this.sampledUpTo + 1; k <= upTo; k++) {
      this.inputs[this.me].set(k, k === upTo ? full : heldOnly);   // la pulsación cuenta una sola vez
    }
    this.sampledUpTo = upTo;
    this.sendInputs();
    Input.endTick();                                  // las pulsaciones ya se han enviado
  },
  // envía todas las entradas que el rival aún no ha confirmado (redundancia)
  sendInputs() {
    const first = Math.max(this.acked + 1, this.sampledUpTo - 40);
    if (first > this.sampledUpTo) return;
    const masks = [];
    for (let k = first; k <= this.sampledUpTo; k++) masks.push(this.inputs[this.me].get(k) || 0);
    this.send({ t: 'i', k: first, m: masks, a: this.remoteContig, f: this.match ? this.match.tick : 0 });
    this.resendT = 0;
  },

  recvInputs(msg) {
    if (!this.match) return;
    if (msg.a > this.acked) this.acked = msg.a;
    const map = this.inputs[this.them], m = this.match;
    for (let j = 0; j < msg.m.length; j++) {
      const k = msg.k + j;
      if (map.has(k)) continue;
      map.set(k, msg.m[j]);
      // ya simulado con una predicción distinta: hay que corregir desde ahí
      const p = this.predicted.get(k);
      if (p != null) {
        if (p !== msg.m[j] && k < this.rollbackFrom) this.rollbackFrom = k;
        this.predicted.delete(k);
      }
    }
    while (map.has(this.remoteContig + 1)) this.remoteContig++;
    this.lastRemote = map.get(this.remoteContig) || 0;
    // ritmo: dónde está el rival ahora (su tick al enviar + lo que tardó en llegar)
    const remoteNow = msg.f + (this.rtt / 2) / (1000 / 60);
    this.adv = this.adv * 0.92 + (m.tick - remoteNow) * 0.08;
  },

  // simula un tick con las entradas indicadas
  simTick(m, k, remoteMask) {
    const mine = this.inputs[this.me].get(k) || 0;
    Input.decode(this.me === 0 ? mine : remoteMask, m.fighters[0].ctrl);
    Input.decode(this.me === 1 ? mine : remoteMask, m.fighters[1].ctrl);
    m.update();
    if (k <= this.remoteContig) this.onFinal(m, k);
    // con predicción: huella provisional; se confirma si la predicción acierta
    else if (k % 30 === 0) this.provisional.set(k, m.hash());
  },
  // los ticks predichos que ya tienen la entrada real (y no hubo que corregir) son definitivos
  confirmPredicted() {
    for (const [k, h] of this.provisional) {
      if (k > this.remoteContig) continue;
      this.provisional.delete(k);
      this.finalHash(k, h);
    }
  },
  // entrada del rival para el tick k: la real o una predicción
  remoteFor(k) {
    const real = this.inputs[this.them].get(k);
    if (real != null) return real;
    const p = this.lastRemote & HELD_MASK;
    this.predicted.set(k, p);
    return p;
  },

  // vuelve al último estado correcto y resimula hasta el tick actual
  rollback(m) {
    const from = this.rollbackFrom;
    this.rollbackFrom = Infinity;
    const snap = this.snaps.get(from - 1);
    if (!snap) { if (this.role === 'guest') this.requestResync(from); return; }
    const target = m.tick;
    this.resimulate(m, snap, target);
    this.rollbackCount++;
    this.rolledTicks += target - from + 1;
    this.maxRollback = Math.max(this.maxRollback, target - from + 1);
  },
  resimulate(m, state, target) {
    const before = m.fighters.map((F) => ({ x: F.x, y: F.y, alive: F.alive }));
    m.loadState(state, { rollback: true });
    m.resim = true; m.fx.mute = true; Sfx.silent++;
    try {
      while (m.tick < target) {
        const k = m.tick + 1;
        if (k > this.remoteContig) this.snaps.set(k - 1, m.saveState());
        this.simTick(m, k, this.remoteFor(k));
      }
    } finally { m.resim = false; m.fx.mute = false; Sfx.silent--; }
    // la corrección se ve como un deslizamiento corto, no como un salto
    m.fighters.forEach((F, i) => {
      const b = before[i];
      if (!b.alive || !F.alive) return;
      const dx = b.x - F.x, dy = b.y - F.y;
      if (Math.hypot(dx, dy) < 160) { F.visX = (F.visX || 0) + dx; F.visY = (F.visY || 0) + dy; }
    });
  },

  // avanza la partida; devuelve el alfa de interpolación
  step(m, dt) {
    if (this.rollbackFrom <= m.tick) this.rollback(m);
    this.confirmPredicted();
    // ritmo simétrico: el que va por delante frena, el que va por detrás acelera
    const adv = this.adv;
    this.speed = Math.abs(adv) < 0.6 ? 1 : clamp(1 - (adv - sign(adv) * 0.6) * 0.03, 0.9, 1.1);
    this.acc += dt * this.speed;
    const stepLen = () => STEP / m.timeScale;
    // nunca se tira el tiempo: si se acumula mucho (pestaña oculta) se recorta
    if (this.acc > stepLen() * 12) this.acc = stepLen() * 12;
    // ponerse al día poco a poco (máx. 3 ticks por fotograma)
    let n = 0;
    while (this.acc >= stepLen() && n < 3) {
      const k = m.tick + 1;
      this.sampleLocal(k + this.delay);
      const known = this.inputs[this.them].has(k);
      if (!known && k - this.remoteContig > this.window) {       // demasiado por delante: esperar
        this.stall++;
        if (++this.resendT >= 4) this.sendInputs();
        break;
      }
      this.stall = 0;
      if (k > this.remoteContig) this.snaps.set(k - 1, m.saveState());
      this.simTick(m, k, this.remoteFor(k));
      this.acc -= stepLen();
      n++;
      if (this.match !== m) break;
    }
    // limpieza
    for (const k of this.snaps.keys()) if (k < this.remoteContig - 1) this.snaps.delete(k);
    for (const k of this.predicted.keys()) if (k <= this.remoteContig) this.predicted.delete(k);
    if (m.tick % 60 === 0) {
      for (const map of this.inputs) for (const k of map.keys()) if (k < m.tick - 300) map.delete(k);
      for (const map of [this.myHash, this.theirHash]) for (const k of map.keys()) if (k < m.tick - 600) map.delete(k);
    }
    if (this.pendingRsq) this.answerResync();
    return clamp(this.acc / stepLen(), 0, 1);
  },

  // tick k ya es definitivo (entradas reales de los dos)
  onFinal(m, k) {
    if (k % 30 !== 0) return;
    this.provisional.delete(k);
    this.finalHash(k, m.hash());
  },
  finalHash(k, h) {
    this.myHash.set(k, h);
    if (this.role === 'host') this.send({ t: 'h', k, h });
    else this.checkHash(k);
  },
  confirmedTick() { return this.match ? Math.min(this.match.tick, this.remoteContig) : 0; },

  checkHash(k) {
    if (this.role !== 'guest' || this.waitingResync || k <= this.lastResync) return;
    const a = this.myHash.get(k), b = this.theirHash.get(k);
    if (a == null || b == null) return;
    if (a !== b) this.requestResync(k);
  },
  requestResync(k) {
    if (this.waitingResync) return;
    this.waitingResync = true;
    this.send({ t: 'rsq', k });
  },
  // el anfitrión manda su último estado confirmado
  answerResync() {
    const m = this.match;
    if (!m) return;
    let s = null;
    if (m.tick <= this.remoteContig) s = m.saveState();
    else if (this.snaps.has(this.remoteContig)) s = this.snaps.get(this.remoteContig);
    if (!s) return;              // se reintenta en el siguiente fotograma
    this.pendingRsq = false;
    this.send({ t: 'rs', s });
  },
  // el invitado carga el estado del anfitrión y resimula lo que ya llevaba
  applyResync(s) {
    const m = this.match;
    const target = Math.max(m.tick, s.tick);
    this.snaps.clear(); this.predicted.clear(); this.provisional.clear(); this.rollbackFrom = Infinity;
    this.resimulate(m, s, target);
    this.myHash.clear(); this.theirHash.clear();
    this.lastResync = s.tick; this.waitingResync = false; this.resyncs++;
  },
};

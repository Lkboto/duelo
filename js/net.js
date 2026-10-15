'use strict';
// ─────────────────────────────────────────────────────────────
//  Online 1 contra 1 por WebRTC (PeerJS).
//
//  Modelo "lockstep" con retardo de entrada: los dos ordenadores
//  simulan la misma partida a partir de la misma semilla y solo
//  intercambian las teclas pulsadas en cada tick. Cada pulsación
//  se aplica unos pocos ticks después (retardo según el ping) para
//  que llegue a tiempo al otro lado. El anfitrión envía una huella
//  del estado cada medio segundo; si no coincide, manda su estado
//  completo y el invitado se resincroniza.
// ─────────────────────────────────────────────────────────────

const NET_VERSION = 3;
const NET_PREFIX = 'duelo-lkb-v' + NET_VERSION + '-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEERJS_URLS = [
  'js/vendor/peerjs.min.js',                                  // copia local (licencia MIT)
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
];

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
class PeerTransport {
  constructor() { this.peer = null; this.conn = null; this.onmessage = null; this.onclose = null; this.onopen = null; }
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
        const conn = peer.connect(NET_PREFIX + code, { reliable: true, serialization: 'json' });
        this._bind(conn);
        conn.on('open', () => { if (!done) { done = true; resolve(); } });
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
  send(m) { if (this.conn && this.conn.open) this.conn.send(m); }
  close() {
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.conn = null; this.peer = null;
  }
}

// ── transporte de pruebas entre pestañas (?net=local&lag=80) ──
class LocalTransport {
  constructor(lag = 0, jitter = 0) {
    this.lag = lag; this.jitter = jitter; this.lastAt = 0;
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
    // entrega en orden con latencia simulada
    const at = Math.max(this.lastAt, now + this.lag + Math.random() * this.jitter);
    this.lastAt = at;
    const payload = JSON.parse(JSON.stringify(m));
    setTimeout(() => this._raw({ msg: payload }), at - now);
  }
  close() { try { this._raw({ sys: 'bye' }); this.ch.close(); } catch (e) {} this.open = false; }
}

const Net = {
  t: null, role: null, code: null, connected: false,
  rtt: 0, rttSamples: [], pingTimer: null,
  remoteName: 'RIVAL',
  on: {},                 // callbacks de la interfaz
  // estado de partida
  match: null, me: 0, them: 1, delay: 3,
  inputs: [new Map(), new Map()], sampledUpTo: 0, maxRemote: 0,
  myHash: new Map(), theirHash: new Map(), lastResync: -1, resyncs: 0, waitingResync: false,
  acc: 0, stall: 0, tmpCtrl: null,

  params() {
    const q = new URLSearchParams(location.search);
    return { local: q.get('net') === 'local', lag: +(q.get('lag') || 0), jitter: +(q.get('jitter') || 0) };
  },
  makeTransport() {
    const p = this.params();
    return p.local ? new LocalTransport(p.lag, p.jitter) : new PeerTransport();
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
      this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 500);
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
    this.rtt = 0; this.rttSamples.length = 0;
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
      case 'pong': {
        const r = performance.now() - m.ts;
        this.rttSamples.push(r); if (this.rttSamples.length > 10) this.rttSamples.shift();
        const sorted = [...this.rttSamples].sort((a, b) => a - b);
        this.rtt = sorted[Math.floor(sorted.length / 2)];
        break;
      }
      case 'i':     // entradas del rival: {k: primer tick, m: [máscaras]}
        for (let j = 0; j < m.m.length; j++) {
          this.inputs[this.them].set(m.k + j, m.m[j]);
          if (m.k + j > this.maxRemote) this.maxRemote = m.k + j;
        }
        break;
      case 'h':
        this.theirHash.set(m.k, m.h);
        this.checkHash(m.k);
        break;
      case 'rsq':
        if (this.role === 'host' && this.match) this.send({ t: 'rs', s: this.match.saveState() });
        break;
      case 'rs':
        if (this.role === 'guest' && this.match) {
          this.match.loadState(m.s);
          this.myHash.clear(); this.theirHash.clear();
          // las entradas ya enviadas se conservan: sampledUpTo nunca retrocede
          this.lastResync = m.s.tick; this.waitingResync = false; this.resyncs++;
        }
        break;
      case 'bye': this.emit('bye'); break;
      default: this.emit('msg', m);
    }
  },

  // delay de entrada recomendado según el ping (ida = rtt/2)
  suggestDelay() {
    const oneWay = (this.rtt || 60) / 2;
    return clamp(Math.ceil(oneWay / (1000 / 60)) + 2, 2, 9);
  },

  // ── partida ──
  begin(match, me, delay) {
    this.match = match; this.me = me; this.them = 1 - me; this.delay = delay;
    this.inputs = [new Map(), new Map()];
    for (let k = 1; k <= delay; k++) { this.inputs[0].set(k, 0); this.inputs[1].set(k, 0); }
    this.sampledUpTo = delay; this.maxRemote = delay;
    this.myHash.clear(); this.theirHash.clear(); this.lastResync = -1; this.waitingResync = false;
    this.acc = 0; this.stall = 0;
    this.tmpCtrl = { held: {}, pressed: {} };
    for (const F of match.fighters) F.ctrl.clear();
  },
  end() { this.match = null; },

  sampleLocal(upTo) {
    if (this.sampledUpTo >= upTo) return;
    Input.read('any', this.tmpCtrl);
    const full = Input.encode(this.tmpCtrl);
    const heldOnly = full & 0x3ff;
    const first = this.sampledUpTo + 1, masks = [];
    for (let k = first; k <= upTo; k++) {
      const v = k === upTo ? full : heldOnly;      // la pulsación cuenta una sola vez
      this.inputs[this.me].set(k, v); masks.push(v);
    }
    this.sampledUpTo = upTo;
    this.send({ t: 'i', k: first, m: masks });
    Input.endTick();                                  // las pulsaciones ya se han enviado
  },

  // avanza la partida en lockstep; devuelve el alfa de interpolación
  step(m, dt) {
    this.acc += dt;
    // ajuste fino de ritmo: si el rival va por delante, acelera un poco
    const lead = this.maxRemote - m.tick;
    if (lead > this.delay + 2) this.acc += 0.002;
    let n = 0;
    for (;;) {
      const stepLen = STEP / m.timeScale;
      if (this.acc < stepLen) break;
      const next = m.tick + 1;
      this.sampleLocal(next + this.delay);
      const a = this.inputs[0].get(next), b = this.inputs[1].get(next);
      if (a == null || b == null) {           // falta la entrada del rival: esperar
        this.stall++;
        this.acc = Math.min(this.acc, stepLen);
        break;
      }
      this.stall = 0;
      Input.decode(a, m.fighters[0].ctrl);
      Input.decode(b, m.fighters[1].ctrl);
      m.update();
      this.acc -= stepLen;
      if (next % 30 === 0) {
        const h = m.hash();
        this.myHash.set(next, h);
        if (this.role === 'host') this.send({ t: 'h', k: next, h });
        else this.checkHash(next);
      }
      if (next % 60 === 0) {   // limpieza
        for (const map of this.inputs) for (const k of map.keys()) if (k < next - 240) map.delete(k);
        for (const map of [this.myHash, this.theirHash]) for (const k of map.keys()) if (k < next - 600) map.delete(k);
      }
      if (++n >= 5) { this.acc = 0; break; }
      if (this.match !== m) break;
    }
    return clamp(this.acc / (STEP / m.timeScale), 0, 1);
  },

  checkHash(k) {
    if (this.role !== 'guest' || this.waitingResync || k <= this.lastResync) return;
    const a = this.myHash.get(k), b = this.theirHash.get(k);
    if (a == null || b == null) return;
    if (a !== b) {
      this.waitingResync = true;
      this.send({ t: 'rsq', k });
    }
  },
};

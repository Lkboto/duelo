'use strict';
// ─────────────────────────────────────────────────────────────
//  Banco de pruebas del online: dos clientes completos en la
//  misma página con un reloj virtual y una red simulada
//  (latencia, jitter, pérdida y, si es fiable, retransmisión con
//  bloqueo en orden como un canal WebRTC "reliable").
//
//  Cada cliente controla a su luchador con un bot y usa su propia
//  copia de Net, exactamente como en una partida real.
// ─────────────────────────────────────────────────────────────

const NetSim = {
  // reloj virtual: Net usa performance.now() para el ping
  now: 0,

  makeNet() {
    const n = Object.assign({}, Net);
    n.inputs = [new Map(), new Map()];
    n.myHash = new Map(); n.theirHash = new Map();
    n.rttSamples = []; n.on = {};
    if (n.initState) n.initState();
    return n;
  },

  // canal simulado de A hacia B
  makeLink(o) {
    return {
      lag: o.lag, jitter: o.jitter, loss: o.loss, reliable: o.reliable, split: o.split !== false,
      queue: [], lastAt: 0, rng: new RNG(o.seed),
      send(msg, now) {
        const payload = JSON.parse(JSON.stringify(msg));
        let at = now + this.lag + this.rng.next() * this.jitter;
        const lost = this.rng.next() < this.loss;
        if (lost) {
          if (!this.reliable) return;
          // SCTP retransmite tras ~RTO (mínimo agresivo de Chrome ≈ 1,5·RTT, nunca < 60 ms)
          at += Math.max(60, 3 * this.lag + this.jitter);
        }
        // canal ordenado: nada adelanta a un mensaje anterior (bloqueo en cabeza).
        // Con o.split (transporte nuevo) los mensajes rápidos van sin orden.
        const ordered = this.reliable && !(this.split && FAST_MSGS.has(msg.t));
        if (ordered) { at = Math.max(at, this.lastAt); this.lastAt = at; }
        this.queue.push({ at, payload });
      },
      deliver(now, fn) {
        this.queue.sort((a, b) => a.at - b.at);
        while (this.queue.length && this.queue[0].at <= now) fn(this.queue.shift().payload);
      },
    };
  },

  // o: {lag, jitter, loss, reliable, fpsA, fpsB, hitchA, seconds, delay, chars, stage, seed}
  run(o) {
    const seed = o.seed || 12345;
    const chars = o.chars || ['kaze', 'toro'];
    const stage = o.stage || STAGES[0];
    const clients = [0, 1].map((me) => {
      const net = this.makeNet();
      const transport = { send: (m) => links[me].send(m, this.now), close() {} };
      net.t = transport; net.role = me === 0 ? 'host' : 'guest'; net.connected = true;
      return { me, net, fps: me === 0 ? o.fpsA || 60 : o.fpsB || 60, hitch: me === 0 ? o.hitchA || 0 : 0,
        nextFrame: me === 0 ? 0 : (o.startSkew || 0), frames: 0, stallFrames: 0, ticks: [], lastTick: 0,
        frameTicks: [], bot: null, shadowCtrl: new Controller('bot'), rng: new RNG(seed + 7 + me) };
    });
    const links = [
      this.makeLink({ lag: o.lag, jitter: o.jitter, loss: o.loss, reliable: o.reliable !== false, seed: seed + 1 }),
      this.makeLink({ lag: o.lag, jitter: o.jitter, loss: o.loss, reliable: o.reliable !== false, seed: seed + 2 }),
    ];

    // ping previo (como en la sala) para que suggestDelay tenga datos
    this.now = 0;
    for (const c of clients) for (let i = 0; i < 8; i++) c.net.rttSamples.push(2 * o.lag + o.jitter * 0.5);
    for (const c of clients) c.net.rtt = 2 * o.lag + o.jitter * 0.5;
    const win = o.window != null ? o.window : ROLLBACK_WINDOW;
    for (const c of clients) c.net.jitter = o.jitter;
    const delay = o.delay != null ? o.delay : clients[0].net.suggestDelay(win);

    Sfx.silent++;
    const realNow = performance.now.bind(performance);
    performance.now = () => this.now;
    const desyncs = [];
    let cpuMs = 0, cpuFrames = 0, maxCpu = 0;
    try {
      for (const c of clients) {
        const players = chars.map((charId, i) => ({ charId, source: 'net', slot: i, team: i }));
        c.match = new Match({ mode: 'online', stage, seed, firstTo: 99, players });
        c.net.begin(c.match, c.me, delay, win);
        // registra la huella de cada tick confirmado (definitivo) para comparar los dos lados
        c.finals = new Map();
        const base = c.net.finalHash;
        c.net.finalHash = function (k, h) { c.finals.set(k, h); return base.call(this, k, h); };
        // el bot "piensa" sobre una sombra de su luchador con un mando propio
        const F = c.match.fighters[c.me];
        const shadow = Object.create(F, { ctrl: { value: c.shadowCtrl, writable: true } });
        c.bot = new Bot(shadow, o.level || 'hard', c.rng);
        c.shadow = shadow;
      }
      const endT = (o.seconds || 30) * 1000;
      let nextPing = 0;
      while (this.now < endT) {
        // siguiente evento: el fotograma más próximo de cualquiera de los dos
        const c = clients[0].nextFrame <= clients[1].nextFrame ? clients[0] : clients[1];
        this.now = c.nextFrame;
        if (this.now >= nextPing) {
          for (const k of clients) k.net.send({ t: 'ping', ts: this.now });
          nextPing += 500;
        }
        for (let i = 0; i < 2; i++) links[i].deliver(this.now, (m) => clients[1 - i].net.recv(m));

        // fotograma del cliente c
        let dt = 1000 / c.fps;
        if (c.hitch && c.frames % 180 === 90) dt += c.hitch;          // tirón local periódico
        const prevDt = c.lastDt || 1000 / c.fps;
        c.lastDt = dt;
        const m = c.match;
        const read = Input.read, endTick = Input.endTick;
        Input.read = (src, out) => {
          c.bot.F = c.shadow;
          c.bot.update(m);
          for (const a of ACTIONS) { out.held[a] = c.shadowCtrl.held[a]; out.pressed[a] = c.shadowCtrl.pressed[a]; }
          for (const a of ACTIONS) c.shadowCtrl.pressed[a] = false;
          return out;
        };
        Input.endTick = () => {};
        // desincronización provocada (prueba de la resincronización)
        if (o.corruptAt && c.me === 1 && !c.corrupted && m.tick >= o.corruptAt) {
          c.corrupted = true; m.fighters[0].hp = Math.max(1, m.fighters[0].hp - 13); m.fighters[0].x += 3;
        }
        const before = m.tick;
        const stepLen = 1000 / 60 / m.timeScale;
        const t0 = realNow();
        let alpha;
        try { alpha = c.net.step(m, prevDt / 1000); }
        finally { Input.read = read; Input.endTick = endTick; }
        const ms = realNow() - t0;
        cpuMs += ms; cpuFrames++; if (ms > maxCpu) maxCpu = ms;
        const adv = m.tick - before;
        c.frames++;
        // reloj de presentación: lo que el jugador ve avanzar (ticks + interpolación)
        c.simMs = (c.simMs || 0) + adv * stepLen;
        const P = c.simMs + alpha * stepLen;
        const dP = P - (c.lastP == null ? P : c.lastP);
        c.lastP = P;
        if (this.now > 1500) {
          c.measured = (c.measured || 0) + 1;
          if (Math.abs(dP - prevDt) > 5) c.jerks = (c.jerks || 0) + 1;
          if (c.net.stall > 0 && adv === 0) c.stallFrames++;
        }
        c.nextFrame += dt;
      }
      // comparación de estados: mismos ticks confirmados en los dos lados
      let compared = 0;
      for (const [k, h] of clients[0].finals) {
        if (!clients[1].finals.has(k)) continue;
        compared++;
        if (clients[1].finals.get(k) !== h) desyncs.push(k);
      }
      const res = { scenario: o.name || '', delay };
      for (const c of clients) {
        res['P' + (c.me + 1)] = {
          ticks: c.match.tick, lostMs: Math.round(this.now - c.simMs),
          stallFrames: c.stallFrames, jerkPct: +(100 * (c.jerks || 0) / Math.max(1, c.measured)).toFixed(2),
          resyncs: c.net.resyncs || 0, rollbacks: c.net.rollbackCount || 0, maxRollback: c.net.maxRollback || 0,
          inputLagMs: Math.round((c.net.delay || 0) * 1000 / 60),
        };
      }
      res.desyncTicks = desyncs.length; res.comparedTicks = compared;
      res.lastDesync = desyncs.length ? Math.max(...desyncs) : -1;
      res.cpuAvgMs = +(cpuMs / cpuFrames).toFixed(3); res.cpuMaxMs = +maxCpu.toFixed(2);
      res.hpEnd = clients.map((c) => c.match.fighters.map((F) => Math.round(F.hp)).join('/')).join(' vs ');
      return res;
    } finally {
      performance.now = realNow;
      Sfx.silent--;
    }
  },

  // ¿Volver atrás y resimular da exactamente el mismo estado? Una partida
  // se juega de corrido y otra con retrocesos constantes; deben coincidir.
  rollbackCheck(o = {}) {
    const seconds = o.seconds || 40, every = o.every || 5, depth = o.depth || 7;
    const ids = CHARACTERS.map((c) => c.id);
    const results = [];
    Sfx.silent++;
    try {
      for (let si = 0; si < STAGES.length; si++) {
        const chars = [ids[(si * 2) % 6], ids[(si * 2 + 3) % 6]];
        const mk = () => new Match({ mode: 'online', stage: STAGES[si], seed: 77 + si, firstTo: 99,
          players: chars.map((charId, i) => ({ charId, source: 'net', slot: i, team: i })) });
        // 1) partida de referencia; los bots generan las entradas de los dos
        const A = mk(), masks = [];
        const bots = A.fighters.map((F, i) => {
          const ctrl = new Controller('bot');
          const sh = Object.create(F, { ctrl: { value: ctrl, writable: true } });
          return { b: new Bot(sh, 'hard', new RNG(5 + i)), ctrl, sh };
        });
        const ref = [];
        for (let k = 0; k < seconds * 60; k++) {
          const mk2 = bots.map((x) => { x.b.F = x.sh; x.b.update(A); return Input.encode(x.ctrl); });
          masks.push(mk2);
          A.fighters.forEach((F, i) => Input.decode(mk2[i], F.ctrl));
          A.update();
          ref.push(A.hash());
        }
        // 2) la misma partida retrocediendo `depth` ticks cada `every`
        const B = mk(), snaps = new Map();
        snaps.set(0, B.saveState());
        let rollbacks = 0, firstBad = -1;
        while (B.tick < masks.length) {
          const k = B.tick;
          B.fighters.forEach((F, i) => Input.decode(masks[k][i], F.ctrl));
          B.update();
          snaps.set(B.tick, B.saveState());
          if (B.tick % every === 0 && B.tick > depth) {
            const back = B.tick - depth, to = B.tick;
            B.loadState(snaps.get(back), { rollback: true });
            while (B.tick < to) {
              B.fighters.forEach((F, i) => Input.decode(masks[B.tick][i], F.ctrl));
              B.update();
              snaps.set(B.tick, B.saveState());
            }
            rollbacks++;
          }
          if (firstBad < 0 && B.hash() !== ref[B.tick - 1]) firstBad = B.tick;
        }
        const same = JSON.stringify(A.saveState().fighters) === JSON.stringify(B.saveState().fighters);
        results.push({ stage: STAGES[si].id, chars: chars.join('-'), rollbacks, firstBadTick: firstBad, fullStateEqual: same,
          hp: A.fighters.map((F) => Math.round(F.hp)).join('/') });
      }
    } finally { Sfx.silent--; }
    return results;
  },

  SCENARIOS: [
    { name: 'LAN', lag: 4, jitter: 2, loss: 0 },
    { name: 'Bueno 30ms', lag: 30, jitter: 6, loss: 0 },
    { name: 'Normal 60ms+jitter', lag: 60, jitter: 25, loss: 0.005 },
    { name: 'Malo 100ms+jitter+1%', lag: 100, jitter: 50, loss: 0.01 },
    { name: 'Pérdida 3%', lag: 40, jitter: 10, loss: 0.03 },
    { name: '60Hz vs 144Hz', lag: 30, jitter: 8, loss: 0, fpsB: 144 },
    { name: 'Tirones locales', lag: 30, jitter: 8, loss: 0, hitchA: 120 },
  ],

  runAll(extra = {}) {
    return this.SCENARIOS.map((s) => this.run(Object.assign({ seconds: 40 }, s, extra)));
  },
};

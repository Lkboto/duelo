'use strict';
// ─────────────────────────────────────────────────────────────
//  Interfaz: pantallas en HTML por encima del canvas.
//  Se navega con ratón, teclado (cualquier teclado) o mando.
// ─────────────────────────────────────────────────────────────

const PAD_LABELS = { jump: 'A', light: 'X', heavy: 'B', skill1: 'Y', skill2: 'RB', dash: 'LB', left: '◀', right: '▶', up: '▲', down: '▼' };
const STAT_LABELS = { vel: 'Velocidad', fue: 'Fuerza', alc: 'Alcance', dif: 'Dificultad' };
const SOURCE_NAMES = { kb1: 'Teclado 1 (WASD)', kb2: 'Teclado 2 (flechas)', any: 'Teclado o mando', pad0: 'Mando 1', pad1: 'Mando 2', pad2: 'Mando 3', pad3: 'Mando 4' };
const LEVEL_NAMES = { dummy: 'Muñeco', easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };

// Combos sugeridos: verificados automáticamente contra luchadores ligeros, medios y pesados
const COMBOS = {
  kaze: [
    { seq: 'L · L · L → Fuerte', note: '4 golpes. Cancela el tercer corte en el tajo pesado.' },
    { seq: 'L · L · L → Iaido', note: '4 golpes. El Iaido atraviesa al rival y te deja a su espalda.' },
    { seq: '↑+Fuerte → salto → aire L → aire Fuerte', note: 'Lanzador: el ↑+Fuerte se cancela en salto si acierta.' },
  ],
  toro: [
    { seq: 'L · L → Embestida', note: 'La carga tiene armadura: aguanta el golpe y sigue.' },
    { seq: 'L · L → Fuerte', note: 'Gancho con armadura al final de la cadena.' },
    { seq: '↓+Fuerte → ↑+Fuerte', note: 'El pisotón levanta; el uppercut remata.' },
  ],
  sombra: [
    { seq: 'L · L · L → ↑+Fuerte → salto → aire Fuerte', note: '8 golpes: la cadena más larga del juego.' },
    { seq: 'Shurikens → dash → L · L · L', note: '7 golpes. Las estrellas lo frenan; entra antes de que se recupere.' },
    { seq: 'L · L → Shurikens', note: '5 golpes a quemarropa.' },
  ],
  volta: [
    { seq: 'L · L → Orbe arcano', note: 'El orbe estalla encima del rival.' },
    { seq: '↓+Fuerte → Orbe arcano', note: 'El barrido lo deja a tiro del orbe.' },
    { seq: '↓+Fuerte → salto → aire Fuerte', note: 'El barrido se cancela en salto si acierta.' },
  ],
  valk: [
    { seq: 'L · L → Jabalina', note: 'La jabalina lo saca volando del escenario.' },
    { seq: 'L · L → Fuerte', note: 'La punta de la lanza castiga desde muy lejos.' },
    { seq: '↓+Fuerte → Jabalina', note: 'Barrido y lanzamiento antes de que caiga.' },
  ],
  bala: [
    { seq: 'L · L · L → Escopeta', note: '4 golpes y el retroceso te pone a salvo.' },
    { seq: 'L · L · L → Disparo', note: '4 golpes; el disparo tiene muy poca recarga.' },
    { seq: '↓+Fuerte → ↑+Fuerte', note: 'Barrido y tiro hacia arriba.' },
  ],
};

const UI = {
  root: null, screens: {}, cur: null, prevScreen: null,
  sel: null, showcases: [], winnerShow: null,

  init() {
    this.root = document.getElementById('ui');
    this.build();
    this.show('title');
    // el ratón también enfoca, para que teclado y ratón convivan
    this.root.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-nav]');
      if (el && document.activeElement !== el && !el.disabled) el.focus({ preventScroll: true });
    });
    this.root.addEventListener('click', (e) => {
      if (e.target.closest('button')) Sfx.play('ok');
    });
  },

  h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
  kbd(action, src = 'kb1') {
    if (Input.lastDevice === 'pad' && src !== 'kb2') return `<span class="kbd">${PAD_LABELS[action] || action}</span>`;
    const codes = Input.bindings[src][action];
    return `<span class="kbd">${keyLabel(codes && codes[0])}</span>`;
  },
  toast(msg, ms = 2600) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  },

  build() {
    const R = this.root;
    R.innerHTML = '';
    // ── título ──
    const title = this.h(`
      <section class="screen" id="scr-title">
        <div class="dim left"></div>
        <div class="title-wrap">
          <h1 class="logo">DUELO</h1>
          <p class="tagline">Peleas de stick figures · combos · habilidades</p>
          <nav class="main-menu">
            <button class="menu-item" data-nav data-act="bots"><b>Contra bots</b><small>Tú contra la máquina (hasta 3 bots)</small><i>▶</i></button>
            <button class="menu-item" data-nav data-act="local"><b>Local</b><small>2 a 4 jugadores: teclados y mandos</small><i>▶</i></button>
            <button class="menu-item" data-nav data-act="online"><b>Online</b><small>Crea una sala y pásale el código a un amigo</small><i>▶</i></button>
            <button class="menu-item" data-nav data-act="training"><b>Entrenamiento</b><small>Practica combos contra un muñeco</small><i>▶</i></button>
            <button class="menu-item" data-nav data-act="moves"><b>Movimientos</b><small>Golpes, habilidades y combos de cada luchador</small><i>▶</i></button>
            <button class="menu-item" data-nav data-act="controls"><b>Controles</b><small>Cambia cualquier tecla con un clic</small><i>▶</i></button>
            <button class="menu-item" data-nav data-act="options"><b>Opciones</b><small>Volumen, sacudida de cámara, pantalla completa</small><i>▶</i></button>
          </nav>
          <p class="mobile-note">Este juego necesita teclado o mando.</p>
        </div>
        <div class="foot-hint" id="title-hint"></div>
        <div class="ver">v1.0</div>
      </section>`);
    title.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.titleAction(b.dataset.act)));
    R.appendChild(title);

    // ── selección ──
    const sel = this.h(`
      <section class="screen" id="scr-select">
        <header class="topbar">
          <button class="btn small ghost" data-back><span>◀ Volver</span></button>
          <h2>Elige luchador</h2>
          <div class="mode-tag"><span id="sel-mode">CONTRA BOTS</span></div>
        </header>
        <div class="roster" id="roster"></div>
        <div class="slots" id="slots"></div>
        <div class="ready-bar" id="ready-bar">¡A LUCHAR!<small id="ready-sub">Pulsa Intro o haz clic</small></div>
        <footer class="select-foot" id="sel-foot"></footer>
      </section>`);
    sel.querySelector('[data-back]').addEventListener('click', () => this.selectBack());
    sel.querySelector('#ready-bar').addEventListener('click', () => this.selectConfirm());
    R.appendChild(sel);

    // ── escenario ──
    const stage = this.h(`
      <section class="screen" id="scr-stage">
        <div class="dim full"></div>
        <header class="topbar">
          <button class="btn small ghost" data-back><span>◀ Volver</span></button>
          <h2>Escenario</h2>
        </header>
        <div class="stage-grid" id="stage-grid"></div>
        <div class="rounds" id="rounds">
          <span class="lbl">Rondas para ganar</span>
          <button class="btn small" data-nav data-ft="1"><span>1</span></button>
          <button class="btn small" data-nav data-ft="2"><span>2</span></button>
          <button class="btn small" data-nav data-ft="3"><span>3</span></button>
        </div>
      </section>`);
    stage.querySelector('[data-back]').addEventListener('click', () => this.show('select'));
    stage.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => { this.sel.firstTo = +b.dataset.ft; this.refreshRounds(); }));
    R.appendChild(stage);
    const grid = stage.querySelector('#stage-grid');
    for (const def of STAGES) {
      const b = this.h(`<button class="stage-card" data-nav data-stage="${def.id}"><canvas></canvas><span>${def.name}</span></button>`);
      b.addEventListener('click', () => this.stageChosen(def.id));
      grid.appendChild(b);
    }
    const rnd = this.h(`<button class="stage-card random" data-nav data-stage="random">?<span>Aleatorio</span></button>`);
    rnd.addEventListener('click', () => this.stageChosen('random'));
    grid.appendChild(rnd);

    // ── combate (capa transparente) ──
    R.appendChild(this.h(`
      <section class="screen passthrough" id="scr-fight">
        <div class="fight-hint" id="fight-hint">Esc: pausa</div>
        <div class="wait-net" id="wait-net"><div class="spinner"></div><span>Esperando al rival…</span></div>
      </section>`));

    // ── pausa ──
    const pause = this.h(`
      <section class="screen" id="scr-pause">
        <div class="dim full"></div>
        <div class="panel">
          <h3>Pausa</h3>
          <div class="stack">
            <button class="btn" data-nav data-p="resume"><span>Continuar</span></button>
            <button class="btn" data-nav data-p="moves"><span>Movimientos y combos</span></button>
            <button class="btn" data-nav data-p="controls"><span>Controles</span></button>
            <button class="btn" data-nav data-p="restart"><span>Reiniciar</span></button>
            <button class="btn" data-nav data-p="select"><span>Cambiar personajes</span></button>
            <button class="btn" data-nav data-p="quit"><span>Salir al menú</span></button>
          </div>
        </div>
      </section>`);
    pause.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => this.pauseAction(b.dataset.p)));
    R.appendChild(pause);

    // ── resultados ──
    const res = this.h(`
      <section class="screen" id="scr-results">
        <div class="dim full"></div>
        <div class="panel wide">
          <div class="results-title"><div class="big" id="res-big">KAZE GANA</div><div class="sub" id="res-sub"></div></div>
          <div class="winner-prev"><canvas class="preview" id="res-canvas"></canvas></div>
          <table class="res-table" id="res-table"></table>
          <div class="res-actions">
            <button class="btn primary" data-nav data-r="again"><span>Revancha</span></button>
            <button class="btn" data-nav data-r="select"><span>Cambiar personajes</span></button>
            <button class="btn" data-nav data-r="quit"><span>Menú principal</span></button>
          </div>
        </div>
      </section>`);
    res.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => this.resultsAction(b.dataset.r)));
    R.appendChild(res);

    // ── controles ──
    const ctl = this.h(`
      <section class="screen" id="scr-controls">
        <div class="dim full"></div>
        <div class="panel wide">
          <h3>Controles</h3>
          <div class="ctrl-cols" id="ctrl-cols"></div>
          <div class="pad-info">
            <b>Mando</b> (Xbox / PlayStation): stick o cruceta para moverte · <span class="kbd">A</span> saltar · <span class="kbd">X</span> ligero ·
            <span class="kbd">B</span> fuerte · <span class="kbd">Y</span> habilidad 1 · <span class="kbd">RB</span> habilidad 2 · <span class="kbd">LB</span>/<span class="kbd">LT</span>/<span class="kbd">RT</span> esquiva · <span class="kbd">Start</span> pausa.<br>
            Haz clic en una casilla y pulsa la tecla o botón del ratón nuevo. <span class="kbd">Supr</span> la deja vacía, <span class="kbd">Esc</span> cancela.
          </div>
          <div class="panel-actions">
            <button class="btn" data-nav data-c="reset"><span>Restablecer</span></button>
            <button class="btn primary" data-nav data-c="back"><span>Listo</span></button>
          </div>
        </div>
      </section>`);
    ctl.querySelector('[data-c=reset]').addEventListener('click', () => { Input.resetBindings(); this.renderControls(); this.toast('Controles restablecidos'); });
    ctl.querySelector('[data-c=back]').addEventListener('click', () => this.back());
    R.appendChild(ctl);

    // ── opciones ──
    const opt = this.h(`
      <section class="screen" id="scr-options">
        <div class="dim full"></div>
        <div class="panel">
          <h3>Opciones</h3>
          <div class="opt-row"><span>Volumen</span><input type="range" min="0" max="100" step="5" id="opt-vol" data-nav></div>
          <div class="opt-row"><span>Sacudida de cámara</span><input type="range" min="0" max="150" step="10" id="opt-shake" data-nav></div>
          <div class="opt-row"><span>Números de daño</span><div class="seg"><button class="btn small" data-nav data-dn="1"><span>Sí</span></button><button class="btn small" data-nav data-dn="0"><span>No</span></button></div></div>
          <div class="opt-row"><span>Pantalla completa</span><button class="btn small" data-nav id="opt-fs"><span>Cambiar</span></button></div>
          <div class="panel-actions"><button class="btn primary" data-nav data-o="back"><span>Listo</span></button></div>
        </div>
      </section>`);
    opt.querySelector('#opt-vol').addEventListener('input', (e) => { Sfx.init(); Sfx.setVolume(+e.target.value / 100); });
    opt.querySelector('#opt-vol').addEventListener('change', () => Sfx.play('hit', 1));
    opt.querySelector('#opt-shake').addEventListener('input', (e) => { Settings.shake = +e.target.value / 100; saveSettings(); });
    opt.querySelectorAll('[data-dn]').forEach((b) => b.addEventListener('click', () => { Settings.dmgNumbers = b.dataset.dn === '1'; saveSettings(); this.renderOptions(); }));
    opt.querySelector('#opt-fs').addEventListener('click', () => App.toggleFullscreen());
    opt.querySelector('[data-o=back]').addEventListener('click', () => this.back());
    R.appendChild(opt);

    // ── online ──
    const onl = this.h(`
      <section class="screen" id="scr-online">
        <div class="dim full"></div>
        <div class="panel wide">
          <h3>Online</h3>
          <div class="online-grid">
            <div class="online-box" id="box-host">
              <h4>Crear sala</h4>
              <p>Te damos un código: pásaselo a tu rival. Tú eliges el escenario.</p>
              <div class="room-code" id="room-code" hidden></div>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <button class="btn primary" data-nav id="btn-host"><span>Crear sala</span></button>
                <button class="btn" data-nav id="btn-copy" hidden><span>Copiar enlace</span></button>
              </div>
            </div>
            <div class="online-box">
              <h4>Unirse</h4>
              <p>Escribe el código de 5 letras que te ha pasado el anfitrión.</p>
              <input class="code-input" id="code-in" maxlength="5" autocomplete="off" spellcheck="false" placeholder="·····" data-nav>
              <button class="btn primary" data-nav id="btn-join"><span>Unirse</span></button>
            </div>
          </div>
          <div class="net-status" id="net-status"></div>
          <div class="panel-actions"><button class="btn" data-nav id="btn-online-back"><span>◀ Volver</span></button></div>
        </div>
      </section>`);
    onl.querySelector('#btn-host').addEventListener('click', () => this.onlineHost());
    onl.querySelector('#btn-join').addEventListener('click', () => this.onlineJoin());
    onl.querySelector('#code-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.onlineJoin(); });
    onl.querySelector('#btn-copy').addEventListener('click', () => this.copyLink());
    onl.querySelector('#btn-online-back').addEventListener('click', () => { Net.close(); this.show('title'); });
    R.appendChild(onl);

    // ── movimientos ──
    const mv = this.h(`
      <section class="screen" id="scr-moves">
        <div class="dim full"></div>
        <div class="panel wide">
          <h3>Movimientos</h3>
          <div class="moves-tabs" id="moves-tabs"></div>
          <div id="moves-body"></div>
          <div class="panel-actions"><button class="btn primary" data-nav data-m="back"><span>Volver</span></button></div>
        </div>
      </section>`);
    mv.querySelector('[data-m=back]').addEventListener('click', () => this.back());
    R.appendChild(mv);

    R.querySelectorAll('.screen').forEach((s) => (this.screens[s.id.slice(4)] = s));
  },

  // ═════════════ navegación de pantallas ═════════════
  show(name, opts = {}) {
    if (this.cur && this.cur !== name && !opts.keepPrev) this.prevScreen = this.cur;
    for (const k in this.screens) this.screens[k].classList.toggle('active', k === name);
    this.cur = name;
    const s = this.screens[name];
    if (name === 'title') this.renderTitleHint();
    if (name === 'controls') this.renderControls();
    if (name === 'options') this.renderOptions();
    if (name === 'stage') this.renderStage();
    if (name === 'fight') { document.getElementById('fight-hint').textContent = App.match && App.match.mode === 'training' ? 'Esc: pausa · F2: cajas de golpe · R: reiniciar posiciones' : 'Esc: pausa'; }
    // foco inicial para teclado / mando
    if (name !== 'select' && name !== 'fight') {
      const f = opts.focus ? s.querySelector(opts.focus) : s.querySelector('[data-nav]:not([disabled])');
      if (f) setTimeout(() => f.focus({ preventScroll: true }), 0);
    } else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  },
  back() {
    const p = this.backTo || 'title';
    this.backTo = null;
    this.show(p, { keepPrev: true });
  },
  openSub(name, from) { this.backTo = from || this.cur; this.show(name); },

  renderTitleHint() {
    const k = (a) => this.kbd(a);
    document.getElementById('title-hint').innerHTML =
      `${k('left')}${k('right')} moverse · ${k('jump')} saltar · ${k('light')} ligero · ${k('heavy')} fuerte · ${k('skill1')} ${k('skill2')} habilidades · ${k('dash')} esquiva`;
  },

  titleAction(a) {
    Sfx.init(); Sfx.resume();
    if (a === 'bots' || a === 'local' || a === 'training') this.openSelect(a);
    else if (a === 'online') { this.show('online'); this.netStatus(''); this.resetOnlineBox(); }
    else if (a === 'moves') { this.openMoves(null); }
    else if (a === 'controls' || a === 'options') this.openSub(a, 'title');
  },

  // ═════════════ SELECCIÓN ═════════════
  openSelect(mode, keep) {
    if (!keep || !this.sel || this.sel.mode !== mode) {
      const S = this.sel = { mode, slots: [], firstTo: mode === 'training' ? 1 : 2, stage: null };
      if (mode === 'bots') { this.addHuman('any'); this.addBot('normal'); }
      else if (mode === 'local') { this.addHuman('kb1'); }
      else if (mode === 'training') { this.addHuman('any'); this.addBot('dummy', 'toro'); }
      else if (mode === 'online') {
        const meFirst = Net.role === 'host';
        const local = this.mkHuman('any'); local.net = 'me';
        const remote = { kind: 'remote', tag: 'RIVAL', cursor: 0, locked: false, charId: null };
        S.slots = meFirst ? [local, remote] : [remote, local];
        local.tag = 'TÚ';
      }
      S.firstTo = mode === 'training' ? 1 : 2;
    } else {
      for (const s of this.sel.slots) if (s.kind !== 'bot') s.locked = false;
    }
    const names = { bots: 'CONTRA BOTS', local: 'LOCAL', training: 'ENTRENAMIENTO', online: 'ONLINE · ' + (Net.code || '') };
    document.getElementById('sel-mode').textContent = names[mode];
    this.buildRoster();
    this.buildSlots();
    this.show('select');
    this.selectChanged();
    if (mode === 'online') this.sendSel();
  },
  mkHuman(source) {
    return { kind: 'human', source, cursor: 0, locked: false, charId: null, tag: '' };
  },
  addHuman(source) {
    const S = this.sel;
    if (S.slots.length >= 4) return null;
    const s = this.mkHuman(source);
    S.slots.push(s);
    return s;
  },
  addBot(level = 'normal', charId = null) {
    const S = this.sel;
    if (S.slots.length >= 4) return;
    S.slots.push({ kind: 'bot', level, charId, locked: true, cursor: -1 });
  },
  retag() {
    let h = 0, b = 0;
    this.sel.slots.forEach((s, i) => {
      s.color = SLOT_COLORS[i % 4];
      if (s.kind === 'human' && !s.net) s.tag = 'J' + (++h);
      else if (s.kind === 'bot') s.tag = this.sel.mode === 'training' && s.level === 'dummy' ? 'MUÑECO' : 'BOT ' + (++b);
    });
  },

  buildRoster() {
    const R = document.getElementById('roster');
    R.innerHTML = '';
    CHARACTERS.forEach((ch, i) => {
      const c = this.h(`<button class="card" data-i="${i}" style="--pc:${ch.color}"><canvas></canvas><div class="cname">${ch.name}</div><div class="cursors"></div></button>`);
      c.addEventListener('click', () => this.mousePick(i));
      c.addEventListener('mouseenter', () => this.mouseHover(i));
      R.appendChild(c);
    });
    const r = this.h(`<button class="card random" data-i="${CHARACTERS.length}" style="--pc:#888"><div class="q">?</div><div class="cname">Aleatorio</div><div class="cursors"></div></button>`);
    r.addEventListener('click', () => this.mousePick(CHARACTERS.length));
    r.addEventListener('mouseenter', () => this.mouseHover(CHARACTERS.length));
    R.appendChild(r);
    requestAnimationFrame(() => {
      R.querySelectorAll('.card:not(.random)').forEach((c, i) => drawPortrait(c.querySelector('canvas'), CHARACTERS[i]));
    });
  },

  buildSlots() {
    const S = this.sel;
    this.retag();
    const wrap = document.getElementById('slots');
    wrap.innerHTML = '';
    this.showcases = [];
    S.slots.forEach((s, i) => {
      const el = this.h(`
        <div class="slot" style="--pc:${s.color}">
          <div class="slot-head"><span class="tag">${s.tag}</span><span class="who"></span></div>
          <div class="preview-wrap"><canvas class="preview"></canvas><div class="big-q">?</div></div>
          <div class="slot-info"><div class="name"></div><div class="ctitle"></div><div class="stats"></div><div class="skills"></div></div>
          <div class="slot-foot"></div>
        </div>`);
      s.el = el;
      const facing = i < S.slots.length / 2 || S.slots.length === 1 ? 1 : -1;
      s.show = new Showcase(el.querySelector('canvas'), facing);
      this.showcases.push(s.show);
      const head = el.querySelector('.slot-head');
      const canRemove = (s.kind === 'bot' && S.mode !== 'training') || (s.kind === 'human' && i > 0 && S.mode === 'local');
      if (canRemove) {
        const x = this.h(`<button class="x" title="Quitar">✕</button>`);
        x.addEventListener('click', () => { S.slots.splice(S.slots.indexOf(s), 1); this.buildSlots(); this.selectChanged(); });
        head.appendChild(x);
      }
      if (s.kind === 'bot') {
        const levels = S.mode === 'training' ? ['dummy', 'easy', 'normal', 'hard'] : ['easy', 'normal', 'hard'];
        const lv = this.h(`<div class="lvl">${levels.map((l) => `<button class="btn small" data-l="${l}"><span>${LEVEL_NAMES[l]}</span></button>`).join('')}</div>`);
        lv.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { s.level = b.dataset.l; this.retag(); this.buildSlots(); this.selectChanged(); }));
        el.insertBefore(lv, el.querySelector('.slot-foot'));
        const cp = this.h(`<div class="charpick"><button class="arrow" data-d="-1">◀</button><span style="color:var(--muted);font-size:15px">Personaje</span><button class="arrow" data-d="1">▶</button></div>`);
        cp.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
          const ids = [null, ...CHARACTERS.map((c) => c.id)];
          const k = ids.indexOf(s.charId);
          s.charId = ids[(k + +b.dataset.d + ids.length) % ids.length];
          this.selectChanged();
        }));
        el.querySelector('.preview-wrap').appendChild(cp);
        cp.style.position = 'absolute'; cp.style.left = '0'; cp.style.right = '0'; cp.style.bottom = '6px';
      }
      wrap.appendChild(el);
    });
    // huecos libres
    const free = 4 - S.slots.length;
    if (free > 0 && S.mode !== 'online' && S.mode !== 'training') {
      const el = this.h(`<div class="slot empty"><div class="plus">+</div><button class="btn small" data-add><span>Añadir bot</span></button><p></p></div>`);
      el.querySelector('[data-add]').addEventListener('click', () => { this.addBot('normal'); this.buildSlots(); this.selectChanged(); });
      el.querySelector('p').innerHTML = S.mode === 'local'
        ? `Otro jugador: pulsa ${this.kbd('light', 'kb2')} en el teclado 2 o <span class="kbd">A</span> en un mando para unirte`
        : `<span class="kbd">B</span> añade un bot · <span class="kbd">N</span> quita uno`;
      wrap.appendChild(el);
    }
  },

  slotChar(s) {
    if (s.kind === 'bot') return s.charId;
    if (s.locked) return s.charId;
    return s.cursor >= 0 && s.cursor < CHARACTERS.length ? CHARACTERS[s.cursor].id : null;
  },

  selectChanged() {
    const S = this.sel;
    if (!S) return;
    // tarjetas: cursores de los jugadores
    const cards = document.querySelectorAll('#roster .card');
    cards.forEach((c) => { c.querySelector('.cursors').innerHTML = ''; c.classList.remove('hl'); });
    for (const s of S.slots) {
      if (s.kind === 'bot' || s.cursor < 0) continue;
      const card = cards[s.cursor];
      if (!card) continue;
      card.classList.add('hl');
      card.querySelector('.cursors').appendChild(this.h(`<span class="cur-tag" style="background:${s.color}">${s.tag}${s.locked ? ' ✓' : ''}</span>`));
    }
    // tarjetas de jugador
    for (const s of S.slots) {
      const el = s.el;
      if (!el) continue;
      const id = this.slotChar(s), ch = id ? CHAR_BY_ID[id] : null;
      el.classList.toggle('locked', !!s.locked && s.kind !== 'bot');
      el.style.setProperty('--cc', ch ? ch.color : '#888');
      el.querySelector('.big-q').style.display = ch ? 'none' : '';
      s.show.setChar(ch ? ch.id : null);
      el.querySelector('.who').textContent = s.kind === 'bot' ? 'Bot · ' + LEVEL_NAMES[s.level]
        : s.kind === 'remote' ? (Net.connected ? 'Conectado' : 'Desconectado') : SOURCE_NAMES[s.source] || '';
      el.querySelector('.name').textContent = ch ? ch.name : 'ALEATORIO';
      el.querySelector('.ctitle').textContent = ch ? ch.title : (s.kind === 'bot' ? 'Se decide al empezar' : 'La suerte decide');
      el.querySelector('.stats').innerHTML = ch ? Object.keys(STAT_LABELS).map((k) =>
        `<span>${STAT_LABELS[k]}</span><div class="bar">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= ch.rating[k] ? 'on' : ''}"></i>`).join('')}</div>`).join('') : '';
      el.querySelector('.skills').innerHTML = ch ? ch.skills.map((sk) =>
        `<div class="skill">${s.kind === 'human' ? this.kbd(sk.key, s.source === 'kb2' ? 'kb2' : 'kb1') : ''}<b>${sk.name}:</b> ${sk.desc}</div>`).join('') : '';
      el.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('on', b.dataset.l === s.level));
      const foot = el.querySelector('.slot-foot');
      if (s.kind === 'bot') foot.textContent = 'Listo';
      else if (s.kind === 'remote') foot.textContent = s.locked ? '¡LISTO!' : 'Eligiendo…';
      else if (s.locked) foot.textContent = '¡LISTO!';
      else {
        const src = s.source === 'kb2' ? 'kb2' : 'kb1';
        foot.innerHTML = s.source.startsWith('pad') ? `<span class="kbd">A</span> elegir` : `${this.kbd('light', src)} elegir · ${this.kbd('heavy', src)} cancelar`;
      }
    }
    // pie y barra de listos
    const ready = this.selectReady();
    document.getElementById('ready-bar').classList.toggle('show', ready);
    const sub = document.getElementById('ready-sub');
    if (S.mode === 'online' && ready) sub.textContent = Net.role === 'host' ? 'Pulsa Intro o haz clic para elegir escenario' : 'Esperando a que el anfitrión elija escenario…';
    else sub.textContent = 'Pulsa Intro o haz clic';
    const foot = document.getElementById('sel-foot');
    const k = (a) => this.kbd(a);
    if (S.mode === 'online') foot.innerHTML = `${k('left')}${k('right')} mover · ${k('light')} elegir · ${k('heavy')} cancelar · Ping: <b id="sel-ping">—</b>`;
    else if (S.mode === 'local') foot.innerHTML = `J1: ${k('left')}${k('right')} + ${k('light')} · J2: ${this.kbd('left', 'kb2')}${this.kbd('right', 'kb2')} + ${this.kbd('light', 'kb2')} · mandos: cruceta + <span class="kbd">A</span> · <span class="kbd">B</span> añadir bot`;
    else foot.innerHTML = `${k('left')}${k('right')} mover · ${k('light')} o clic para elegir · ${k('heavy')} cancelar · <span class="kbd">Esc</span> volver`;
  },

  selectReady() {
    const S = this.sel;
    if (!S || S.slots.length < 2) return false;
    return S.slots.every((s) => s.kind === 'bot' || s.locked);
  },

  // entradas por jugador en la selección
  selectInput() {
    const S = this.sel;
    let changed = false;
    const menuAny = () => {
      const ev = { left: false, right: false, up: false, down: false, ok: false, back: false };
      for (const src of ['kb1', 'kb2', 'pad0', 'pad1', 'pad2', 'pad3']) {
        const e = Input.menuFor(src);
        for (const k in ev) ev[k] = ev[k] || e[k];
      }
      return ev;
    };
    // nuevos jugadores (local)
    if (S.mode === 'local') {
      for (const src of ['kb2', 'pad0', 'pad1', 'pad2', 'pad3']) {
        if (S.slots.some((s) => s.source === src)) continue;
        const ev = Input.menuFor(src);
        if (ev.ok) {
          if (S.slots.length >= 4) { const bi = S.slots.findIndex((s) => s.kind === 'bot'); if (bi >= 0) S.slots.splice(bi, 1); else continue; }
          // los humanos van antes que los bots
          const firstBot = S.slots.findIndex((s) => s.kind === 'bot');
          const s = this.mkHuman(src);
          if (firstBot >= 0) S.slots.splice(firstBot, 0, s); else S.slots.push(s);
          Sfx.play('ok');
          this.buildSlots(); changed = true;
          s._justJoined = true;
        }
      }
    }
    for (const s of S.slots) {
      if (s.kind !== 'human') continue;
      if (s._justJoined) { s._justJoined = false; continue; }
      const ev = s.source === 'any' ? menuAny() : Input.menuFor(s.source);
      const n = CHARACTERS.length + 1;
      if (!s.locked) {
        if (ev.left) { s.cursor = (s.cursor - 1 + n) % n; Sfx.play('move'); changed = true; }
        if (ev.right) { s.cursor = (s.cursor + 1) % n; Sfx.play('move'); changed = true; }
        if (ev.ok) { this.lockSlot(s); changed = true; }
        else if (ev.back && S.mode === 'local' && S.slots.indexOf(s) > 0) {
          S.slots.splice(S.slots.indexOf(s), 1); this.buildSlots(); changed = true; Sfx.play('back'); break;
        }
      } else if (ev.back) { s.locked = false; Sfx.play('back'); changed = true; }
      else if (ev.ok && this.selectReady()) { this.selectConfirm(); return; }
    }
    // atajos de teclado para bots
    const T = Input.menuTapped;
    if (S.mode === 'bots' || S.mode === 'local') {
      if (T.has('KeyB') && S.slots.length < 4) { this.addBot('normal'); this.buildSlots(); changed = true; Sfx.play('ok'); }
      if (T.has('KeyN')) {
        const i = S.slots.map((s) => s.kind).lastIndexOf('bot');
        if (i >= 0 && S.slots.length > 1) { S.slots.splice(i, 1); this.buildSlots(); changed = true; Sfx.play('back'); }
      }
    }
    if (T.has('Enter') || T.has('NumpadEnter')) { if (this.selectReady()) { this.selectConfirm(); return; } }
    if (T.has('Escape')) { this.selectBack(); return; }
    if (changed) { this.selectChanged(); if (S.mode === 'online') this.sendSel(); }
  },
  lockSlot(s) {
    s.locked = true;
    s.charId = s.cursor < CHARACTERS.length ? CHARACTERS[s.cursor].id : null;
    Sfx.play('lock');
    if (s.el) { s.el.animate([{ transform: 'translateY(-6px) scale(1.04)' }, { transform: 'translateY(-6px) scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.4)' }); }
  },
  mouseHover(i) {
    const s = this.sel && this.sel.slots.find((q) => q.kind === 'human' && !q.locked && (q.source === 'any' || q.source === 'kb1'));
    if (s && s.cursor !== i) { s.cursor = i; this.selectChanged(); if (this.sel.mode === 'online') this.sendSel(); }
  },
  mousePick(i) {
    const S = this.sel;
    let s = S.slots.find((q) => q.kind === 'human' && !q.locked && (q.source === 'any' || q.source === 'kb1'));
    if (!s) s = S.slots.find((q) => q.kind === 'human' && (q.source === 'any' || q.source === 'kb1'));
    if (!s) return;
    s.cursor = i; this.lockSlot(s);
    this.selectChanged();
    if (S.mode === 'online') this.sendSel();
  },
  selectBack() {
    const S = this.sel;
    if (S && S.mode === 'online') { Net.close(); this.show('online'); this.resetOnlineBox(); this.netStatus('Has salido de la sala.'); return; }
    this.show('title');
  },
  selectConfirm() {
    if (!this.selectReady()) return;
    if (this.sel.mode === 'online' && Net.role !== 'host') return;
    Sfx.play('ok');
    if (this.sel.mode === 'training') { this.sel.stage = 'dojo'; this.startFromSelect(); return; }
    this.show('stage', { focus: '[data-stage]' });
  },

  // ═════════════ ESCENARIO ═════════════
  renderStage() {
    document.querySelectorAll('#stage-grid .stage-card').forEach((c) => {
      const def = STAGES.find((d) => d.id === c.dataset.stage);
      if (def && !c._drawn) { c._drawn = true; requestAnimationFrame(() => drawStageThumb(c.querySelector('canvas'), def)); }
    });
    this.refreshRounds();
  },
  refreshRounds() {
    document.querySelectorAll('#rounds [data-ft]').forEach((b) => b.classList.toggle('on', +b.dataset.ft === this.sel.firstTo));
  },
  stageChosen(id) {
    this.sel.stage = id;
    this.startFromSelect();
  },

  startFromSelect() {
    const S = this.sel;
    const rng = VISUAL_RNG;
    const stageId = S.stage === 'random' || !S.stage ? rng.pick(STAGES).id : S.stage;
    const players = S.slots.map((s, i) => {
      let charId = s.kind === 'remote' ? s.charId : (s.kind === 'bot' ? s.charId : s.charId);
      if (!charId) charId = rng.pick(CHARACTERS).id;
      const p = { charId, slot: i, tag: s.tag, team: i };
      if (s.kind === 'bot') { p.source = 'bot'; p.level = s.level; }
      else if (s.kind === 'remote' || S.mode === 'online') p.source = 'net';
      else p.source = s.source;
      return p;
    });
    if (S.mode === 'online') {
      const delay = Net.suggestDelay();
      const cfg = { seed: (Math.random() * 4294967296) >>> 0, stage: stageId, firstTo: S.firstTo, chars: players.map((p) => p.charId), delay };
      Net.send({ t: 'start', cfg });
      // el anfitrión arranca medio ping después para ir a la par que el invitado
      setTimeout(() => App.startOnline(cfg), Math.min(250, (Net.rtt || 0) / 2));
      return;
    }
    S.lastPlayers = players; S.lastStage = stageId;
    App.startMatch({ mode: S.mode, stage: stageId, players, firstTo: S.mode === 'training' ? 99 : S.firstTo });
  },

  // ═════════════ ONLINE ═════════════
  netStatus(msg, kind) {
    const el = document.getElementById('net-status');
    // dentro de un visor incrustado (p. ej. Claude) WebRTC está bloqueado
    if (kind === 'err' && window.self !== window.top && !Net.params().local) {
      msg += ' El modo online no funciona dentro de este visor: juega desde <a href="https://lkboto.github.io/duelo/" target="_blank" rel="noopener" style="color:var(--accent)">lkboto.github.io/duelo</a>.';
    }
    el.className = 'net-status' + (kind === 'err' ? ' err' : '');
    el.innerHTML = (kind === 'wait' ? '<div class="spinner"></div>' : '') + `<span>${msg}</span>`;
  },
  resetOnlineBox() {
    document.getElementById('room-code').hidden = true;
    document.getElementById('btn-copy').hidden = true;
    document.getElementById('btn-host').hidden = false;
    const q = new URLSearchParams(location.search).get('sala');
    if (q) document.getElementById('code-in').value = q.toUpperCase();
  },
  wireNet() {
    Net.on.connect = () => {};
    Net.on.hello = () => {
      this.netStatus('¡Conectado!');
      this.openSelect('online');
    };
    Net.on.error = (e) => { this.netStatus(e.message || String(e.type || e), 'err'); };
    Net.on.disconnect = () => this.netLost('Se ha perdido la conexión con el rival.');
    Net.on.bye = () => this.netLost('El rival ha salido de la sala.');
    Net.on.msg = (m) => {
      if (m.t === 'sel') {
        const r = this.sel && this.sel.slots.find((s) => s.kind === 'remote');
        if (!r) return;
        r.cursor = m.cursor; r.locked = m.locked; r.charId = m.charId;
        if (this.cur === 'select') this.selectChanged();
        else if (this.cur === 'stage' && !this.selectReady()) this.show('select');
      } else if (m.t === 'start') {
        App.startOnline(m.cfg);
      } else if (m.t === 'tosel') {
        if (this.cur !== 'select') { App.stopMatch(); this.openSelect('online', true); }
      }
    };
  },
  netLost(msg) {
    const inGame = App.match && App.match.mode === 'online';
    Net.close();
    App.stopMatch();
    this.show('online');
    this.resetOnlineBox();
    this.netStatus(msg, 'err');
    if (inGame) this.toast(msg, 4000);
  },
  async onlineHost() {
    this.wireNet();
    this.netStatus('Creando sala…', 'wait');
    try {
      const code = await Net.create();
      const rc = document.getElementById('room-code');
      rc.textContent = code; rc.hidden = false;
      document.getElementById('btn-copy').hidden = false;
      document.getElementById('btn-host').hidden = true;
      this.netStatus('Esperando a que tu rival se una con el código ' + code + '…', 'wait');
    } catch (e) {
      this.netStatus('No se pudo crear la sala. ' + (e.message || e), 'err');
      document.getElementById('btn-host').hidden = false;
    }
  },
  async onlineJoin() {
    const code = document.getElementById('code-in').value.trim().toUpperCase();
    if (code.length < 4) { this.netStatus('Escribe el código de la sala.', 'err'); return; }
    this.wireNet();
    this.netStatus('Conectando con la sala ' + code + '…', 'wait');
    try { await Net.join(code); }
    catch (e) { this.netStatus(e.message || 'No se pudo conectar', 'err'); }
  },
  copyLink() {
    const url = location.origin + location.pathname + '?sala=' + Net.code + (Net.params().local ? '&net=local' : '');
    const done = () => this.toast('Enlace copiado: ' + url);
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => this.toast(url, 6000));
    else this.toast(url, 6000);
  },
  sendSel() {
    const me = this.sel && this.sel.slots.find((s) => s.net === 'me');
    if (me) Net.send({ t: 'sel', cursor: me.cursor, locked: me.locked, charId: me.locked ? me.charId : null });
  },

  // ═════════════ PAUSA / RESULTADOS ═════════════
  pauseAction(a) {
    const m = App.match;
    if (a === 'resume') App.resume();
    else if (a === 'moves') { const F = m && m.fighters.find((q) => q.isHuman); this.openMoves(F ? F.char.id : null, 'pause'); }
    else if (a === 'controls') this.openSub('controls', 'pause');
    else if (a === 'restart') App.restart();
    else if (a === 'select') { App.stopMatch(); this.openSelect(this.sel.mode, true); }
    else if (a === 'quit') { App.stopMatch(); if (Net.t) Net.close(); this.show('title'); }
  },
  showResults(champ, m) {
    const pc = champ.color;
    const panel = this.screens.results;
    panel.style.setProperty('--pc', pc);
    document.getElementById('res-big').textContent = champ.char.name + ' GANA';
    const who = m.mode === 'online' ? (champ.id === Net.me ? '¡Has ganado!' : 'Ha ganado tu rival') : champ.tag + (champ.bot ? ' (bot)' : '');
    document.getElementById('res-sub').textContent = who + ' · ' + champ.wins + ' rondas';
    const rows = m.fighters.map((F) => `<tr><td><span class="dot" style="background:${F.color}"></span>${F.char.name} <span style="color:var(--muted)">${F.tag}</span>${F === champ ? '<span class="crown">★</span>' : ''}</td>
      <td class="n">${F.wins}</td><td class="n">${Math.round(F.stats.dmgDealt)}</td><td class="n">${F.stats.maxCombo}</td><td class="n">${F.stats.kos}</td></tr>`).join('');
    document.getElementById('res-table').innerHTML = `<tr><th>Luchador</th><th style="text-align:right">Rondas</th><th style="text-align:right">Daño hecho</th><th style="text-align:right">Combo máx.</th><th style="text-align:right">K.O.</th></tr>${rows}`;
    this.winnerShow = new Showcase(document.getElementById('res-canvas'), 1);
    this.winnerShow.setChar(champ.char.id, champ.color);
    const again = panel.querySelector('[data-r=again]');
    again.hidden = m.mode === 'online';
    panel.querySelector('[data-r=select]').querySelector('span').textContent = m.mode === 'online' ? 'Volver a la sala' : 'Cambiar personajes';
    this.show('results', { focus: m.mode === 'online' ? '[data-r=select]' : '[data-r=again]' });
  },
  resultsAction(a) {
    this.winnerShow = null;
    if (a === 'again') App.restart();
    else if (a === 'select') {
      App.stopMatch();
      if (this.sel.mode === 'online') Net.send({ t: 'tosel' });
      this.openSelect(this.sel.mode, true);
    } else { App.stopMatch(); if (Net.t) Net.close(); this.show('title'); }
  },

  // ═════════════ CONTROLES ═════════════
  renderControls() {
    const cols = document.getElementById('ctrl-cols');
    cols.innerHTML = '';
    for (const [src, title] of [['kb1', 'Jugador 1 · Teclado'], ['kb2', 'Jugador 2 · Teclado']]) {
      const col = this.h(`<div class="ctrl-col"><h4>${title}</h4></div>`);
      for (const a of ACTIONS) {
        const codes = Input.bindings[src][a];
        const row = this.h(`<div class="ctrl-row"><span>${ACTION_LABELS[a]}</span></div>`);
        for (let j = 0; j < 2; j++) {
          const code = codes[j];
          const b = this.h(`<button class="keybtn ${code ? '' : 'empty'}" data-nav>${code ? keyLabel(code) : '—'}</button>`);
          b.addEventListener('click', () => this.captureKey(b, src, a, j));
          row.appendChild(b);
        }
        col.appendChild(row);
      }
      cols.appendChild(col);
    }
  },
  captureKey(btn, src, action, j) {
    if (Input.captureCb) return;
    btn.classList.add('wait'); btn.textContent = 'Pulsa…';
    Input.captureCb = (code) => {
      btn.classList.remove('wait');
      if (code === 'Escape') { this.renderControls(); return; }
      const arr = Input.bindings[src][action].slice(0, 2);
      if (code === 'Delete' || code === 'Backspace') arr.splice(j, 1);
      else {
        arr[j] = code;
        // quita esa tecla de otras acciones del mismo teclado (salvo saltar/arriba)
        for (const a of ACTIONS) {
          if (a === action) continue;
          const pair = (action === 'jump' && a === 'up') || (action === 'up' && a === 'jump');
          if (pair) continue;
          const other = Input.bindings[src][a];
          const k = other.indexOf(code);
          if (k >= 0) { other.splice(k, 1); this.toast(`${keyLabel(code)} ya no hace «${ACTION_LABELS[a]}»`); }
        }
      }
      Input.bindings[src][action] = arr.filter(Boolean);
      Input.saveBindings();
      this.renderControls();
      Sfx.play('ok');
    };
  },

  renderOptions() {
    document.getElementById('opt-vol').value = Math.round(Sfx.volume * 100);
    document.getElementById('opt-shake').value = Math.round(Settings.shake * 100);
    document.querySelectorAll('[data-dn]').forEach((b) => b.classList.toggle('on', (b.dataset.dn === '1') === Settings.dmgNumbers));
  },

  // ═════════════ MOVIMIENTOS ═════════════
  openMoves(charId, from) {
    this.backTo = from || this.cur;
    const tabs = document.getElementById('moves-tabs');
    tabs.innerHTML = '';
    const pick = (id) => {
      this.movesChar = id;
      tabs.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === id));
      this.renderMoves(id);
    };
    tabs.appendChild(Object.assign(this.h(`<button class="btn small" data-nav data-c="basics"><span>Básicos</span></button>`)));
    for (const ch of CHARACTERS) tabs.appendChild(this.h(`<button class="btn small" data-nav data-c="${ch.id}" style="--pc:${ch.color}"><span>${ch.name}</span></button>`));
    tabs.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.c)));
    this.show('moves', { keepPrev: true, focus: `[data-c="${charId || 'basics'}"]` });
    pick(charId || 'basics');
  },
  renderMoves(id) {
    const body = document.getElementById('moves-body');
    const k = (a) => this.kbd(a);
    if (id === 'basics') {
      body.style.removeProperty('--pc');
      body.innerHTML = `
        <div class="moves-grid">
          <div>
            <h5 style="color:var(--accent)">Controles</h5>
            <div class="mv"><span class="in">${k('left')} ${k('right')}</span><span class="d">Moverse (doble ${k('down')} atraviesa plataformas)</span></div>
            <div class="mv"><span class="in">${k('jump')}</span><span class="d">Saltar · mantén para saltar más · doble salto en el aire · rebota en paredes</span></div>
            <div class="mv"><span class="in">${k('light')}</span><span class="d">Ataque ligero (encadena hasta 3)</span></div>
            <div class="mv"><span class="in">${k('heavy')}</span><span class="d">Ataque fuerte · con ${k('up')} o ${k('down')} cambia de golpe</span></div>
            <div class="mv"><span class="in">${k('skill1')} ${k('skill2')}</span><span class="d">Habilidades propias del personaje (tienen recarga)</span></div>
            <div class="mv"><span class="in">${k('dash')}</span><span class="d">Esquiva / dash: invulnerable un instante, también en el aire</span></div>
            <div class="mv"><span class="in">${k('down')} en el aire</span><span class="d">Caída rápida</span></div>
          </div>
          <div>
            <h5 style="color:var(--accent)">Cómo hacer combos</h5>
            <ul class="tips">
              <li><b>Cadena ligera:</b> pulsa ligero tres veces seguidas.</li>
              <li><b>Cancelar:</b> si un golpe conecta, puedes cortarlo con un ataque fuerte o una habilidad al instante.</li>
              <li><b>Seguir en el aire:</b> tras un golpe que levanta (↑+fuerte, ↓+fuerte), salta o haz dash para perseguirlo.</li>
              <li>Las entradas se guardan unos fotogramas: puedes pulsar el siguiente golpe un poco antes.</li>
              <li>El daño baja en combos muy largos y el rival cae más rápido: remata con un golpe fuerte.</li>
              <li><b>Tech:</b> si sales volando, pulsa ${k('dash')} justo antes de tocar el suelo para levantarte al instante.</li>
              <li>Pierdes si tu vida llega a cero o si te sacan del escenario.</li>
            </ul>
          </div>
        </div>`;
      return;
    }
    const ch = CHAR_BY_ID[id];
    body.style.setProperty('--pc', ch.color);
    const row = (inp, d) => `<div class="mv"><span class="in">${inp}</span><span class="d">${d}</span></div>`;
    const sk = ch.skills;
    body.innerHTML = `
      <p style="margin:0 0 14px"><b style="color:${ch.color}">${ch.name}</b> · ${ch.title}. ${ch.desc}</p>
      <div class="moves-grid">
        <div>
          <h5>Golpes</h5>
          ${row(`${k('light')} ×3`, 'Cadena ligera de tres golpes')}
          ${row(`${k('heavy')}`, 'Golpe fuerte frontal')}
          ${row(`${k('up')} + ${k('heavy')}`, 'Lanzador hacia arriba (cancelable en salto)')}
          ${row(`${k('down')} + ${k('heavy')}`, 'Barrido bajo que levanta')}
          ${row(`Aire ${k('light')}`, 'Golpe aéreo rápido')}
          ${row(`Aire ${k('heavy')}`, 'Golpe aéreo fuerte')}
          ${row(`Aire ${k('down')} + ${k('heavy')}`, 'Ataque en picado (rebota si acierta)')}
          ${row(`${k('skill1')}`, `<b>${sk[0].name}:</b> ${sk[0].desc}`)}
          ${row(`${k('skill2')}`, `<b>${sk[1].name}:</b> ${sk[1].desc}`)}
        </div>
        <div>
          <h5>Combos</h5>
          ${(COMBOS[id] || []).map((c) => `<div class="combo"><div class="seq">${c.seq}</div><div class="note">${c.note}</div></div>`).join('')}
          <p style="font-size:15px;color:var(--muted);margin-top:12px">L = ligero · las flechas indican dirección + fuerte.</p>
        </div>
      </div>`;
  },

  // ═════════════ ENTRADA POR FOTOGRAMA ═════════════
  frame(dt) {
    const name = this.cur;
    if (Input.captureCb) { Input.clearMenu(); return; }
    if (name === 'select') this.selectInput();
    else if (name === 'fight') {
      const ev = Input.menu();
      if (ev.pause) App.pause();
      if (App.match && App.match.mode === 'training') {
        if (Input.menuTapped.has('F2')) App.match.debug = !App.match.debug;
        if (Input.menuTapped.has('KeyR')) App.match.fighters.forEach((F) => App.match.respawn(F));
      }
    } else if (name !== 'fight') this.genericNav();
    // previsualizaciones
    if (name === 'select') for (const s of this.showcases) { s.update(dt); s.draw(); }
    if (name === 'results' && this.winnerShow) { this.winnerShow.update(dt); this.winnerShow.draw(); }
    // ping en la selección online
    if (name === 'select' && this.sel && this.sel.mode === 'online') {
      const el = document.getElementById('sel-ping');
      if (el) el.textContent = Net.rtt ? Math.round(Net.rtt) + ' ms' : '—';
    }
  },
  genericNav() {
    const ev = Input.menu();
    const scr = this.screens[this.cur];
    const ae = document.activeElement;
    const typing = ae && ae.tagName === 'INPUT' && ae.type === 'text';
    if (ev.back || (Input.menuTapped.has('Escape'))) {
      if (this.cur === 'pause') App.resume();
      else if (this.cur === 'stage') this.show('select');
      else if (this.cur === 'online') { Net.close(); this.show('title'); }
      else if (this.cur === 'results') { /* nada */ }
      else if (this.cur !== 'title') this.back();
      return;
    }
    if (typing) return;
    for (const d of ['up', 'down', 'left', 'right']) {
      if (!ev[d]) continue;
      if (ae && ae.type === 'range' && (d === 'left' || d === 'right')) {
        ae.value = +ae.value + (d === 'left' ? -1 : 1) * (+ae.step || 1) * 2;
        ae.dispatchEvent(new Event('input')); ae.dispatchEvent(new Event('change'));
        continue;
      }
      this.navMove(scr, d);
    }
    if (ev.ok && ae && scr.contains(ae) && ae.tagName === 'BUTTON') ae.click();
  },
  navMove(root, dir) {
    const items = [...root.querySelectorAll('[data-nav]')].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
    if (!items.length) return;
    const cur = document.activeElement;
    if (!items.includes(cur)) { items[0].focus({ preventScroll: true }); return; }
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bd = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      let main, side;
      if (dir === 'up') { if (dy > -4) continue; main = -dy; side = Math.abs(dx); }
      else if (dir === 'down') { if (dy < 4) continue; main = dy; side = Math.abs(dx); }
      else if (dir === 'left') { if (dx > -4) continue; main = -dx; side = Math.abs(dy); }
      else { if (dx < 4) continue; main = dx; side = Math.abs(dy); }
      const d = main + side * 2.2;
      if (d < bd) { bd = d; best = el; }
    }
    if (best) { best.focus({ preventScroll: true }); Sfx.play('move'); }
  },
};

// Miniatura de un escenario para la pantalla de elección
function drawStageThumb(canvas, def) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const st = new Stage(def);
  for (let i = 0; i < 60; i++) st.update();
  const zoom = h / 1000;
  const cam = { x: st.cx, y: st.cy + 40, zoom, w, h, refZoom: zoom };
  st.drawBg(ctx, cam);
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y);
  st.drawPlats(ctx);
  if (st.drawFg) st.drawFg(ctx, cam);
  ctx.restore();
}

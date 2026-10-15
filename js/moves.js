// Repertorio de golpes de cada personaje.
// A partir del ataque ligero y fuerte de cada uno se generan automáticamente
// el resto de movimientos (combo de 3 golpes, lanzador, aéreos, picado y
// ataque en carrera). Un personaje puede sobrescribir cualquiera con `moves`.

const NAMES = {
  sword:   { light2: 'Revés', light3: 'Torbellino', launcher: 'Corte ascendente', airLight: 'Tajo aéreo', airHeavy: 'Caída de hoja', plunge: 'Estocada en picado', dashLight: 'Corte en carrera' },
  hammer:  { light2: 'Revés de martillo', light3: 'Molinete', launcher: 'Mazazo ascendente', airLight: 'Martillazo aéreo', airHeavy: 'Meteoro', plunge: 'Impacto', dashLight: 'Carga con martillo' },
  spear:   { light2: 'Barrido corto', light3: 'Molino', launcher: 'Alzada', airLight: 'Lanzazo aéreo', airHeavy: 'Clavada', plunge: 'Picado', dashLight: 'Carga de lanza' },
  daggers: { light2: 'Doble corte', light3: 'Remolino', launcher: 'Tajo ascendente', airLight: 'Danza aérea', airHeavy: 'Caída cruzada', plunge: 'Picado', dashLight: 'Corte fugaz' },
  bow:     { light2: 'Revés de arco', light3: 'Patada giratoria', launcher: 'Golpe ascendente', airLight: 'Golpe aéreo', airHeavy: 'Arco en picado', plunge: 'Caída', dashLight: 'Golpe en carrera' },
  fists:   { light2: 'Gancho', light3: 'Patada giratoria', launcher: 'Uppercut', airLight: 'Patada voladora', airHeavy: 'Patada hacha', plunge: 'Pisotón', dashLight: 'Puñetazo en carrera' },
  scythe:  { light2: 'Revés', light3: 'Siega giratoria', launcher: 'Cosecha', airLight: 'Tajo aéreo', airHeavy: 'Guillotina', plunge: 'Picado', dashLight: 'Siega en carrera' },
  staff:   { light2: 'Revés', light3: 'Molinete', launcher: 'Alzada', airLight: 'Golpe aéreo', airHeavy: 'Martillo arcano', plunge: 'Picado', dashLight: 'Embestida' },
};

// Movimiento universal: agachado + ataque ligero
export const SWEEP = {
  name: 'Barrido', anim: 'sweepKick',
  startup: 6, active: 4, recovery: 14, groundOnly: true, knockdown: true,
  damage: 40, hitstun: 20, blockstun: 10, push: 3, hitstop: 5,
  hitbox: { x: 4, y: -28, w: 74, h: 28 },
};

const cache = new WeakMap();

export function buildMoves(def) {
  if (cache.has(def)) return cache.get(def);
  const L = def.attacks.light;
  const H = def.attacks.heavy;
  const lh = L.hitbox;
  const heavyDmg = H.damage || H.projectile?.damage || 90;
  const n = NAMES[def.weaponType] || NAMES.sword;

  const moves = {
    light1: { ...L, step: L.step ?? 2.5, chain: 'light2' },
    light2: {
      name: n.light2, anim: 'backhand',
      startup: Math.max(3, L.startup - 1), active: L.active, recovery: L.recovery + 1,
      damage: Math.round(L.damage * 0.9), hitstun: L.hitstun + 1, blockstun: L.blockstun, push: L.push, hitstop: L.hitstop,
      hitbox: { x: lh.x, y: lh.y - 16, w: lh.w + 4, h: lh.h + 16 }, step: 3, chain: 'light3',
    },
    light3: {
      name: n.light3, anim: 'spin',
      startup: L.startup + 4, active: L.active + 3, recovery: L.recovery + 8,
      damage: Math.round(L.damage * 1.6), hitstun: 22, blockstun: L.blockstun + 3, push: 7, hitstop: L.hitstop + 3,
      knockdown: true, hitbox: { x: lh.x - 12, y: lh.y - 22, w: lh.w + 24, h: lh.h + 36 }, step: 5,
    },
    heavy: { ...H, step: H.projectile ? 0 : (H.step ?? 3) },
    launcher: {
      name: n.launcher, anim: 'rising',
      startup: 8, active: 4, recovery: 18, launch: true,
      damage: Math.round(L.damage * 1.3), hitstun: 30, blockstun: 12, push: 2, hitstop: 8,
      hitbox: { x: Math.max(0, lh.x - 8), y: -158, w: Math.round(lh.w * 0.85), h: 158 }, step: 2, jumpCancel: true,
    },
    sweep: SWEEP,
    airLight: {
      name: n.airLight, anim: 'airSlash', air: true,
      startup: 5, active: 5, recovery: 10,
      damage: Math.round(L.damage * 0.9), hitstun: 16, blockstun: 9, push: 3, hitstop: 5,
      hitbox: { x: -4, y: -116, w: lh.w + 14, h: 96 },
    },
    airHeavy: {
      name: n.airHeavy, anim: 'airOverhead', air: true,
      startup: 9, active: 5, recovery: 14, knockdown: true,
      damage: Math.round(heavyDmg * 0.75), hitstun: 22, blockstun: 13, push: 6, hitstop: 8,
      hitbox: { x: 4, y: -96, w: lh.w + 22, h: 118 },
    },
    plunge: {
      name: n.plunge, anim: 'plunge', air: true, dive: 15,
      startup: 6, active: 40, recovery: 14, knockdown: true,
      damage: 70, hitstun: 22, blockstun: 12, push: 6, hitstop: 8,
      hitbox: { x: -22, y: -56, w: 84, h: 66 },
    },
    dashLight: {
      name: n.dashLight, anim: 'dashSlash',
      startup: 4, active: 6, recovery: 14,
      damage: Math.round(L.damage * 1.2), hitstun: 18, blockstun: 10, push: 5, hitstop: 6,
      hitbox: { x: lh.x, y: lh.y - 6, w: lh.w + 22, h: lh.h + 10 }, keepMomentum: true,
    },
    ...(def.moves || {}),
  };
  cache.set(def, moves);
  return moves;
}

// Lista para la pantalla de selección: [entrada, nombre]
export function moveList(def) {
  const m = buildMoves(def);
  // {L} y {H} se sustituyen por las teclas de cada jugador
  return [
    ['{L} ×3', `${m.light1.name} · ${m.light2.name} · ${m.light3.name}`],
    ['↓+{L}', m.sweep.name],
    ['{H}', m.heavy.name],
    ['↓+{H}', m.launcher.name],
    ['Aire', `{L} ${m.airLight.name} · {H} ${m.airHeavy.name} · ↓{H} ${m.plunge.name}`],
    ['Dash+{L}', m.dashLight.name],
  ];
}

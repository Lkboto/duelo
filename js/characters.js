// Definición de personajes: solo datos, sin lógica.
// Para añadir un personaje nuevo basta con crear otra entrada aquí.
//
// Hitbox: x = distancia desde el centro del personaje hacia donde mira,
//         y = altura desde los pies (negativo = hacia arriba), w/h = tamaño.
// Tiempos en frames (60 frames = 1 segundo).

export const CHARACTERS = {
  kael: {
    id: 'kael',
    name: 'Kael',
    weapon: 'Espada',
    weaponType: 'sword',
    description: 'Rápido y equilibrado. Presiona con cortes veloces y castiga con su contraataque.',
    color: '#3fb6ff',
    dark: '#1c5a8a',
    skin: '#f1c7a3',
    hair: '#2b1d14',
    maxHp: 1000,
    walkSpeed: 4.2,
    jumpVel: -15.5,
    gravity: 0.8,
    width: 48,
    height: 120,
    attacks: {
      light: {
        name: 'Corte rápido', anim: 'slash',
        startup: 5, active: 3, recovery: 10,
        damage: 45, hitstun: 15, blockstun: 10, push: 3.5, hitstop: 5,
        hitbox: { x: 18, y: -98, w: 78, h: 34 },
      },
      heavy: {
        name: 'Tajo descendente', anim: 'overhead',
        startup: 13, active: 4, recovery: 22,
        damage: 100, hitstun: 24, blockstun: 16, push: 8, hitstop: 9,
        hitbox: { x: 18, y: -125, w: 102, h: 80 },
      },
    },
    skills: {
      neutral: {
        name: 'Onda cortante', anim: 'cast', cooldown: 150,
        startup: 14, active: 1, recovery: 20,
        projectile: {
          x: 40, y: -80, w: 34, h: 50, speed: 9, life: 85, style: 'wave',
          damage: 70, hitstun: 18, blockstun: 12, push: 5, hitstop: 6,
        },
      },
      forward: {
        name: 'Estocada', anim: 'thrust', cooldown: 210,
        startup: 7, active: 9, recovery: 20,
        dash: { speed: 13, from: 7, to: 16 },
        damage: 80, hitstun: 20, blockstun: 12, push: 6, hitstop: 7,
        hitbox: { x: 18, y: -92, w: 74, h: 30 },
      },
      down: {
        name: 'Contraataque', anim: 'guard', cooldown: 270,
        startup: 3, active: 22, recovery: 18,
        counter: { damage: 130, hitstun: 32, push: 10, hitstop: 14 },
      },
    },
  },

  brakka: {
    id: 'brakka',
    name: 'Brakka',
    weapon: 'Martillo',
    weaponType: 'hammer',
    description: 'Lento pero demoledor. Su ataque fuerte rompe la guardia y aguanta golpes al cargar.',
    color: '#ff7a3d',
    dark: '#8a3415',
    skin: '#c98b63',
    hair: '#5a1f0c',
    maxHp: 1150,
    walkSpeed: 3.0,
    jumpVel: -14,
    gravity: 0.82,
    width: 62,
    height: 130,
    attacks: {
      light: {
        name: 'Mazazo', anim: 'slash',
        startup: 8, active: 4, recovery: 13,
        damage: 60, hitstun: 16, blockstun: 11, push: 5, hitstop: 6,
        hitbox: { x: 20, y: -105, w: 82, h: 44 },
      },
      heavy: {
        name: 'Rompeguardias', anim: 'overhead',
        startup: 20, active: 5, recovery: 26,
        damage: 140, hitstun: 28, blockstun: 20, push: 11, hitstop: 12,
        guardBreak: true,
        hitbox: { x: 18, y: -145, w: 112, h: 145 },
      },
    },
    skills: {
      neutral: {
        name: 'Onda sísmica', anim: 'slam', cooldown: 180,
        startup: 18, active: 1, recovery: 24,
        projectile: {
          x: 50, y: -24, w: 50, h: 48, speed: 6.5, life: 115, style: 'quake', groundOnly: true,
          damage: 80, hitstun: 22, blockstun: 14, push: 6, hitstop: 7,
        },
      },
      forward: {
        name: 'Embestida', anim: 'charge', cooldown: 240,
        startup: 10, active: 16, recovery: 22,
        dash: { speed: 10, from: 10, to: 26 },
        armor: { from: 4, to: 26 },
        damage: 90, hitstun: 22, blockstun: 14, push: 12, hitstop: 9,
        hitbox: { x: 14, y: -112, w: 66, h: 92 },
      },
      down: {
        name: 'Terremoto', anim: 'slam', cooldown: 300,
        startup: 16, active: 4, recovery: 24,
        groundOnly: true, guardBreak: true,
        damage: 70, hitstun: 26, push: 4, hitstop: 10, launch: true,
        hitbox: { x: -135, y: -46, w: 270, h: 46 },
      },
    },
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

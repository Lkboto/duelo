// Definición de personajes: solo datos, sin lógica.
// Para añadir un personaje nuevo basta con crear otra entrada aquí.
//
// Hitbox: x = distancia desde el centro del personaje hacia donde mira,
//         y = altura desde los pies (negativo = hacia arriba), w/h = tamaño.
// Tiempos en frames (60 frames = 1 segundo).
//
// Propiedades especiales de golpes y habilidades:
//   projectile  proyectil (o lista de proyectiles). vy/g = trayectoria en arco,
//               speed 0 = trampa fija, groundOnly = solo golpea en el suelo
//   dash        se desplaza hacia delante (speed negativa = hacia atrás)
//   hop         salta durante el movimiento
//   teleport    aparece detrás del rival en el frame indicado
//   counter     anula golpes cuerpo a cuerpo y contraataca
//   armor       aguanta golpes sin interrumpirse
//   invuln      no recibe golpes durante esos frames
//   heal        recupera vida
//   rehit       vuelve a golpear cada N frames (multigolpe)
//   lifesteal   recupera parte del daño hecho
//   guardBreak  atraviesa el bloqueo
//   launch      levanta al rival

export const CHARACTERS = {
  kael: {
    id: 'kael', name: 'Kael', weapon: 'Espada', weaponType: 'sword',
    description: 'Rápido y equilibrado. Presiona con cortes veloces y castiga con su contraataque.',
    color: '#3a86ff',
    maxHp: 1000, walkSpeed: 4.2, jumpVel: -15.5, gravity: 0.8, width: 46, height: 120,
    attacks: {
      light: {
        name: 'Corte rápido', anim: 'slash',
        startup: 5, active: 3, recovery: 10,
        damage: 45, hitstun: 15, blockstun: 10, push: 3.5, hitstop: 5,
        hitbox: { x: 16, y: -100, w: 78, h: 38 },
      },
      heavy: {
        name: 'Tajo descendente', anim: 'overhead',
        startup: 13, active: 4, recovery: 22,
        damage: 100, hitstun: 24, blockstun: 16, push: 8, hitstop: 9,
        hitbox: { x: 16, y: -125, w: 100, h: 80 },
      },
    },
    skills: {
      neutral: {
        name: 'Onda cortante', anim: 'cast', cooldown: 150,
        startup: 14, active: 1, recovery: 20,
        projectile: { x: 40, y: -80, w: 34, h: 50, speed: 9, life: 85, style: 'wave',
          damage: 70, hitstun: 18, blockstun: 12, push: 5, hitstop: 6 },
      },
      forward: {
        name: 'Estocada', anim: 'thrust', cooldown: 210,
        startup: 7, active: 9, recovery: 20,
        dash: { speed: 13, from: 7, to: 16 },
        damage: 80, hitstun: 20, blockstun: 12, push: 6, hitstop: 7,
        hitbox: { x: 16, y: -92, w: 76, h: 30 },
      },
      down: {
        name: 'Contraataque', anim: 'guard', cooldown: 270,
        startup: 3, active: 22, recovery: 18,
        counter: { damage: 130, hitstun: 32, push: 10, hitstop: 14 },
      },
    },
  },

  brakka: {
    id: 'brakka', name: 'Brakka', weapon: 'Martillo', weaponType: 'hammer',
    description: 'Lento pero demoledor. Rompe guardias y aguanta golpes mientras embiste.',
    color: '#fb8500',
    maxHp: 1150, walkSpeed: 3.0, jumpVel: -14, gravity: 0.82, width: 56, height: 128,
    attacks: {
      light: {
        name: 'Mazazo', anim: 'slash',
        startup: 8, active: 4, recovery: 13,
        damage: 60, hitstun: 16, blockstun: 11, push: 5, hitstop: 6,
        hitbox: { x: 18, y: -108, w: 84, h: 48 },
      },
      heavy: {
        name: 'Rompeguardias', anim: 'overhead',
        startup: 20, active: 5, recovery: 26,
        damage: 140, hitstun: 28, blockstun: 20, push: 11, hitstop: 12, guardBreak: true,
        hitbox: { x: 16, y: -145, w: 112, h: 145 },
      },
    },
    skills: {
      neutral: {
        name: 'Onda sísmica', anim: 'slam', cooldown: 180,
        startup: 18, active: 1, recovery: 24,
        projectile: { x: 50, y: -24, w: 50, h: 48, speed: 6.5, life: 115, style: 'quake', groundOnly: true,
          damage: 80, hitstun: 22, blockstun: 14, push: 6, hitstop: 7 },
      },
      forward: {
        name: 'Embestida', anim: 'charge', cooldown: 240,
        startup: 10, active: 16, recovery: 22,
        dash: { speed: 10, from: 10, to: 26 }, armor: { from: 4, to: 26 },
        damage: 90, hitstun: 22, blockstun: 14, push: 12, hitstop: 9,
        hitbox: { x: 12, y: -112, w: 66, h: 92 },
      },
      down: {
        name: 'Terremoto', anim: 'slam', cooldown: 300,
        startup: 16, active: 4, recovery: 24,
        groundOnly: true, guardBreak: true, launch: true,
        damage: 70, hitstun: 26, push: 4, hitstop: 10,
        hitbox: { x: -135, y: -46, w: 270, h: 46 },
      },
    },
  },

  vera: {
    id: 'vera', name: 'Vera', weapon: 'Lanza', weaponType: 'spear',
    description: 'El mayor alcance del plantel. Mantén al rival a distancia y salta sobre él.',
    color: '#2ec27e',
    maxHp: 980, walkSpeed: 3.8, jumpVel: -15, gravity: 0.8, width: 44, height: 124,
    attacks: {
      light: {
        name: 'Pinchazo', anim: 'thrust',
        startup: 7, active: 3, recovery: 12,
        damage: 45, hitstun: 15, blockstun: 10, push: 4, hitstop: 5,
        hitbox: { x: 20, y: -94, w: 108, h: 24 },
      },
      heavy: {
        name: 'Barrido de lanza', anim: 'sweep',
        startup: 14, active: 5, recovery: 22,
        damage: 90, hitstun: 24, blockstun: 15, push: 8, hitstop: 8,
        hitbox: { x: 8, y: -64, w: 124, h: 44 },
      },
    },
    skills: {
      neutral: {
        name: 'Lanzamiento', anim: 'shoot', cooldown: 200,
        startup: 12, active: 1, recovery: 22,
        projectile: { x: 40, y: -90, w: 60, h: 14, speed: 12, life: 70, style: 'spear',
          damage: 75, hitstun: 20, blockstun: 12, push: 6, hitstop: 7 },
      },
      forward: {
        name: 'Salto de pértiga', anim: 'vault', cooldown: 230,
        startup: 18, active: 12, recovery: 16,
        dash: { speed: 8.5, from: 6, to: 30 }, hop: { at: 6, vy: -12 },
        damage: 85, hitstun: 22, blockstun: 14, push: 7, hitstop: 8,
        hitbox: { x: -10, y: -70, w: 84, h: 72 },
      },
      down: {
        name: 'Púas', anim: 'slam', cooldown: 240,
        startup: 12, active: 6, recovery: 22,
        groundOnly: true, launch: true,
        damage: 70, hitstun: 24, blockstun: 12, push: 5, hitstop: 8,
        hitbox: { x: 30, y: -44, w: 116, h: 44 },
      },
    },
  },

  nix: {
    id: 'nix', name: 'Nix', weapon: 'Dagas', weaponType: 'daggers',
    description: 'Frágil y escurridizo. Ataques rapidísimos, se teletransporta y esquiva.',
    color: '#9b5de5',
    maxHp: 1000, walkSpeed: 5.1, jumpVel: -16, gravity: 0.8, width: 40, height: 112,
    attacks: {
      light: {
        name: 'Puñalada', anim: 'slash',
        startup: 4, active: 2, recovery: 8,
        damage: 36, hitstun: 14, blockstun: 8, push: 2.5, hitstop: 4,
        hitbox: { x: 12, y: -92, w: 60, h: 34 },
      },
      heavy: {
        name: 'Tijera', anim: 'slash',
        startup: 9, active: 7, recovery: 16, rehit: 4,
        damage: 40, hitstun: 16, blockstun: 9, push: 2.5, hitstop: 5,
        hitbox: { x: 12, y: -100, w: 68, h: 50 },
      },
    },
    skills: {
      neutral: {
        name: 'Dagas lanzadas', anim: 'shoot', cooldown: 120,
        startup: 8, active: 1, recovery: 14,
        projectile: [
          { x: 30, y: -84, w: 22, h: 10, speed: 13, life: 60, style: 'dagger', damage: 28, hitstun: 12, blockstun: 8, push: 3, hitstop: 4 },
          { x: 30, y: -84, w: 22, h: 10, speed: 12, vy: -1.2, g: 0.02, life: 60, style: 'dagger', damage: 28, hitstun: 12, blockstun: 8, push: 3, hitstop: 4 },
        ],
      },
      forward: {
        name: 'Paso sombrío', anim: 'teleport', cooldown: 260,
        startup: 14, active: 4, recovery: 16, teleport: { at: 10 },
        damage: 70, hitstun: 22, blockstun: 12, push: 5, hitstop: 7,
        hitbox: { x: 10, y: -96, w: 64, h: 44 },
      },
      down: {
        name: 'Esquiva', anim: 'dodge', cooldown: 200,
        startup: 1, active: 14, recovery: 10,
        dash: { speed: -10, from: 1, to: 13 }, invuln: { from: 0, to: 16 },
      },
    },
  },

  sylva: {
    id: 'sylva', name: 'Sylva', weapon: 'Arco', weaponType: 'bow',
    description: 'Tiradora a distancia. Llena la pantalla de flechas y coloca trampas.',
    color: '#f2c40f',
    ranged: true,
    maxHp: 980, walkSpeed: 4.2, jumpVel: -15.5, gravity: 0.8, width: 42, height: 118,
    attacks: {
      light: {
        name: 'Golpe de arco', anim: 'slash',
        startup: 6, active: 3, recovery: 11,
        damage: 38, hitstun: 15, blockstun: 9, push: 5, hitstop: 5,
        hitbox: { x: 14, y: -98, w: 66, h: 38 },
      },
      heavy: {
        name: 'Flecha cargada', anim: 'shoot',
        startup: 16, active: 1, recovery: 18,
        projectile: { x: 40, y: -86, w: 44, h: 12, speed: 15, life: 70, style: 'arrow',
          damage: 85, hitstun: 20, blockstun: 12, push: 6, hitstop: 7 },
      },
    },
    skills: {
      neutral: {
        name: 'Flecha rápida', anim: 'shoot', cooldown: 55,
        startup: 9, active: 1, recovery: 14,
        projectile: { x: 40, y: -86, w: 36, h: 10, speed: 14, life: 70, style: 'arrow',
          damage: 50, hitstun: 15, blockstun: 9, push: 4, hitstop: 5 },
      },
      forward: {
        name: 'Lluvia de flechas', anim: 'shootUp', cooldown: 280,
        startup: 18, active: 1, recovery: 22,
        projectile: [7, 9, 11].map(s => ({
          x: 24, y: -104, w: 18, h: 18, speed: s, vy: -9, g: 0.45, life: 90, style: 'arrow',
          damage: 40, hitstun: 16, blockstun: 10, push: 4, hitstop: 5,
        })),
      },
      down: {
        name: 'Trampa', anim: 'slam', cooldown: 360,
        startup: 12, active: 1, recovery: 16,
        projectile: { x: 70, y: -8, w: 44, h: 16, speed: 0, life: 360, style: 'trap', groundOnly: true, unique: true,
          damage: 60, hitstun: 42, blockstun: 16, push: 1, hitstop: 8 },
      },
    },
  },

  tomo: {
    id: 'tomo', name: 'Tomo', weapon: 'Guanteletes', weaponType: 'fists',
    description: 'Cuerpo a cuerpo puro. Ráfagas de puñetazos, placajes y un agarre imbloqueable.',
    color: '#ef233c',
    maxHp: 1200, walkSpeed: 4.7, jumpVel: -15, gravity: 0.82, width: 50, height: 118,
    attacks: {
      light: {
        name: 'Jab', anim: 'punch',
        startup: 4, active: 2, recovery: 8,
        damage: 40, hitstun: 15, blockstun: 9, push: 2.5, hitstop: 4,
        hitbox: { x: 12, y: -96, w: 60, h: 32 },
      },
      heavy: {
        name: 'Gancho', anim: 'uppercut',
        startup: 10, active: 4, recovery: 18,
        damage: 90, hitstun: 24, blockstun: 14, push: 6, hitstop: 9, launch: true,
        hitbox: { x: 12, y: -118, w: 58, h: 70 },
      },
    },
    skills: {
      neutral: {
        name: 'Ráfaga', anim: 'barrage', cooldown: 180,
        startup: 6, active: 16, recovery: 14, rehit: 4,
        damage: 26, hitstun: 14, blockstun: 8, push: 1.2, hitstop: 3,
        hitbox: { x: 12, y: -100, w: 58, h: 44 },
      },
      forward: {
        name: 'Placaje', anim: 'charge', cooldown: 240,
        startup: 6, active: 12, recovery: 18,
        dash: { speed: 12, from: 6, to: 18 }, armor: { from: 4, to: 18 },
        damage: 80, hitstun: 22, blockstun: 14, push: 11, hitstop: 9,
        hitbox: { x: 10, y: -108, w: 56, h: 88 },
      },
      down: {
        name: 'Agarre', anim: 'grab', cooldown: 260,
        startup: 6, active: 3, recovery: 26, guardBreak: true, launch: true,
        damage: 100, hitstun: 30, push: -6, hitstop: 12,
        hitbox: { x: 8, y: -104, w: 42, h: 96 },
      },
    },
  },

  morra: {
    id: 'morra', name: 'Morra', weapon: 'Guadaña', weaponType: 'scythe',
    description: 'Atrae a sus rivales con la guadaña y les roba la vida.',
    color: '#f15bb5',
    maxHp: 1000, walkSpeed: 3.6, jumpVel: -15, gravity: 0.8, width: 46, height: 126,
    attacks: {
      light: {
        name: 'Tajo', anim: 'slash',
        startup: 7, active: 4, recovery: 12,
        damage: 50, hitstun: 16, blockstun: 10, push: 4, hitstop: 6,
        hitbox: { x: 10, y: -112, w: 96, h: 62 },
      },
      heavy: {
        name: 'Siega', anim: 'sweep',
        startup: 15, active: 6, recovery: 22,
        damage: 105, hitstun: 25, blockstun: 16, push: 8, hitstop: 10,
        hitbox: { x: -30, y: -72, w: 160, h: 72 },
      },
    },
    skills: {
      neutral: {
        name: 'Espíritu', anim: 'cast', cooldown: 200,
        startup: 14, active: 1, recovery: 20,
        projectile: { x: 40, y: -76, w: 40, h: 58, speed: 5, life: 150, style: 'ghost',
          damage: 65, hitstun: 20, blockstun: 12, push: 4, hitstop: 6 },
      },
      forward: {
        name: 'Gancho de guadaña', anim: 'thrust', cooldown: 220,
        startup: 12, active: 4, recovery: 20,
        damage: 60, hitstun: 26, blockstun: 12, push: -9, hitstop: 8,
        hitbox: { x: 20, y: -98, w: 150, h: 32 },
      },
      down: {
        name: 'Robo de vida', anim: 'overhead', cooldown: 280,
        startup: 12, active: 4, recovery: 20, lifesteal: 0.6,
        damage: 80, hitstun: 22, blockstun: 12, push: 5, hitstop: 9,
        hitbox: { x: 10, y: -120, w: 84, h: 120 },
      },
    },
  },

  ilia: {
    id: 'ilia', name: 'Ilia', weapon: 'Bastón', weaponType: 'staff',
    description: 'Maga de largo alcance. Rayos, orbes, teletransporte y curación.',
    color: '#00d1b2',
    ranged: true,
    maxHp: 900, walkSpeed: 3.6, jumpVel: -15, gravity: 0.78, width: 42, height: 120,
    attacks: {
      light: {
        name: 'Bastonazo', anim: 'slash',
        startup: 6, active: 3, recovery: 11,
        damage: 40, hitstun: 15, blockstun: 9, push: 4, hitstop: 5,
        hitbox: { x: 14, y: -102, w: 82, h: 42 },
      },
      heavy: {
        name: 'Orbe arcano', anim: 'cast',
        startup: 14, active: 1, recovery: 20,
        projectile: { x: 44, y: -82, w: 36, h: 36, speed: 7, life: 110, style: 'orb',
          damage: 80, hitstun: 20, blockstun: 12, push: 6, hitstop: 7 },
      },
    },
    skills: {
      neutral: {
        name: 'Rayo', anim: 'shoot', cooldown: 110,
        startup: 10, active: 1, recovery: 16,
        projectile: { x: 40, y: -88, w: 70, h: 12, speed: 18, life: 40, style: 'bolt',
          damage: 55, hitstun: 16, blockstun: 10, push: 5, hitstop: 6 },
      },
      forward: {
        name: 'Parpadeo', anim: 'teleport', cooldown: 240,
        startup: 8, active: 1, recovery: 12, teleport: { at: 6 },
      },
      down: {
        name: 'Sanación', anim: 'heal', cooldown: 480,
        startup: 22, active: 1, recovery: 22, heal: 100,
      },
    },
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

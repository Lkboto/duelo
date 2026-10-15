# Duelo

Juego de peleas de stick figures para el navegador. Eliges un luchador con sus propias habilidades y peleas contra bots, en local (2–4 jugadores con teclados y mandos) u online contra un amigo con un código de sala.

**Jugar:** https://lkboto.github.io/duelo/

## Cómo se juega

| Acción | Jugador 1 | Jugador 2 | Mando |
|---|---|---|---|
| Moverse | `A` `D` | `←` `→` | Stick / cruceta |
| Saltar (doble salto, rebote en paredes) | `W` / `Espacio` | `↑` | A |
| Ataque ligero (cadena de 3) | `G` / clic izq. | `,` / Num 1 | X |
| Ataque fuerte (con ↑ o ↓ cambia) | `H` / clic der. | `.` / Num 2 | B |
| Habilidad 1 | `J` | `-` / Num 3 | Y |
| Habilidad 2 | `L` | `Ñ` / Num 6 | RB |
| Esquiva / dash | `K` / Shift izq. | Shift der. / Num 0 | LB / LT / RT |

Todas las teclas se cambian desde **Controles** con un clic (también los botones del ratón).

- **Combos:** si un golpe conecta, puedes cancelarlo en un ataque fuerte o una habilidad. El ↑+fuerte y el ↓+fuerte se cancelan en salto para seguir en el aire.
- **Tech:** si sales volando, pulsa esquiva justo antes de tocar el suelo para levantarte al instante.
- Pierdes la ronda si tu vida llega a cero o si te sacan del escenario.

## Luchadores

| | Estilo | Habilidad 1 | Habilidad 2 |
|---|---|---|---|
| **Kaze** | Ronin con katana, equilibrado | Iaido (corte a la carrera) | Contraataque |
| **Toro** | Boxeador pesado con armadura | Embestida | Terremoto |
| **Sombra** | Ninja rapidísima, triple salto | Shurikens | Paso sombrío (teletransporte) |
| **Volta** | Maga de la tormenta, zona | Orbe arcano | Rayo |
| **Valk** | Valquiria con lanza, mucho alcance | Jabalina | Salto de Valquiria |
| **Bala** | Pistolera, patadas y disparos | Disparo | Escopeta (te impulsa) |

En **Movimientos** tienes la lista completa y tres combos verificados de cada uno.

## Detalles técnicos

- HTML5 Canvas y JavaScript sin dependencias ni compilación: abre `index.html` con cualquier servidor estático.
- La lógica corre a 60 Hz fijos y el dibujo se interpola a la frecuencia de tu pantalla (fluido a 120/144 Hz y en cámara lenta).
- Animación procedural: esqueleto con cinemática directa e IK, poses por keyframes suavizadas con muelles, telas con verlet y ragdoll en los K.O.
- Sonido sintetizado con WebAudio (no hay archivos de audio).
- Online 1 contra 1 por WebRTC ([PeerJS](https://peerjs.com/), MIT): las dos partidas simulan lo mismo con la misma semilla e intercambian solo las teclas, con un retardo de entrada ajustado al ping y resincronización automática si algo se desvía.
- Fuentes: Bebas Neue y Barlow Condensed (SIL Open Font License).

### Estructura

```
index.html
css/style.css
fonts/            fuentes (OFL)
js/util.js        utilidades, RNG con semilla, ajustes
js/audio.js       sonidos sintetizados
js/input.js       teclado, ratón, mandos y reasignación
js/fx.js          partículas, estelas, textos
js/skeleton.js    esqueleto, IK, telas, ragdoll
js/characters.js  personajes y movimientos
js/stages.js      escenarios
js/fighter.js     física, estados, ataques y animación
js/ai.js          bots
js/game.js        partida, golpes, cámara, HUD
js/showcase.js    previsualizaciones de la selección
js/net.js         online
js/ui.js          menús
js/main.js        bucle principal
```

# Duelo — prototipo de juego de lucha 2D

Juego de lucha 1 contra 1 para navegador, al estilo Street Fighter, pensado para jugar con teclado y publicarse en GitHub Pages.

## Qué incluye esta versión

- **Estética de muñecos de palo** con cuatro escenarios que se eligen al azar (atardecer, bosque, nieve y noche).
- **Modo contra bot** con tres dificultades. El bot usa **siempre un personaje aleatorio**, distinto en cada combate.
- **Modo 2 jugadores** en el mismo teclado.
- **Selección en cuadrícula**: pasa el ratón por un retrato para ver al personaje en movimiento, sus estadísticas y sus golpes. Incluye casilla «Aleatorio».
- **8 personajes**, cada uno con su arma y tres habilidades:

| Personaje | Arma | Habilidades (J · →+J · ↓+J) |
|---|---|---|
| Kael | Espada | Onda cortante · Estocada · Contraataque |
| Brakka | Martillo | Onda sísmica · Embestida (blindaje) · Terremoto |
| Vera | Lanza | Lanzamiento · Salto de pértiga · Púas |
| Nix | Dagas | Dagas lanzadas · Paso sombrío (teletransporte) · Esquiva |
| Sylva | Arco | Flecha rápida · Lluvia de flechas · Trampa |
| Tomo | Guanteletes | Ráfaga · Placaje · Agarre (imbloqueable) |
| Morra | Guadaña | Espíritu · Gancho de guadaña (atrae) · Robo de vida |
| Ilia | Bastón | Rayo · Parpadeo · Sanación |

- **Panel de controles**: haz clic en una acción y pulsa una tecla o un botón del ratón. Se guarda en el navegador.
- Combates al mejor de 3 rondas, 60 segundos por ronda.
- Opción de **mostrar hitboxes** desde el menú de pausa (útil para ajustar personajes).

## Controles por defecto

| Acción | Jugador 1 | Jugador 2 |
|---|---|---|
| Moverse | A / D | ← / → |
| Saltar | W | ↑ |
| Agacharse | S | ↓ |
| Ataque ligero | G | Num 1 |
| Ataque fuerte | H | Num 2 |
| Habilidad | J (con →/↓ cambia cuál) | Num 3 |
| Bloquear | L (mantener) | Num 0 |
| Pausa | Esc | Esc |

Habilidades: **J** sola = habilidad neutral · **hacia el rival + J** = habilidad de avance · **↓ + J** = habilidad baja.

## Ejecutar en local

Usa módulos de JavaScript, así que hay que servirlo (no basta con abrir el HTML):

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

## Estructura

```
index.html        Menús (HTML) y canvas
css/style.css     Estilos de la interfaz
js/characters.js  Datos de los personajes (stats, golpes, habilidades)
js/select.js      Pantalla de selección en cuadrícula
js/sim.js         Simulación del combate (sin DOM, determinista)
js/bot.js         IA del bot: genera las mismas entradas que un jugador
js/input.js       Teclado/ratón y controles reasignables
js/render.js      Muñecos de palo, armas, escenarios y HUD
js/main.js        Bucle a 60 FPS fijos y gestión de pantallas
```

### Añadir un personaje

Copia una entrada de `js/characters.js` y cambia sus valores. Los tiempos van en frames (60 = 1 segundo) y las hitboxes se miden desde el centro del personaje hacia donde mira. Activa «Mostrar hitboxes» en la pausa para ajustarlas.

## Pensado para el online

La simulación (`sim.js`) está separada del dibujo y solo depende de las entradas de cada frame, igual que el bot. Eso es lo que permitirá añadir el modo online con rollback (por ejemplo, con WebRTC/PeerJS) sin reescribir el combate.

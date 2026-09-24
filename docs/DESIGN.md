# NTab — Sistema de diseño

> Referencias: Recordatorios, Fitness, Calendario y Ajustes de Apple (iOS 26 / macOS Tahoe).
> Blanco, negro y grises; azul eléctrico para actuar y verde lima para lo hecho. Movimiento con física.

## 1. Principios

1. **Monocromo.** Blanco, negro y grises. El color solo aparece donde aporta algo, y solo hay dos:
   - **Azul eléctrico** (`#2F7DFF` en oscuro, `#1668FF` en claro): hoy, selección, botones principales, enlaces y la prioridad máxima.
   - **Verde lima** (`#C5F82A`): lo hecho (casillas completadas, hábitos cumplidos, anillos de progreso). Siempre con el glifo en negro encima.
   Nada más: ni rojo, ni naranja, ni morado. Tampoco colores por área, proyecto o hábito.
2. **La importancia se marca con contraste, no con color.** Lo atrasado va en texto fuerte, lo que viene en gris y la prioridad sube de gris claro a blanco o negro, y a azul en la máxima.
3. **Superficies sólidas.** En oscuro, negro con celdas `#1C1C1E`; en claro, gris `#F2F2F7` con celdas blancas, como las listas agrupadas de iOS.
4. **Listas agrupadas.** Las filas van en bloques redondeados con separadores finos que empiezan tras el icono (*inset grouped*), como en Ajustes y Recordatorios.
5. **Títulos grandes que se compactan.** Cada vista abre con un título grande. Al hacer scroll aparece una barra con el título pequeño.
6. **Movimiento con física.** Muelles (*springs*), nunca transiciones lineales. Todo entra escalonado y todo sale con animación. Si el sistema pide menos movimiento, se respeta.
7. **Nunca una pantalla vacía.** Hoy es un panel con anillos, agenda y widgets. Un estado vacío explica qué hacer y ofrece un botón.

## 2. Tokens

Los nombres de color heredados (`--c-red`, `--c-orange`, `--c-purple`…) existen pero valen tonos de gris, para que nada vuelva a colarse con color. Los únicos que no son grises son `--c-blue` y `--c-green` (lima).

## 3. Iconos

Glifos sobre círculos o cuadrados de relleno gris (`--c-fill`). La sección activa de la barra lateral se rellena de azul.

## 4. Tipografía

- Pila `-apple-system` → en iPhone, iPad y Mac se usa **SF Pro** de verdad. Inter queda de respaldo en Windows y Android.
- Números en **SF Pro Rounded** (`ui-rounded`), como en Fitness y Salud.
- Escala:
  - título grande: 34 px, negrita, tracking −0,02 em;
  - título de bloque: 20 px, seminegrita;
  - cuerpo: 15–17 px;
  - notas al pie: 13 px.

## 5. Movimiento

| Momento | Animación |
|---|---|
| Arranque | El logo aparece con un muelle y el contenido entra escalonado |
| Cambio de vista | Fundido con desplazamiento de 8 px y desenfoque, en 250 ms |
| Completar tarea | El círculo se rellena con un muelle, el ✓ se dibuja y la fila se pliega |
| Selección en la barra lateral | La píldora se desliza al nuevo elemento (*shared layout*) |
| Hojas y modales | Suben o crecen con muelle; en móvil se cierran arrastrando hacia abajo |
| Anillos y números | Se llenan y cuentan desde cero al aparecer; los contadores ruedan al cambiar (el número viejo sale, el nuevo entra en la dirección del cambio) |
| Completar | Chispas lima y azul salen de la casilla, con toque háptico |
| Día completado | El anillo lima se cierra, se dibuja el ✓ y cae confeti (solo si acaba de pasar, no al volver a Hoy) |
| Deslizar una tarea (táctil) | → hecha (lima), ← a mañana (azul). La franja se colorea al pasar el umbral, con toque háptico; si no llega, vuelve con muelle |
| Cambio de tema | El tema nuevo se revela en un círculo que crece desde el botón (*View Transitions*) |
| Avisos | Cápsula con una barra del tiempo que queda para deshacer; se aparta deslizándola |
| Barra de pestañas | Se encoge (sin textos) al bajar por una pantalla y vuelve al subir, como en iOS 26 |
| Estados vacíos | El icono flota muy suavemente |
| Rutina paso a paso | Un paso en grande que entra de lado; la barra de pasos se llena en lima; confeti al terminar |
| Procesar la bandeja | Mazo de cartas: la de arriba se arrastra y gira con el dedo (→ hoy, ← luego) y sale volando; las de detrás suben |
| Hora a hora | Al «Colocar en huecos», los bloques de las tareas aparecen en su hueco con un muelle |
| Dictado | El micrófono se pone lima y late mientras escucha |
| Ánimo del diario | Cinco caras en gris; la elegida crece con un muelle y se rellena (gris para lo malo, azul para bien, lima para muy bien). El mapa de ánimo usa los mismos colores |
| ¿Qué hago ahora? | La propuesta entra desde abajo; «Otra» la cambia con un fundido |
| Gastos | La cifra del mes aparece al apuntar; barras de presupuesto y categorías crecen con muelle (una sola serie, un solo color: azul) |
| Compra | Lo que vas a añadir aparece en píldoras con su pasillo mientras escribes; al marcar, la fila baja al carro |

La háptica usa `navigator.vibrate` en Android y, en el iPhone (iOS 18+), el interruptor nativo oculto (`src/lib/haptics.ts`).

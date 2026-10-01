# NTab — Sistema de diseño

> Referencias: Recordatorios, Fitness, Calendario y Ajustes de Apple (iOS 26 / macOS Tahoe).
> Blanco, negro y grises; azul eléctrico para actuar y verde lima para lo hecho. Movimiento con física.

## 1. Principios

1. **Monocromo.** Blanco, negro y grises. El color solo aparece donde aporta algo, y solo hay dos:
   - **Azul eléctrico** (o el color de acento que elijas en Ajustes → Apariencia: violeta, rosa, naranja, verde azulado o grafito): hoy, selección, botones principales, enlaces y la prioridad máxima. Tres tonos para que todo el texto cumpla el contraste AA (4,5:1):
     - `--c-blue` para texto y marcas azules (`#3F89FF` en oscuro, `#1766E8` en claro);
     - `--c-accent-fill` para los fondos con texto blanco, como botones o la sección activa (`#1766E8`);
     - `--c-accent-on-soft` para el texto de los botones tintados sobre `accent-soft` (`#7FB0FF` / `#0F55C7`).
   - **Grises**: `--c-muted` para cualquier texto secundario; `--c-faint` solo para lo decorativo (iconos, separadores, textos de ejemplo), nunca para texto que haya que leer.
   - **Verde lima** (`#C5F82A`): lo hecho (casillas completadas, hábitos cumplidos, anillos de progreso). Siempre con el glifo en negro encima.
   Nada más: ni rojo, ni naranja, ni morado. Tampoco colores por área, proyecto o hábito.
2. **La importancia se marca con contraste, no con color.** Lo atrasado va en texto fuerte, lo que viene en gris y la prioridad sube de gris claro a blanco o negro, y a azul en la máxima.
3. **Superficies sólidas.** En oscuro, negro con celdas `#1C1C1E`; en claro, gris `#F2F2F7` con celdas blancas, como las listas agrupadas de iOS.
4. **Listas agrupadas.** Las filas van en bloques redondeados con separadores finos que empiezan tras el icono (*inset grouped*), como en Ajustes y Recordatorios.
5. **Títulos grandes que se compactan.** Cada vista abre con un título grande. Al hacer scroll aparece una barra con el título pequeño.
6. **Movimiento con física.** Muelles (*springs*), nunca transiciones lineales. Todo entra escalonado y todo sale con animación. Si el sistema pide menos movimiento, se respeta.
7. **Nunca una pantalla vacía.** Hoy es un panel con anillos, agenda y widgets. Un estado vacío explica qué hacer y ofrece un botón.

## 2. Tokens

Cada color de acento redefine los tres tonos (`--c-blue`, `--c-accent-fill`, `--c-accent-on-soft`) en `index.css` con `[data-theme=…][data-accent=…]`. Un test (`src/lib/accents.test.ts`) lee esos valores y comprueba el contraste AA de todos en los dos temas; un acento nuevo que no lo cumpla no pasa la CI. Nada del código usa el azul a mano: siempre los tokens.

Los nombres de color heredados (`--c-red`, `--c-orange`, `--c-purple`…) existen pero valen tonos de gris, para que nada vuelva a colarse con color. Los únicos que no son grises son `--c-blue` y `--c-green` (lima).

## 3. Iconos

Glifos sobre círculos o cuadrados de relleno gris (`--c-fill`). La sección activa de la barra lateral se rellena de azul. Los proyectos llevan un quesito con lo hecho (lima cuando está completo), como en Things.

## 3 bis. Fechas

Nunca el selector de fecha del navegador en el detalle: atajos (Hoy, Mañana, El sábado, El lunes) y un calendario propio que se despliega debajo, con el hoy en azul, el día elegido relleno y manejo con el teclado (flechas, Inicio/Fin, Re Pág/Av Pág).

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
| Cambio de vista | Con View Transitions (Chrome, Edge, Safari 18): el contenido sale fundido y el nuevo sube 10 px; la barra lateral y la de pestañas no se mueven; el título viaja al nuevo título, y el nombre y el anillo de un proyecto viajan de su tarjeta a su página (igual con las etiquetas). Sin ellas: fundido con desplazamiento de 8 px y desenfoque |
| Completar tarea | El círculo se rellena con un muelle, el ✓ se dibuja, el tachado cruza el título de izquierda a derecha y la fila se pliega |
| Tarea nueva | Su fila se tiñe muy suave del acento, con una barra a la izquierda, y se apaga despacio (1,8 s), para ver dónde ha caído; suave a propósito, para que su texto se siga leyendo |
| Tableros (proyecto, matriz) | Las tarjetas se arrastran (en táctil, con pulsación larga) y la columna o el cuadrante de destino se marca con el acento; al moverse, las demás se recolocan con un muelle |
| Evolución de un objetivo | La línea se dibuja de izquierda a derecha y el área de debajo aparece después |
| Rutina con tiempo | Bajo el paso, la cuenta atrás en grande y una barra que se llena; al llegar a cero suena, vibra y el reloj pasa al acento |
| Selección en la barra lateral | La píldora se desliza al nuevo elemento (*shared layout*) |
| Hojas y modales | Suben o crecen con muelle; en móvil se cierran arrastrando hacia abajo |
| Anillos y números | Se llenan y cuentan desde cero al aparecer; los contadores ruedan al cambiar (el número viejo sale, el nuevo entra en la dirección del cambio). Al cerrarse un anillo, una onda sale de él |
| Hábitos en Hoy | Al marcarlo, el lima crece en círculo desde donde tocas; la llama de la racha da un respingo y el número rueda; en los de cantidad, cada toque suelta un «+1» que sube y se desvanece |
| Pestañas | La pestaña elegida da un saltito, como los SF Symbols |
| Modo foco | Mientras corre el tiempo, un halo respira detrás del anillo (8 s por respiración); al acabar, ondas verdes |
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

Con «Reducir movimiento» (sistema o Ajustes) no hay transiciones entre pantallas, ni animaciones de CSS o de Motion, ni confeti.

La háptica usa `navigator.vibrate` en Android y, en el iPhone (iOS 18+), el interruptor nativo oculto (`src/lib/haptics.ts`).

## 6. Navegación y accesibilidad

- **Funciones activables** (`src/lib/features.ts`): lo que se apaga desaparece de la barra lateral, las pestañas, ⌘K, los atajos, Hoy y los avisos del servidor. Lo esencial (Hoy, Próximo, Bandeja, Calendario, Proyectos, Etiquetas) no se apaga.
- **Barra lateral por grupos** (Organizar, Día a día, Casa, Dinero, Mis listas, Mis áreas, Fijados), plegables y recordados en cada dispositivo; un grupo plegado sigue enseñando la fila de lo que estás viendo. Lo oculto (Matriz y Plantillas, de inicio) queda al pie de su grupo tras «N más», también plegable. En el móvil, «Más» es una página con los mismos grupos en cuadrícula.
- **Texto**: `--c-faint` nunca para texto que haya que leer (contadores, días de la semana, hechas tachadas): `--c-muted`. Nada de transparencias sobre texto.
- **Más contraste** (`[data-contrast='more']`): grises de texto y bordes más marcados, materiales opacos y sin halo de fondo. **Menos movimiento** (`[data-motion='reduce']`): sin animaciones de CSS ni de Motion, sin confeti ni revelados. Ambos siguen al sistema o se fuerzan en Ajustes → Accesibilidad.
- **Lector de pantalla**: los avisos y los cambios de pantalla se anuncian (`#announcer`, `aria-live`); «Saltar al contenido» es lo primero al tabular; al navegar desde la barra lateral el foco pasa al contenido. Títulos: un `h1` por pantalla y `h2` para los bloques.
- **Táctil**: los botones de icono pequeños y las casillas tienen al menos 44 px de zona de toque (`pointer: coarse`), sin cambiar cómo se ven.
- **Teclado**: `j`/`k` o `↑`/`↓` entre tareas, `Intro` abre, `Espacio` completa, `T` hoy, `M` mañana, `S` algún día, `Supr` papelera, `⌘Z` deshace. Los menús, el selector de color y el de fecha se manejan con flechas. Todo lo que se arrastra (tableros, matriz, días) tiene también «Mover a…» en su menú.
- **Campos**: `Field` es un `<label>` cuando lleva un solo control; con varios botones (segmentados, iconos, días) se usa `group`, para que cada botón conserve su nombre y el título nombre al grupo.
- **Comprobación**: axe (WCAG 2.1 AA) en todas las secciones y en los diálogos principales, en tema claro y oscuro, con otros acentos y con más contraste (`e2e/accesibilidad.e2e.ts`).

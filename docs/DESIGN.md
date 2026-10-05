# LUNO — Sistema de diseño

> La marca (símbolo, logotipo, paleta, tipografía y voz) está en [BRAND.md](BRAND.md).
> Patrones de Recordatorios, Fitness, Calendario y Ajustes de Apple; la sensación de producto cuidado de Linear o Raycast.
> Casi negro, casi blanco y grises; índigo LUNO para actuar y verde lima para lo hecho. Movimiento con física.

## 1. Principios

1. **Monocromo.** Casi negro, casi blanco y grises. El color solo aparece donde aporta algo, y solo hay dos:
   - **Índigo LUNO** (o el color de acento que elijas en Ajustes → Apariencia: azul, violeta, rosa, naranja, verde azulado o grafito): hoy, selección, botones principales, enlaces y la prioridad máxima. Tres tonos para que todo el texto cumpla el contraste AA (4,5:1):
     - `--c-blue` (nombre heredado) para texto y marcas de acento (`#8783FF` en oscuro, `#4F4BD9` en claro);
     - `--c-accent-fill` para los fondos con texto blanco, como botones o la sección activa (`#5B57E8`);
     - `--c-accent-on-soft` para el texto de los botones tintados sobre `accent-soft` (`#B9B6FF` / `#3F3BC0`).
   - **Grises**: `--c-muted` para cualquier texto secundario; `--c-faint` solo para lo decorativo (iconos, separadores, textos de ejemplo), nunca para texto que haya que leer.
   - **Verde lima** (`#C5F82A`): lo hecho (casillas completadas, hábitos cumplidos, anillos de progreso). Siempre con el glifo en negro encima.
   Nada más: ni rojo, ni naranja, ni morado. Tampoco colores por área, proyecto o hábito.
2. **La importancia se marca con contraste, no con color.** Lo atrasado va en texto fuerte, lo que viene en gris y la prioridad sube de gris claro a blanco o negro, y al acento en la máxima.
3. **Superficies sólidas.** En oscuro, casi negro `#0A0A0C` (nunca negro puro) con celdas `#151518`; en claro, blanco roto `#F5F5F7` con celdas blancas, como las listas agrupadas de iOS. Sombras neutras y suaves: nunca de color.
4. **Listas agrupadas.** Las filas van en bloques redondeados con separadores finos que empiezan tras el icono (*inset grouped*), como en Ajustes y Recordatorios.
5. **Títulos grandes que se compactan.** Cada vista abre con un título grande. Al hacer scroll aparece una barra con el título pequeño.
6. **Movimiento con física.** Muelles (*springs*), nunca transiciones lineales. Todo entra escalonado y todo sale con animación. Si el sistema pide menos movimiento, se respeta.
7. **Nunca una pantalla vacía.** Hoy es un panel con anillos, agenda y widgets. Un estado vacío explica qué hacer y ofrece un botón.

## 2. Tokens

Cada color de acento redefine los tres tonos (`--c-blue`, `--c-accent-fill`, `--c-accent-on-soft`) en `index.css` con `[data-theme=…][data-accent=…]`. Un test (`src/lib/accents.test.ts`) lee esos valores y comprueba el contraste AA de todos en los dos temas; un acento nuevo que no lo cumpla no pasa la CI. Nada del código usa el azul a mano: siempre los tokens.

Los nombres de color heredados (`--c-red`, `--c-orange`, `--c-purple`…) existen pero valen tonos de gris, para que nada vuelva a colarse con color. Los únicos que no son grises son `--c-blue` (el acento: índigo LUNO por defecto) y `--c-green` (lima). La paleta oficial (`--luno-*`) está al principio de `index.css` y en [BRAND.md](BRAND.md#4-paleta).

## 3. Iconos

Lucide para todo lo funcional. Glifos sobre círculos o cuadrados de relleno gris (`--c-fill`). La sección activa de la barra lateral se rellena del acento. La marca (`LunoMark`, `LunoWordmark`, `LunoLockup` en `src/components/Brand.tsx`) va arriba en la barra lateral, en el arranque, en el acceso y al pie de Ajustes. Los proyectos llevan un quesito con lo hecho (lima cuando está completo), como en Things.

## 3 bis. Fechas

Nunca el selector de fecha del navegador en el detalle: atajos (Hoy, Mañana, El sábado, El lunes) y un calendario propio que se despliega debajo, con el hoy en el acento, el día elegido relleno y manejo con el teclado (flechas, Inicio/Fin, Re Pág/Av Pág).

## 4. Tipografía

- **Inter** (variable, incluida en la app) en todos los dispositivos; el sistema queda de respaldo.
- Números con cifras tabulares (`font-num`).
- Escala (tokens `text-display`, `text-title`, `text-headline`, `text-body`, `text-label`, `text-meta`; ver [BRAND.md](BRAND.md#5-tipografía)):
  - título grande: 34 px, negrita, tracking −0,03 em;
  - título de bloque: 20–22 px, seminegrita;
  - cuerpo: 15–17 px;
  - notas al pie: 12–13 px.

## 5. Movimiento

| Momento | Animación |
|---|---|
| Arranque | La órbita de LUNO gira hasta su sitio, la luna se posa y aparece el logotipo; luego el contenido entra escalonado |
| Cambio de vista | Con View Transitions (Chrome, Edge, Safari 18): el contenido sale fundido y el nuevo sube 10 px; la barra lateral y la de pestañas no se mueven; el título viaja al nuevo título, y el nombre y el anillo de un proyecto viajan de su tarjeta a su página (igual con las etiquetas). Sin ellas: fundido con desplazamiento de 10 px (sin desenfoque: difuminar la página entera costaba demasiado) |
| Completar tarea | El círculo se rellena con un muelle, el ✓ se dibuja, el tachado cruza el título de izquierda a derecha y la fila se pliega |
| Tarea nueva | Su fila se tiñe muy suave del acento, con una barra a la izquierda, y se apaga despacio (1,8 s), para ver dónde ha caído; suave a propósito, para que su texto se siga leyendo |
| Tableros (proyecto, matriz) | Las tarjetas se arrastran (en táctil, con pulsación larga) y la columna o el cuadrante de destino se marca con el acento; al moverse, las demás se recolocan con un muelle |
| Evolución de un objetivo | La línea se dibuja de izquierda a derecha y el área de debajo aparece después |
| Rutina con tiempo | Bajo el paso, la cuenta atrás en grande y una barra que se llena; al llegar a cero suena, vibra y el reloj pasa al acento |
| Selección en la barra lateral | La píldora se desliza al nuevo elemento (*shared layout*) |
| Pestañas de un espacio | Texto gris; la pestaña en la que estás, en el color del texto sobre una píldora de relleno gris |
| Hojas y modales | Suben o crecen con muelle; en móvil se cierran arrastrando hacia abajo |
| Anillos y números | Se llenan y cuentan desde cero al aparecer; los contadores ruedan al cambiar (el número viejo sale, el nuevo entra en la dirección del cambio). Al cerrarse un anillo, una onda sale de él |
| Hábitos en Hoy | Al marcarlo, el lima crece en círculo desde donde tocas; la llama de la racha da un respingo y el número rueda; en los de cantidad, cada toque suelta un «+1» que sube y se desvanece |
| Pestañas | La pestaña elegida da un saltito, como los SF Symbols |
| Modo foco | Mientras corre el tiempo, un halo respira detrás del anillo (8 s por respiración); al acabar, ondas verdes. El descanso es verde (anillo, halo y título) con una sugerencia para levantarse; el sonido de fondo entra y sale con un fundido de casi un segundo y solo suena mientras corre el foco |
| Completar | Chispas lima e índigo salen de la casilla, con toque háptico |
| Día completado | El anillo lima se cierra, se dibuja el ✓ y cae confeti (solo si acaba de pasar, no al volver a Hoy) |
| Deslizar una tarea (táctil) | → hecha (lima), ← a mañana (acento). La franja se colorea al pasar el umbral, con toque háptico; si no llega, vuelve con muelle |
| Cambio de tema | El tema nuevo se revela en un círculo que crece desde el botón (*View Transitions*) |
| Avisos | Cápsula con una barra del tiempo que queda para deshacer; se aparta deslizándola |
| Pantalla que aún no ha llegado | Su esqueleto (título, subtítulo y un bloque con filas) aparece tras 0,18 s, para que lo rápido no parpadee, y late suave mientras espera |
| Volver atrás | La pantalla vuelve a donde la dejaste (como en iOS); ir a ella de nuevo la abre arriba |
| Entrar y salir | Abrir algo desde otra pantalla (un proyecto, una persona, una etiqueta, una nota en el móvil) desliza la nueva desde la derecha, con su sombra, sobre la anterior, que se aparta un 28 % y se apaga; volver (botón, gesto o historial) la retira por la derecha. En el ordenador, lo mismo en pequeño: 28 px y un fundido. Entre pantallas del mismo nivel (pestañas, barra lateral), el fundido de siempre (`directionOf` en `app/router.ts`) |
| «‹ Atrás» | Encima del título (y en la barra compacta al bajar), en el acento, con el nombre de la pantalla de la que vienes; si llegaste directamente, la de arriba (el área de un proyecto, Personas, Etiquetas…). Las pantallas de la barra no lo tienen |
| Deslizar desde el borde | Solo con el dedo, en la app instalada (Safari ya lo hace solo) y dentro de algo: la pantalla sigue al dedo con su sombra; debajo asoma la de detrás (su título y un esqueleto) desplazándose más despacio y aclarándose. Pasado un 35 % del ancho (toque háptico) o con un gesto rápido, vuelve; si no, regresa con el muelle |
| Menú de una tarea | Pulsación larga (0,45 s, toque háptico): el fondo se difumina, la fila se levanta un 3 % con sombra (y sube lo justo si el menú no cabe debajo) y el menú crece desde ella. Opciones como en iOS: el texto a la izquierda y el icono a la derecha, grupos separados por una franja. Con el ratón (clic derecho), el menú sale en el puntero sin levantar la fila. En las filas que se arrastran a otro día, mantener y soltar sin mover abre el menú |
| Hojas | Arriba del todo, tirar hacia abajo desde cualquier parte de la hoja (no solo del asa) la baja con el dedo; al soltar pasados 120 px, o rápido, se cierra |
| Cabeceras de día | En Próximo y Completadas, el día (o «Atrasadas») se queda arriba, justo bajo la barra compacta, mientras se ven sus tareas, como en Recordatorios |
| ⌘K | Lo buscado, en negrita en cada resultado; los grupos dicen «12 de 111» cuando hay más |
| Barra de pestañas | Al bajar por una pantalla se recoge en un círculo con la pestaña en la que estás (y el botón de crear al otro lado); al subir vuelve entera, como en iOS 26 |
| Foco minimizado | Accesorio inferior, como el mini reproductor de Música: una cápsula sobre la barra de pestañas (en la esquina en el ordenador) con un anillo en el acento que se llena, el título, el tiempo y un botón de pausa |
| Barra superior compacta | Sin línea: se desvanece hacia abajo (borde de desplazamiento suave de iOS 26) |
| Ahora | Arriba de Hoy, lo que tiene hora y está en curso (anillo en el acento que se vacía y «Termina en 12 min») o lo siguiente («Empieza en 40 min»), como en Tiimo |
| Acciones rápidas | En «Más», baldosas como las de Atajos: la principal (nueva tarea) en el acento y el resto de cristal |
| Cuenta atrás | Como las tarjetas de Flighty, cambia según se acerca: lejos, tranquila; esta semana, la cifra crece y va en el acento; hoy, en lima. Un anillo fino alrededor del icono marca la parte de la espera que ya ha pasado |
| Huchas | Un tarro que se llena con un muelle hasta lo que llevas, con una ola que se mueve despacio arriba; lleno del todo, en lima |
| Hitos de racha | Al llegar a 7, 30, 100 o 365 días (4, 12, 26 o 52 semanas en los hábitos semanales): una tarjeta con el anillo que se cierra en lima, la cifra que sube, la llama que salta y confeti. Una vez por hito y día |
| Estados vacíos | El icono, en su baldosa y dentro de una órbita tenue, flota muy suavemente |
| Rutina paso a paso | Un paso en grande que entra de lado; la barra de pasos se llena en lima; confeti al terminar |
| Procesar la bandeja | Mazo de cartas: la de arriba se arrastra y gira con el dedo (→ hoy, ← luego) y sale volando; las de detrás suben |
| Hora a hora | Al «Colocar en huecos», los bloques de las tareas aparecen en su hueco con un muelle |
| Semana por horas | Mientras se arrastra, un bloque fantasma con la hora de llegada sigue al puntero en cuartos de hora; la tarea sin hora que se arrastra se queda atenuada en su sitio para que la rejilla no se mueva. Lo que ya pasó, en gris; la carga del día es una barra de 3 px en el acento (en el color del texto si se pasa de 6 h) |
| Dictado | El micrófono se pone lima y late mientras escucha |
| Ánimo del diario | Cinco caras en gris; la elegida crece con un muelle y se rellena (gris para lo malo, acento para bien, lima para muy bien). El mapa de ánimo usa los mismos colores |
| ¿Qué hago ahora? | La propuesta entra desde abajo; «Otra» la cambia con un fundido |
| Gastos | La cifra del mes aparece al apuntar; barras de presupuesto y categorías crecen con muelle (una sola serie, un solo color: el acento) |
| Compra | Lo que vas a añadir aparece en píldoras con su pasillo mientras escribes; al marcar, la fila baja al carro |
| Modo cocina | Un paso en grande que entra de lado, como las rutinas; los tiempos del paso son botones que abren una cuenta atrás (suena y vibra al acabar) |
| Notas | Se abren para leer, con formato; un toque en el texto pasa a escribir. Las casillas son círculos como en Notas de Apple: al marcarlas se rellenan en el acento y el texto se tacha; con «Marcadas al final», la casilla se desliza a su sitio |
| Lo importante | Sección propia arriba en Hoy con una estrella en el acento; en el resto de listas, «★ Importante» en la línea de detalles. Como mucho tres: al llegar a tres, las demás se apagan en el selector |
| Gastos y pagos | Las barras de los últimos meses y de la previsión crecen desde abajo una tras otra (30 ms); la elegida va en el acento; en Gastos la media es una línea discontinua y en la previsión los meses que pesan más de lo normal van en gris oscuro. Las de cada categoría con límite se llenan hasta lo gastado y pasan al color del texto si te pasas |
| Limpieza por estancias | Cada tarea y cada estancia llevan una barra fina que se llena según se ensucia (gris mientras va bien, el acento cuando toca); al marcar «Hecho hoy» se vacía deslizándose |

Con «Reducir movimiento» (sistema o Ajustes) no hay transiciones entre pantallas, ni animaciones de CSS o de Motion, ni confeti.

La háptica usa `navigator.vibrate` en Android y, en el iPhone (iOS 18+), el interruptor nativo oculto (`src/lib/haptics.ts`).

### Fluidez

La app tiene que ir igual de suave con 3.000 tareas en un móvil normal. Reglas que lo mantienen (medido con la CPU 4× más lenta y miles de registros):

- **Listas largas por tramos** (`src/components/Progressive.tsx`): se pintan las primeras 40 filas y, al acercarse al final, 30 más, en segundo plano (`startTransition`), para que el scroll no se pare. Las filas llevan `row-lazy` (`content-visibility: auto`): lo que no se ve no se maqueta ni se pinta.
- **Animaciones solo donde se ven**: la entrada escalonada, para las 12 primeras filas; la recolocación animada (`layout`), solo en listas de hasta 60 y con `layoutDependency` (si no, Motion vuelve a medir toda la pantalla en cada render); el fondo de deslizar una tarea, solo mientras se desliza; nada de `layout` en lo que cambia al escribir.
- **Cristal sin coste**: los bloques de la página y las hojas son casi opacos, así que no llevan `backdrop-filter` (no se notaba y obligaba a desenfocar listas enteras); el desenfoque queda para la barra superior (`glass-bar`, translúcida de verdad) y el velo bajo las hojas.
- **Nada de leer el scroll en cada evento**: una lectura por fotograma (`requestAnimationFrame`).
- **Pantallas listas antes de tocarlas**: se precargan de una en una cuando el navegador está libre, primero lo más usado (detalle, captura, ⌘K, Bandeja, Próximo, Calendario…), y al pasar por encima de un enlace o tocarlo se pide ya la suya (como Linear). Las que ya llegaron se pintan directamente (`warm` en `App.tsx`): con `lazy`, React suspendía igualmente y tardaba ~300 ms en enseñar algo que ya tenía.
- **Lo que se lee en todas partes, en memoria**: áreas, proyectos, personas y las tareas pendientes (`useOpenTasks`) se mantienen al día solas; volver a Hoy o a la Bandeja no espera a IndexedDB.
- **El primer fotograma, ligero**: cada lista pinta 20 filas al abrir (el resto llega en segundo plano) y la recolocación animada de filas se enciende un momento después (medirlas al montarlas costaba casi un cuarto del pintado). Medir el ancho de una fila al tocarla, solo si de verdad se desliza.
- **Buscar sin recorrer todo en cada tecla**: ⌘K guarda el texto de cada cosa ya sin acentos y en palabras; cada tecla solo compara y pinta los mejores de cada grupo (12 tareas, 6 de lo demás).
- **Cálculos que no empiezan antes de tiempo**: la fuerza y la mejor racha de un hábito se cuentan desde su primer registro (antes de él suman 0), no desde que se creó.

## 6. Navegación y accesibilidad

- **Funciones activables** (`src/lib/features.ts`): lo que se apaga desaparece de la barra lateral, las pestañas, ⌘K, los atajos, Hoy y los avisos del servidor. Lo esencial (Hoy, Próximo, Bandeja, Calendario, Proyectos, Etiquetas) no se apaga.
- **Casa compartida**: cada compañero es una inicial en un círculo gris (tú, en el acento); «Te toca» va arriba con un «Hecho» en el acento; las tareas atrasadas, en negrita, y las de hoy, en el acento. La página de los compañeros (`#/piso/<token>`) no lleva barra lateral ni pestañas: el logo, el nombre del piso, «¿Quién eres?» la primera vez y tres pestañas (Tareas, Compra, Cuentas). Al pie, «Tenlo en la pantalla de inicio» (en el iPhone, con el icono de compartir dibujado en la frase) y, en Tareas, la tarjeta «Que te avise el móvil» con un único «Activar»; una vez puestos, se quedan en una línea gris al pie («Avisos activados · Quitar»). La compra del piso usa los mismos chips de «Lo de siempre», el «€» que se toca para poner precio y la línea «Unos X € · Y € comprado» que la lista personal. La limpieza por estancias va en Casa → Tareas debajo de lo del piso: un título de estancia en versalitas grises con su barra de suciedad a la derecha (gris hasta que toca, en el acento cuando toca) y «Hecho hoy» como píldora que se vuelve verde.
- **Medicación**: cada pastilla es un punto de su color (como en Apple Salud; el blanco lleva un borde fino). Las tomas de hoy van por hora en una lista: la hora en negrita si se pasó («Sin tomar»), en el acento si toca ahora, gris si ya está; «Tomada» es una píldora en el acento cuando toca y gris cuando aún no, y al marcarla se cambia por un tic lima y «Tomada a las 9:12» (con deshacer). Lo primero de la segunda línea es el estado; la dosis va detrás y es lo que se corta si no cabe. El cumplimiento: catorce puntos (lima tomada, gris a medias, aro vacío olvidada) y el porcentaje; en el móvil, solo el porcentaje.
- **A la espera**: un icono de persona con tic y «Esperando a Luis · 3 días» en negro (no en color: no es urgente, es de otro). En «A la espera», una sección por persona con «Recordárselo» en píldora suave a la derecha del título.
- **Captura que sabe a dónde va** (`classify` en `supabase/functions/_shared/intent.ts`, el mismo que usa Siri; `src/components/capturePlan.ts`): si lo escrito no es una tarea, en vez de los chips de fecha sale una píldora gris con su icono y el destino («A la compra: Leche y Pan», «Gasto: 12,50 € · Café», «Hecha: Llamar al dentista»), y se van el campo de notas y las pistas de `#etiqueta`; al guardar, un aviso con «Deshacer». Al pulsar Intro se vuelve a decidir con los datos del momento, para que nada acabe de tarea por haber ido demasiado rápido.
- **Captura con lista o enlace**: al pegar varias líneas, debajo del campo sale un recuadro gris «N tareas, una por línea» con cada una (y su día a la derecha) y una ✕ para quedarse con una sola; el botón de enviar pasa a «Añadir N tareas». Un enlace se ve como una píldora gris con el icono de enlace y el dominio. En la fila de la tarea, el dominio va en azul (es un enlace que se abre aparte), como las #etiquetas.
- **Lugares** (`HUBS` en `src/app/sections.tsx`): diez, y cada cosa en uno solo (Hoy, Bandeja, Calendario, Proyectos, Listas, Notas, Hábitos, Personas, Casa y Dinero). Reglas: **lo que es otra vista de lo mismo no es un lugar** (Próximo es la vista «Lista» del Calendario; Algún día, A la espera, Completadas, la Matriz, los filtros y las etiquetas, baldosas y bloques de Listas); **los momentos del día no son lugares** (planificar, foco, cierre y revisión salen de Hoy: su menú «⋯» y la sugerencia que toca); **las pestañas, solo para cosas distintas de verdad** (Notas · Diario; Hábitos · Rutinas · Medicación; Casa · Compra · Menú · Cosas; Gastos · Fijos), encima del título (`src/app/HubTabs.tsx`), con la activa en una píldora gris y la última recordada en cada dispositivo. Lo que vive dentro de un lugar (Objetivos y Plantillas en Proyectos, Algún día en Listas…) se abre con «‹ Atrás» y la transición de entrar (`parentOf` en `app/titles.ts`, `OWNER` en `sections.tsx` para marcar su lugar en la barra). Las rutas y los atajos `G` + tecla siguen igual. En la barra lateral: Fijados, Mis filtros y Mis áreas, plegables; los ocultos al pie tras «N más»; al pie, solo Papelera y Ajustes. En el móvil, «Más» enseña los lugares en cuadrícula.
- **Lo justo a la vista** (divulgación progresiva): una pantalla enseña lo que se usa siempre y lo que tiene algo; lo demás, a un toque. En el detalle de una tarea, la fecha y la lista siempre; el resto de campos (`FIELDS` en `src/components/TaskDetail.tsx`) solo si tienen valor o se acaban de añadir con las píldoras de «Añadir» (que ponen el foco en la fila nueva). En Ajustes, una portada con la cuenta y una fila por apartado (`PAGES` en `src/features/settings/SettingsView.tsx`, ruta `/settings/<apartado>`), cada uno en su página con «‹ Ajustes». En Hoy, una tarjeta sin nada no se pinta (nada de «No hay…» que ocupe sitio); si la tarjeta es la única forma de crear algo, queda un botón pequeño en su lugar.
- **Baldosas** (`src/components/Tile.tsx`): para las listas y las páginas que viven dentro de un lugar, como la portada de Recordatorios: icono arriba a la izquierda, recuento grande a la derecha y el nombre abajo, con una línea gris que dice qué es.
- **Hoy sugiere una cosa cada vez**: por la tarde, cerrar el día; la primera vez, elegir funciones; por la mañana, planificar (que ya incluye lo importante); luego «¿Qué es lo importante hoy?» y, el fin de semana, la revisión. Nunca varias tarjetas apiladas.
- **Texto**: `--c-faint` nunca para texto que haya que leer (contadores, días de la semana, hechas tachadas): `--c-muted`. Nada de transparencias sobre texto.
- **Más contraste** (`[data-contrast='more']`): grises de texto y bordes más marcados, materiales opacos y sin halo de fondo. **Menos movimiento** (`[data-motion='reduce']`): sin animaciones de CSS ni de Motion, sin confeti ni revelados. Ambos siguen al sistema o se fuerzan en Ajustes → Accesibilidad.
- **Lector de pantalla**: los avisos y los cambios de pantalla se anuncian (`#announcer`, `aria-live`); «Saltar al contenido» es lo primero al tabular; al navegar desde la barra lateral el foco pasa al contenido. Títulos: un `h1` por pantalla y `h2` para los bloques.
- **Táctil**: los botones de icono pequeños y las casillas tienen al menos 44 px de zona de toque (`pointer: coarse`), sin cambiar cómo se ven.
- **Teclado**: `j`/`k` o `↑`/`↓` entre tareas, `Intro` abre, `Espacio` completa, `T` hoy, `M` mañana, `S` algún día, `Supr` papelera, `⌘Z` deshace. Los menús, el selector de color y el de fecha se manejan con flechas. Todo lo que se arrastra (tableros, matriz, días) tiene también «Mover a…» en su menú.
- **Campos**: `Field` es un `<label>` cuando lleva un solo control; con varios botones (segmentados, iconos, días) se usa `group`, para que cada botón conserve su nombre y el título nombre al grupo.
- **Comprobación**: axe (WCAG 2.1 AA) en todas las secciones y en los diálogos principales, en tema claro y oscuro, con otros acentos y con más contraste (`e2e/accesibilidad.e2e.ts`).

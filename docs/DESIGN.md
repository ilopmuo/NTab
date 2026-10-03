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
| Cambio de vista | Con View Transitions (Chrome, Edge, Safari 18): el contenido sale fundido y el nuevo sube 10 px; la barra lateral y la de pestañas no se mueven; el título viaja al nuevo título, y el nombre y el anillo de un proyecto viajan de su tarjeta a su página (igual con las etiquetas). Sin ellas: fundido con desplazamiento de 8 px y desenfoque |
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

## 6. Navegación y accesibilidad

- **Funciones activables** (`src/lib/features.ts`): lo que se apaga desaparece de la barra lateral, las pestañas, ⌘K, los atajos, Hoy y los avisos del servidor. Lo esencial (Hoy, Próximo, Bandeja, Calendario, Proyectos, Etiquetas) no se apaga.
- **Casa compartida**: cada compañero es una inicial en un círculo gris (tú, en el acento); «Te toca» va arriba con un «Hecho» en el acento; las tareas atrasadas, en negrita, y las de hoy, en el acento. La página de los compañeros (`#/piso/<token>`) no lleva barra lateral ni pestañas: el logo, el nombre del piso, «¿Quién eres?» la primera vez y tres pestañas (Tareas, Compra, Cuentas). Al pie, «Tenlo en la pantalla de inicio» (en el iPhone, con el icono de compartir dibujado en la frase) y, en Tareas, la tarjeta «Que te avise el móvil» con un único «Activar»; una vez puestos, se quedan en una línea gris al pie («Avisos activados · Quitar»). La compra del piso usa los mismos chips de «Lo de siempre», el «€» que se toca para poner precio y la línea «Unos X € · Y € comprado» que la lista personal. La limpieza por estancias va en Casa → Tareas debajo de lo del piso: un título de estancia en versalitas grises con su barra de suciedad a la derecha (gris hasta que toca, en el acento cuando toca) y «Hecho hoy» como píldora que se vuelve verde.
- **Medicación**: cada pastilla es un punto de su color (como en Apple Salud; el blanco lleva un borde fino). Las tomas de hoy van por hora en una lista: la hora en negrita si se pasó («Sin tomar»), en el acento si toca ahora, gris si ya está; «Tomada» es una píldora en el acento cuando toca y gris cuando aún no, y al marcarla se cambia por un tic lima y «Tomada a las 9:12» (con deshacer). Lo primero de la segunda línea es el estado; la dosis va detrás y es lo que se corta si no cabe. El cumplimiento: catorce puntos (lima tomada, gris a medias, aro vacío olvidada) y el porcentaje; en el móvil, solo el porcentaje.
- **A la espera**: un icono de persona con tic y «Esperando a Luis · 3 días» en negro (no en color: no es urgente, es de otro). En «A la espera», una sección por persona con «Recordárselo» en píldora suave a la derecha del título.
- **Espacios** (`HUBS` en `src/app/sections.tsx`): la barra lateral, «Más» y las pestañas del móvil no enseñan cada función sino once espacios que juntan lo que va junto (Casa = Compra, Menú y Cosas). Dentro, una fila de pestañas encima del título (`src/app/HubTabs.tsx`) cambia de sección; la activa lleva una píldora gris y el espacio recuerda la última pestaña en cada dispositivo. Las rutas y los atajos `G` + tecla de cada sección siguen igual. En la barra lateral: Fijados, Mis listas y Mis áreas, plegables; los espacios ocultos quedan al pie tras «N más». En el móvil, «Más» enseña los espacios en cuadrícula.
- **Texto**: `--c-faint` nunca para texto que haya que leer (contadores, días de la semana, hechas tachadas): `--c-muted`. Nada de transparencias sobre texto.
- **Más contraste** (`[data-contrast='more']`): grises de texto y bordes más marcados, materiales opacos y sin halo de fondo. **Menos movimiento** (`[data-motion='reduce']`): sin animaciones de CSS ni de Motion, sin confeti ni revelados. Ambos siguen al sistema o se fuerzan en Ajustes → Accesibilidad.
- **Lector de pantalla**: los avisos y los cambios de pantalla se anuncian (`#announcer`, `aria-live`); «Saltar al contenido» es lo primero al tabular; al navegar desde la barra lateral el foco pasa al contenido. Títulos: un `h1` por pantalla y `h2` para los bloques.
- **Táctil**: los botones de icono pequeños y las casillas tienen al menos 44 px de zona de toque (`pointer: coarse`), sin cambiar cómo se ven.
- **Teclado**: `j`/`k` o `↑`/`↓` entre tareas, `Intro` abre, `Espacio` completa, `T` hoy, `M` mañana, `S` algún día, `Supr` papelera, `⌘Z` deshace. Los menús, el selector de color y el de fecha se manejan con flechas. Todo lo que se arrastra (tableros, matriz, días) tiene también «Mover a…» en su menú.
- **Campos**: `Field` es un `<label>` cuando lleva un solo control; con varios botones (segmentados, iconos, días) se usa `group`, para que cada botón conserve su nombre y el título nombre al grupo.
- **Comprobación**: axe (WCAG 2.1 AA) en todas las secciones y en los diálogos principales, en tema claro y oscuro, con otros acentos y con más contraste (`e2e/accesibilidad.e2e.ts`).

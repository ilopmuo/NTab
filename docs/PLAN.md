# LUNO — Plan del producto

> Una sola herramienta para gestionar mi vida: tareas, trabajo, proyectos, hábitos, notas y personas.
> Uso exclusivamente personal. Pensada para alguien despistado: **capturar en 2 segundos, olvidarse, y que la app se acuerde por mí.**

---

## 1. Principios

1. **Captura sin fricción.** Cualquier cosa que se me pase por la cabeza debe entrar en la app en menos de 2 segundos, desde cualquier pantalla (atajo `N` o `⌘K`). Nada de formularios largos: escribo en lenguaje natural y la app entiende la fecha, la hora, la prioridad y el proyecto.
2. **Una sola pantalla de verdad: "Hoy".** Al abrir la app veo solo lo que importa hoy: lo atrasado, lo de hoy, mis hábitos y lo próximo. Todo lo demás está a un clic, pero no molesta.
3. **Nada se pierde.** Todo lo que no tiene sitio va a la *Bandeja de entrada*. Una revisión semanal guiada me obliga a vaciarla.
4. **Minimalismo Apple.** Negro, grises, blanco; un único color de acento (azul eléctrico) y un secundario (verde lima) para los logros. Tipografía limpia, mucho aire, animaciones suaves y cortas.
5. **Local-first y privado.** Los datos viven en mi dispositivo (IndexedDB). Funciona sin conexión. Copias de seguridad exportables en un clic. La sincronización llegará después, sin rehacer nada.
6. **Teclado primero, táctil también.** Atajos para todo en el ordenador; diseño adaptable e instalable (PWA) en el móvil.

---

## 2. Módulos (visión completa)

| # | Módulo | Qué resuelve | Fase |
|---|--------|--------------|------|
| 1 | **Hoy** | Panel diario: atrasadas, hoy, hábitos del día, próximos 7 días, saludo y progreso | 1 |
| 2 | **Captura rápida** | Crear tareas en lenguaje natural desde cualquier sitio | 1 |
| 3 | **Bandeja de entrada** | Todo lo capturado sin clasificar | 1 |
| 4 | **Tareas** | Prioridad, fecha, hora, subtareas, notas, etiquetas, repetición | 1 |
| 5 | **Áreas de vida** | Trabajo, Personal, Salud, Finanzas, Hogar… | 1 |
| 6 | **Proyectos** | Agrupan tareas con un objetivo; progreso y fecha límite | 1 |
| 7 | **Próximo** | Vista cronológica de todo lo que viene | 1 |
| 8 | **Paleta de comandos** (`⌘K`) | Buscar y navegar a cualquier cosa, ejecutar acciones | 1 |
| 9 | **Ajustes y copias** | Tema claro/oscuro, exportar/importar JSON | 1 |
| 10 | **Calendario** | Vista mensual / semanal de tareas con fecha | 2 |
| 11 | **Hábitos** | Seguimiento diario, rachas, mapa de calor | 2 |
| 12 | **Notas** | Notas rápidas, fijadas, enlazadas a áreas y proyectos | 2 |
| 13 | **Personas** (mini-CRM) | Contactos, último contacto, "llámale cada X días", cumpleaños | 3 |
| 14 | **Revisión semanal** | Asistente paso a paso: vaciar bandeja, revisar proyectos, planificar semana | 3 |
| 15 | **Objetivos** | Metas medidas con una cifra o con los proyectos que las hacen avanzar; ritmo frente a la fecha límite | 4 |
| 16 | **Pagos** (finanzas ligeras) | Suscripciones y recibos, total al mes y al año, aviso antes de cada cargo | 4 |
| 17 | **Recordatorios** | Aviso por tarea y notificaciones push con la app cerrada (Web Push) | 4 |
| 18 | **Sincronización** | Mismos datos en móvil y ordenador (Supabase o similar) | 5 |
| 19 | **Claude** | Conector MCP: desde Claude (con la suscripción) se consulta y organiza LUNO: "¿qué tengo esta semana?", planificar el día, convertir un email en tareas | 5 |
| 20 | **Integraciones** | Calendario suscribible (Apple, Google, Outlook); resumen de la mañana por push | 5 |

---

## 3. Captura en lenguaje natural (español)

Ejemplo: `Llamar al dentista mañana a las 10 !alta #salud +Personal`

| Escribo | Entiende |
|---------|----------|
| `hoy`, `mañana`, `pasado mañana` | Fecha |
| `lunes` … `domingo`, `el viernes`, `próximo lunes` | Próximo día de la semana |
| `el 15`, `15/10`, `15 de octubre` | Fecha concreta |
| `en 3 días`, `en 2 semanas`, `en un mes` | Fecha relativa |
| `la semana que viene`, `fin de semana` | Lunes siguiente / sábado |
| `a las 10`, `10:30`, `9am`, `5pm`, `a las 7 de la tarde` | Hora |
| `!alta` `!media` `!baja` · `!1` `!2` `!3` · `!!!` | Prioridad |
| `#etiqueta` | Etiquetas |
| `+Proyecto` o `+Área` | Asignación (coincidencia aproximada) |
| `cada día`, `cada semana`, `cada lunes`, `cada mes`, `cada año`, `diario`, `semanal`, `mensual` | Repetición |

La vista previa muestra en tiempo real qué ha entendido (chips de fecha, prioridad, proyecto) antes de guardar.

---

## 4. Modelo de datos

```
Area      { id, name, icon, color, order }
Project   { id, name, areaId?, goalId?, description, status: active|paused|done, deadline?, color, order, createdAt }
Task      { id, title, notes, done, priority: 0..3, dueDate? (YYYY-MM-DD), dueTime? (HH:mm),
            projectId?, areaId?, tags[], subtasks[{id,title,done}], recurrence?,
            reminder? ({before: min} | {at: ms} | null), remindAt? (ms, calculado), order,
            createdAt, completedAt? }
Goal      { id, title, why, areaId?, kind: projects|number, current?, target?, unit?, deadline?,
            status: active|done|dropped, order, createdAt, completedAt? }
Subscription { id, name, kind: sub|bill, amount, currency, cycle: week|month|quarter|year,
            nextDate, anchorDay?, active, category, notifyDays?, remindAt? (ms, calculado), notes, createdAt }
Recurrence{ freq: day|week|month|year, interval, weekdays?[] }
Note      { id, title, content, areaId?, projectId?, pinned, createdAt, updatedAt }
Habit     { id, name, icon, color, days[0..6], archived, order, createdAt }
HabitLog  { id, habitId, date }
Person    { id, name, email, phone, company, role, notes, tags[], birthday?, lastContact?,
            contactEvery? (días), createdAt }
Setting   { key, value }
```

- **Bandeja de entrada** = tareas sin área, sin proyecto y sin fecha.
- **Tareas recurrentes**: al completarla se crea la siguiente ocurrencia automáticamente.
- Todos los IDs son UUID para que la futura sincronización sea trivial.

---

## 5. Diseño

**Paleta (modo oscuro por defecto)**

| Token | Oscuro | Claro | Uso |
|-------|--------|-------|-----|
| `bg` | `#000000` | `#F5F5F7` | Fondo |
| `surface` | `#0E0E10` | `#FFFFFF` | Tarjetas, sidebar |
| `elevated` | `#17171A` | `#FFFFFF` | Modales, menús |
| `border` | `#232326` | `#E4E4E7` | Separadores |
| `text` | `#F5F5F7` | `#0A0A0B` | Texto principal |
| `muted` | `#8E8E93` | `#6E6E73` | Texto secundario |
| `accent` | `#2F7BFF` | `#0A63F0` | Azul eléctrico: acciones, selección |
| `lime` | `#C5F82A` | `#5C8A00` | Verde lima: completado, rachas |
| `danger` | `#FF453A` | `#E0352B` | Atrasado, prioridad alta |
| `warn` | `#FF9F0A` | `#C77700` | Prioridad media |

**Tipografía:** Inter Variable (con fallback al sistema de Apple), tracking ajustado en títulos, tamaños 13/14/15 para UI, 28–34 para títulos de página.

**Detalles:** esquinas 10–16 px, bordes de 1 px sutiles, desenfoque (`backdrop-blur`) en barras y modales, casillas redondas animadas al completar, transiciones de 150–200 ms, sin sombras duras.

**Estructura:** barra lateral fija (navegación + áreas + proyectos) · contenido centrado con ancho máximo · en móvil, barra inferior con 5 destinos y botón flotante de captura.

---

## 6. Arquitectura técnica

| Pieza | Elección | Por qué |
|-------|----------|---------|
| Build | Vite + TypeScript | Rápido, sin configuración |
| UI | React 19 | Ecosistema, componentes |
| Estilos | Tailwind CSS v4 con tokens CSS | Tema claro/oscuro trivial |
| Datos | Dexie (IndexedDB) + `useLiveQuery` | Local-first, reactivo, offline |
| Fechas | date-fns (locale `es`) | Ligero y fiable |
| Iconos | lucide-react | Línea fina, estilo Apple |
| Paleta de comandos | cmdk | Accesible, rápida |
| PWA | vite-plugin-pwa | Instalable y offline |
| Tests | Vitest | Parser de lenguaje natural y lógica de recurrencia |

```
src/
  app/        Shell, router, atajos globales
  db/         Esquema Dexie, repositorios, seed inicial, backup
  lib/        Parser NL, fechas, recurrencia, utilidades
  components/ UI reutilizable (TaskItem, Checkbox, Modal, Chip…)
  features/   today, inbox, upcoming, tasks, projects, areas, calendar,
              habits, notes, people, review, settings
```

---

## 7. Hoja de ruta

- ✅ **Fase 1 — Núcleo** · Shell, diseño, Hoy, Bandeja, Próximo, Áreas, Proyectos, tareas completas, captura NL, `⌘K`, ajustes, copias.
- ✅ **Fase 2 — Organización** · Calendario, Hábitos, Notas.
- ✅ **Fase 3 — Vida** · Personas (mini-CRM), Revisión semanal.
- ✅ **Fase 4 — Automatización** · Recordatorios y notificaciones push, Objetivos, Pagos (finanzas ligeras).
- ✅ **Fase 32 — A prueba de despistes** · Medicación como Medicamentos de Apple Salud y Medisafe: cada pastilla con su dosis, horas y días (o cuando haga falta, con máximo al día) y tratamientos de N días; «Tomada» en un toque con la hora exacta, para no volver a dudar de si te la has tomado; aviso a la hora que insiste a los 15 y 30 minutos, con «Tomada» en el propio aviso; lo que queda en la caja con aviso para reponer (a la lista de la farmacia) y cómo has cumplido las dos últimas semanas. Y «A la espera» de GTD (OmniFocus, Things): lo que depende de otra persona («esperando a Luis») sale de Hoy, vuelve en 3 días con cuánto lleva esperando y «Recordárselo» le escribe por WhatsApp con todo lo pendiente (el «avísame si no contesta» de Boomerang); por persona, en su ficha y en la revisión semanal. También desde Claude (`ver_medicacion`, `tomar_medicacion`, `esperando` al crear tareas, ambas cosas en el resumen) y Siri («tomada: ibuprofeno», «¿me he tomado la pastilla?»).
- ✅ **Fase 31 — Casa redonda** · Los compañeros sin cuenta reciben avisos en el móvil: a las 9:00 lo que les toca en casa y a las 20:00 si sigue sin hacer (los recordatorios de Flatastic y Tody). El piso se abre directamente desde su pantalla de inicio, con cómo añadirlo en el iPhone (allí los avisos solo llegan así). La compra del piso, como la tuya: dictada, «lo de siempre» que se aprende de lo comprado, precios con total estimado (Bring!, AnyList) y desde Siri con «piso: leche y pan». La limpieza por estancias se muda de Hábitos → Última vez a Casa → Tareas, también sin piso (Tody, Sweepy). Y tu parte de cada gasto del piso entra en tus Gastos con #piso, para que el presupuesto del mes cuente lo que de verdad pagas (como pasar de Splitwise a YNAB).
- ✅ **Fase 30 — Casa compartida** · Casa tiene por fin tareas: las de casa que se repiten van por turnos entre quien viva contigo y pasan al siguiente al hacerlas (Flatastic, Sweepy), las sueltas para quien pueda, «Te toca» en Casa y en Hoy y el reparto del último mes (los puntos de Flatastic). Los compañeros entran con un enlace, sin cuenta ni instalar nada, eligen quién son y ven lo mismo al momento; con ellos, la compra del piso con quién apuntó y quién compró cada cosa (Bring!, la lista «Piso» de Compra) y las cuentas del piso a partes iguales con cómo saldarlas en los menos pagos (Splitwise). También desde Claude (`ver_casa`, `anadir_a_casa`, `hecho_en_casa` y la casa en el resumen).
- ✅ **Fase 29 — Menos ventanas** · Las ~26 secciones se agrupan en once espacios (Hoy, Bandeja, Calendario, Planificar, Proyectos, Etiquetas y filtros, Notas, Hábitos, Personas, Casa y Dinero) con pestañas arriba para pasar de una sección a la de al lado, como las apps de Apple; cada espacio recuerda su última pestaña. La barra lateral pasa de cuatro grupos plegables a una cuadrícula y cinco filas, «Más» a una sola cuadrícula y las pestañas del móvil a Hoy, Bandeja, Calendario y Hábitos. Planificar el día y Cerrar el día pasan a ser secciones, junto a Foco y la revisión semanal.
- ✅ **Fase 28 — Foco como los mejores** · Pomodoros con descanso corto tras cada uno y largo cada cuatro, con qué hacer en el descanso (Focus To-Do, Be Focused); apuntar lo que se te pasa por la cabeza a la Bandeja sin dejar el foco (la lista de imprevistos de Cirillo); sonido de fondo generado al momento, sin ficheros (Noisli, Endel); valorar cómo ha ido cada sesión (Session); foco libre con una intención; página Foco con objetivo diario y racha (Forest), últimos 14 días, mejores horas (Rize) y en qué se va el tiempo; y en cada tarea, el foco frente a lo estimado (Toggl). Claude ve el foco de hoy y de la semana, la racha y las mejores horas para poner ahí lo que exige pensar.
- ✅ **Fase 27 — Calendario como los mejores** · Semana por horas en pantallas grandes con reuniones y tareas en su sitio, que se arrastran a otra hora u otro día y se alargan tirando del borde (Google Calendar, Fantastical); tareas sin hora que se arrastran a un hueco para reservarles tiempo (Akiflow, Sunsama); vista Día hora a hora para cualquier día y tocar un hueco para crear una tarea a esa hora; la carga de cada día en el mes, la semana y el día (Motion, Reclaim). Claude ve los huecos libres de hoy y mañana para proponer una hora que quepa.
- ✅ **Fase 26 — Notas como los mejores** · Formato ligero con vista de lectura y barra para escribir (Bear), casillas que se marcan con «Marcadas al final» y «Desmarcar todo» (Notas de Apple), Intro que sigue las listas, fotos en las notas, plantillas y nota del día (Craft, Obsidian), compartir en Markdown y el progreso de cada lista en la lista de notas. También desde Claude (`buscar_notas`, `anadir_a_nota`) y Siri («a la nota maleta: crema solar»).
- ✅ **Fase 25 — El día como los mejores** · Lo importante de hoy (hasta 3 tareas arriba del todo, como los objetivos del día de Sunsama o el «Highlight» de Make Time), cierre del día por la tarde con lo hecho, lo que queda, el ánimo y lo importante de mañana (Sunsama), tareas que se arrastran con «Pospuesta N veces» y la propuesta de dejarlas para algún día, y objetivo diario de tareas con racha y días libres (Todoist). También desde Claude: lo importante en el resumen y al crear o cambiar tareas, las pospuestas y el objetivo con su racha.
- ✅ **Fase 24 — Dinero como los mejores** · Gastos con límite por categoría y pagos fijos aparte (YNAB, Monarch), categorías que se aprenden al corregirlas (Copilot), lo de siempre en un toque y #etiquetas para viajes (Wallet), búsqueda con total y tendencia de 6 meses; pagos con pruebas gratis y aviso antes del primer cargo (Bobby, Trial Alert), subidas de precio (Rocket Money), historial de recibos y previsión de 12 meses (Chronicle) y enlace para darse de baja; objetivos en euros como huchas que dicen cuánto apartar al mes (YNAB). También desde Claude (`guardar_pago`, búsqueda y límites en `ver_gastos`, etiquetas al apuntar). Sin conexión con el banco (necesitaría un agregador de pago), pero cada pago con Apple Pay se apunta solo con la automatización «Transacción» de Atajos, y a Siri se le puede decir «mete un gasto de quince euros en Mercadona».
- ✅ **Fase 23 — Casa como los mejores** · Recetas que se traen de una web con el enlace (o pegando el texto), raciones que recalculan las cantidades y modo cocina paso a paso con pantalla encendida y temporizadores sacados de los pasos (Paprika, Mela); varias listas de la compra y precio estimado que se recuerda (AnyList, Bring!); cosas con estancia, compra, ticket y garantía con aviso un mes antes, vista por estancia y valor de lo apuntado (Sortly, Encircle); y limpieza por estancias con barra de suciedad y tareas típicas para empezar (Tody, Sweepy). También desde Claude (receta con pasos y raciones, compra por listas, garantías y estancias).
- ✅ **Fase 22 — Día a día como los mejores** · Hábitos con pausa y «hoy no toca» sin romper la racha (Streaks, Loop), fuerza del hábito y mejor racha (Loop); «Días sin…» para lo que quieres dejar, con récord, metas y ahorro (Quitzilla); rutinas con minutos por paso, cuenta atrás y hora de fin (Routinery); diario con «Tal día como hoy» (Day One), año en píxeles y «Lo que te sienta bien» (Daylio); personas con fechas importantes e ideas de regalo (Monica, Clay). Claude lo ve en el resumen. Y un arranque más ligero: de 238 a 199 KB de JS (Motion en su versión ligera con lo pesado después, y la captura rápida, el analizador, los avisos con la app abierta, ordenar arrastrando y el confeti, bajo demanda); el límite de la CI baja a 215 KB.
- ✅ **Fase 21 — Organizar como los mejores** · Lo que mejor funciona de las apps más conocidas: fecha límite aparte de la fecha (Things, Todoist), «Algún día» (Things, GTD), listas inteligentes guardadas (filtros de Todoist, listas de TickTick, perspectivas de OmniFocus), proyectos en tablero con columnas por sección (Trello, Asana), matriz de Eisenhower (TickTick), notas enlazadas con `[[…]]`, «Mencionada en» y `#etiquetas` (Bear, Obsidian), proyectos revisados en la revisión semanal (OmniFocus) y evolución de los objetivos con gráfica (Strides); también desde Claude (fecha límite y algún día). Remates: aviso de la fecha límite la víspera y el mismo día (también con la app cerrada), enlaces que siguen a una nota al renombrarla y Matriz y Plantillas plegadas en «N más» para no saturar la barra lateral.
- ✅ **Fase 20 — Con movimiento** · Transiciones entre pantallas con View Transitions (el título, y el nombre y el anillo de un proyecto o una etiqueta, viajan de la lista a su página), tachado que se dibuja, tarea nueva que se ilumina, onda al cerrar un anillo, hábitos que se rellenan desde el toque con racha que rueda y «+1», pestañas con saltito y modo foco que respira; todo fuera con «Reducir movimiento».
- ✅ **Fase 19 — Menos es más** · Funciones activables (apaga lo que no uses: fuera de la barra lateral, ⌘K, Hoy y sus avisos), barra lateral por grupos plegables con Fijados, «Más» del móvil por grupos, y accesibilidad a fondo: anuncios para lectores de pantalla, «Saltar al contenido», títulos jerarquizados, más contraste y menos movimiento, zonas táctiles de 44 px, teclado en las listas (`j`/`k`, `T`, `M`, `Supr`) y `⌘Z`; axe en todas las secciones y diálogos.
- ✅ **Fase 18 — A tu gusto** · Color de acento a elegir (con contraste AA comprobado en la CI), calendario propio para elegir fechas en el detalle, quesitos de progreso de los proyectos en la barra lateral, calendario más claro en el móvil (cabecera que cabe, días libres compactos, lo pasado más apagado) y cabeceras que ya no cortan el título; Próximo con los días libres en una línea y el mes solo cuando cambia, notas agrupadas por fecha, barra lateral plegable en el ordenador (`⌘\`) y horas a un toque en el detalle.
- ✅ **Fase 17 — Ordenado y a la vista** · Secciones dentro de los proyectos (también en plantillas y desde Claude), página de Etiquetas para renombrar, juntar o quitar etiquetas con «Deshacer», tarjetas de proyecto con el siguiente paso, autocompletar `#etiqueta`, `+proyecto` y `@persona` al capturar, y `+Proyecto de varias palabras`.
- ✅ **Fase 15 — Sin fricción** · Apuntar con Siri sin abrir la app (tareas, compra y gastos, con el mismo lenguaje natural en el servidor), hábitos con cantidad y «N veces por semana», orden a mano propio de cada lista, subtareas arrastrables, tests end-to-end con Playwright y CI con límite de tamaño.
- ✅ **Fase 14 — A tu manera** · Arranque más ligero (Supabase y paneles bajo demanda, librerías en trozos propios), barra lateral y pestañas del móvil personalizables, orden manual arrastrando en Bandeja, proyectos, áreas y Hoy, y mover o estirar tareas en «Hora a hora».
- ✅ **Fase 13 — Todo bajo control** · «¿Qué hago ahora?» según el tiempo y la energía, gastos con presupuesto mensual, menú semanal con recetas que llenan la compra, cuentas atrás y Hoy personalizable; todo también desde Claude.
- ✅ **Fase 12 — Tu día a día** · Lista de la compra por pasillos (escrita o dictada, «lo de siempre»), «Última vez» con aviso cuando toca y diario con ánimo, tres cosas buenas y lo hecho del día; todo también desde Claude.
- ✅ **Fase 11 — Tu memoria externa** · Avisos insistentes, rutinas paso a paso, Cosas (dónde está, préstamos y caducidades), el día hora a hora con «Colocar en huecos», procesar la bandeja carta a carta y dictado por voz; todo también desde Claude.
- ✅ **Fase 10 — Se siente viva** · Deslizar tareas (hecha / mañana) con háptica, chispas al completar y «Día completado» con confeti, contadores que ruedan, tema con revelado circular, avisos con tiempo para deshacer y que se apartan deslizando, barra de pestañas que se encoge, detalles de estilo en móvil.
- ✅ **Fase 9 — Tu día completo** · Eventos de tus calendarios (Google, iCloud, Outlook) en Hoy, Calendario, Planificar y Claude; duración estimada de las tareas y carga del día; selección múltiple con acciones en bloque.
- ✅ **Fase 8 — Personas y rutinas** · @personas en las tareas, recordatorios de hábitos, repetir desde que se completa y saltar una vez, carga por vistas y atajos del icono.
- ✅ **Fase 7 — Nada se pierde** · Papelera de 30 días, plantillas, arrastrar tareas a otro día, «Tu semana» con registro de foco.
- ✅ **Fase 6 — Captura y foco** · Planificar el día, modo foco, más herramientas en el conector de Claude.
- ✅ **Fase 5 — Conectado** · Sincronización multi-dispositivo, conector para Claude, calendario suscribible, resumen de la mañana, Posponer/Hecho desde el aviso, objetivos en la revisión semanal.

### Ideas para siguientes iteraciones

- Conector de Claude con inicio de sesión OAuth (en vez de URL privada).
- Buscar en la papelera y recuperar varias cosas a la vez.
- Leer Gmail directamente (requiere OAuth de Google).
- Rutinas ligadas a un lugar (al salir o llegar a casa) cuando la web lo permita.
- El piso compartido al momento (Supabase Realtime) en vez de mirarlo cada 15 s.
- Plazos de devolución de lo que compras («devolver antes del 20»), con aviso unos días antes.

## 8. Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `N` | Nueva tarea (captura rápida) |
| `⌘K` / `Ctrl K` | Paleta de comandos / búsqueda |
| `G` luego `H` / `I` / `U` / `C` / `B` / `E` / `Q` / `K` / `V` / `A` / `Z` / `D` / `W` / `O` / `P` / `J` / `Y` / `T` / `F` | Ir a Hoy / Bandeja / Próximo / Calendario / Hábitos / Rutinas / Foco / Cosas / Última vez / Compra / Menú / Diario / Gastos / Notas / Personas / Proyectos / Etiquetas / Objetivos / Pagos |
| `Esc` | Cerrar panel o modal, o salir de la selección |
| `⌘`/`Ctrl` + clic | Seleccionar varias tareas |
| `↑` / `↓` sobre el asa | Subir o bajar una tarea en una lista con orden a mano |
| `↑` / `↓` en «Hora a hora» | Mover la tarea 15 min (con `⇧`, cambiar su duración) |
| `Tab` en la captura | Completar la etiqueta, lista o persona sugerida (`↑`/`↓` para elegir otra) |
| `⌘`/`Ctrl` + `\` | Ocultar o mostrar la barra lateral (ordenador) |
| `j` / `k` (o `↑` / `↓`) en una lista | Pasar de una tarea a otra; `T` hoy, `M` mañana, `S` algún día, `Supr` papelera |
| `⌘`/`Ctrl` + `Z` | Deshacer lo último |
| `?` | Ver todos los atajos |

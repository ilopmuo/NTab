# NTab — Plan del producto

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
| 19 | **Claude** | Conector MCP: desde Claude (con la suscripción) se consulta y organiza NTab: "¿qué tengo esta semana?", planificar el día, convertir un email en tareas | 5 |
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

- Reordenar tareas arrastrando.
- Conector de Claude con inicio de sesión OAuth (en vez de URL privada).
- Reordenar tareas arrastrando dentro de una lista (hoy el orden es automático: fecha, hora y prioridad).
- Buscar en la papelera y recuperar varias cosas a la vez.
- Leer Gmail directamente (requiere OAuth de Google).
- Mover bloques en «Hora a hora» arrastrándolos.
- Rutinas ligadas a un lugar (al salir o llegar a casa) cuando la web lo permita.

## 8. Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `N` | Nueva tarea (captura rápida) |
| `⌘K` / `Ctrl K` | Paleta de comandos / búsqueda |
| `G` luego `H` / `I` / `U` / `C` / `B` / `E` / `K` / `V` / `A` / `Z` / `D` / `W` / `O` / `P` / `J` / `T` / `F` | Ir a Hoy / Bandeja / Próximo / Calendario / Hábitos / Rutinas / Cosas / Última vez / Compra / Menú / Diario / Gastos / Notas / Personas / Proyectos / Objetivos / Pagos |
| `Esc` | Cerrar panel o modal, o salir de la selección |
| `⌘`/`Ctrl` + clic | Seleccionar varias tareas |
| `?` | Ver todos los atajos |

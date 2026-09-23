# NTab

**Tu vida, organizada.** Una herramienta personal para gestionar tareas, trabajo, proyectos, hábitos, notas y personas en un solo sitio. Pensada para despistados: captura en 2 segundos, olvídate, y deja que la app se acuerde por ti.

![Vista Hoy](docs/screenshots/hoy.png)

## Qué hace

| | |
|---|---|
| **Hoy** | Saludo, progreso del día, atrasadas, hábitos de hoy, personas a contactar y próximos 7 días |
| **Captura rápida** (`N`) | Escribe en español natural: `Llamar al dentista mañana a las 10 !alta #salud +Salud` |
| **Bandeja de entrada** | Todo lo capturado sin fecha ni proyecto, para procesarlo luego |
| **Próximo** y **Calendario** | Vista de dos semanas, mes y semana; doble clic en un día para añadir |
| **Áreas y proyectos** | Trabajo, Salud, Finanzas… con proyectos, progreso y fecha límite |
| **Tareas completas** | Prioridad, fecha, hora, repetición, subtareas, etiquetas y notas |
| **Hábitos** | Seguimiento diario, rachas 🔥 y mapa de calor de 18 semanas |
| **Notas** | Autoguardado; las líneas `- [ ] algo` se convierten en tareas con un clic |
| **Personas** (mini-CRM) | Cumpleaños, historial de contactos y aviso de "hace mucho que no hablas con…" |
| **Revisión semanal** | Asistente de 6 pasos para vaciar la cabeza y planificar la semana |
| **Paleta** (`⌘K`) | Busca cualquier cosa y ejecuta cualquier acción |
| **Tema** | Oscuro (por defecto), claro o del sistema |
| **Sincronización** | Con tu cuenta, los datos están en el iPhone, el iPad y el ordenador, al momento |
| **Funciona sin conexión** | Cada dispositivo guarda una copia local; los cambios se suben al volver la conexión |
| **Instalable** | Se añade a la pantalla de inicio del iPhone/iPad sin App Store |

<p>
  <img src="docs/screenshots/captura.png" width="49%" alt="Captura rápida">
  <img src="docs/screenshots/habitos.png" width="49%" alt="Hábitos">
  <img src="docs/screenshots/calendario.png" width="49%" alt="Calendario">
  <img src="docs/screenshots/hoy-claro.png" width="49%" alt="Modo claro">
</p>

## Lenguaje natural

| Escribes | Entiende |
|---|---|
| `hoy`, `mañana`, `pasado mañana`, `el viernes`, `el 15`, `15/10`, `3 de marzo`, `en 2 semanas`, `la semana que viene` | Fecha |
| `a las 10`, `17:30`, `9am`, `a las 7 de la tarde`, `al mediodía` | Hora |
| `!alta` `!media` `!baja`, `!1` `!2` `!3`, `!!!` | Prioridad |
| `#etiqueta` | Etiqueta |
| `+Proyecto` o `+Área` | Dónde va (coincidencia aproximada) |
| `cada día`, `cada lunes y jueves`, `cada 2 semanas`, `el 1 de cada mes`, `días laborables` | Repetición |

## Atajos

`N` nueva tarea · `⌘K` / `Ctrl K` buscar · `G` + `H`/`I`/`U`/`C`/`B`/`O`/`P`/`R`/`S` ir a sección · `?` ayuda · `Esc` cerrar

## En el iPhone o el iPad

1. Abre la web de NTab en **Safari**.
2. Pulsa **Compartir** → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono y entra con tu cuenta.

## Sincronización

- Supabase guarda cada registro en la tabla `records` (JSON por registro), protegida con RLS: cada usuario solo ve sus filas.
- La app sigue trabajando contra IndexedDB. Un middleware de Dexie apunta cada cambio en un *outbox*; el motor (`src/sync/engine.ts`) sube lo pendiente, descarga lo nuevo desde la última vez y escucha cambios en tiempo real.
- Primera vez en un dispositivo: si la nube está vacía se suben sus datos; si no, se descargan (o se combinan, si el dispositivo tenía datos propios).
- Las migraciones están en `supabase/migrations/` y la integración de GitHub de Supabase las aplica al fusionar en `main`.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests (lenguaje natural, repeticiones, rachas, sincronización)
npm run build      # typecheck + build de producción en dist/
npm run preview    # sirve el build
```

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · Dexie (IndexedDB) · Supabase · date-fns · lucide · cmdk · vite-plugin-pwa · Vitest.

Se publica en Vercel (`vercel.json`). La URL y la clave pública de Supabase están en `src/sync/supabase.ts` y se pueden sobrescribir con `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Plan

La planificación completa (principios, módulos, modelo de datos, diseño y hoja de ruta) está en [docs/PLAN.md](docs/PLAN.md).

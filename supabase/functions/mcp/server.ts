/**
 * Servidor MCP (Model Context Protocol) de NTab: responde a los mensajes
 * JSON-RPC que envía Claude. El almacenamiento se inyecta (`Store`), así que
 * se puede probar sin Supabase (src/lib/mcp.test.ts).
 */
import { buildSummary, eventLines, type EventLike, createNote, createProject, createTasks, listTemplates, logContact, markHabit, markPaid, searchTasks, updateGoal, updateTasks, useTemplate, type Change, type Env, type NewTask, type Row, type SearchArgs } from './ntab.ts'

export interface Store {
  load(): Promise<Row[]>
  save(rows: Row[], deletes?: Row[]): Promise<void>
  /** eventos de los calendarios externos entre dos instantes (ms) */
  events?(from: number, to: number): Promise<{ events: EventLike[]; names: Record<string, string> }>
}

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
export const SERVER_INFO = { name: 'ntab', title: 'NTab', version: '1.0.0' }

const INSTRUCTIONS = `NTab es la app con la que el usuario organiza su vida: tareas, proyectos, hábitos, objetivos, pagos y personas. Es muy despistado: ayúdale a no olvidar nada.
- Para preguntas sobre su agenda o para planificar, llama primero a ver_resumen.
- Los cambios se guardan al momento y aparecen en todos sus dispositivos. Antes de cambios grandes (muchas tareas, reprogramar varias cosas), propón el plan y espera su confirmación.
- Al planificar, ten en cuenta sus reuniones y la carga del día (duración estimada de las tareas); si un día pasa de 6 h, propón mover algo.
- Títulos de tarea cortos y que empiecen por un verbo. Fechas en formato YYYY-MM-DD y horas HH:MM, en su zona horaria.
- Responde en español.`

const DATE = { type: 'string', description: 'YYYY-MM-DD' }
const TIME = { type: 'string', description: 'HH:MM (24 h)' }
const PRIORITY = { type: 'integer', minimum: 0, maximum: 3, description: '0 ninguna, 1 baja, 2 media, 3 alta' }
const DURATION = { type: 'integer', minimum: 1, description: 'Minutos que calculas que llevará (para no sobrecargar el día)' }

export const TOOLS = [
  {
    name: 'ver_resumen',
    title: 'Ver resumen de NTab',
    description:
      'Resumen completo: fecha y hora actuales, tareas atrasadas, con fecha y sin fecha (con sus id), proyectos, objetivos, hábitos de hoy, pagos próximos y personas (cumpleaños y a quién llamar). Úsalo antes de responder sobre la agenda o planificar.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'ver_eventos',
    title: 'Ver eventos del calendario',
    description:
      'Eventos de los calendarios que el usuario ha conectado (Google, iCloud, Outlook…), en un rango de fechas. Solo lectura: úsalo para saber cuándo tiene reuniones o huecos libres.',
    inputSchema: { type: 'object', properties: { desde: DATE, hasta: DATE } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'buscar_tareas',
    title: 'Buscar tareas',
    description: 'Busca tareas por texto, estado, fechas, proyecto o etiqueta. Devuelve sus id para poder cambiarlas.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto en el título, las notas o las etiquetas' },
        estado: { type: 'string', enum: ['pendientes', 'hechas', 'todas'], description: 'Por defecto, pendientes' },
        desde: DATE,
        hasta: DATE,
        proyecto: { type: 'string', description: 'Nombre del proyecto' },
        etiqueta: { type: 'string' },
        persona: { type: 'string', description: 'Tareas relacionadas con esta persona' },
        limite: { type: 'integer', minimum: 1, maximum: 200 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'crear_tareas',
    title: 'Crear tareas',
    description:
      'Crea una o varias tareas en NTab (por ejemplo, a partir de un email o una lista). Las tareas con hora avisan a su hora si el usuario tiene activado el aviso automático.',
    inputSchema: {
      type: 'object',
      properties: {
        tareas: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'Corto, empieza por un verbo' },
              fecha: DATE,
              hora: TIME,
              prioridad: PRIORITY,
              notas: { type: 'string' },
              proyecto: { type: 'string', description: 'Nombre de un proyecto existente' },
              etiquetas: { type: 'array', items: { type: 'string' } },
              subtareas: { type: 'array', items: { type: 'string' } },
              personas: { type: 'array', items: { type: 'string' }, description: 'Personas relacionadas (por nombre): la tarea aparece en su ficha' },
              duracion: DURATION,
            },
            required: ['titulo'],
          },
        },
      },
      required: ['tareas'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'actualizar_tareas',
    title: 'Actualizar tareas',
    description: 'Cambia tareas existentes por su id: título, fecha, hora, prioridad, notas, proyecto, duración estimada o marcarlas como hechas. fecha u hora a null las quita.',
    inputSchema: {
      type: 'object',
      properties: {
        cambios: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              titulo: { type: 'string' },
              fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD, o null para quitarla' },
              hora: { type: ['string', 'null'], description: 'HH:MM, o null para quitarla' },
              prioridad: PRIORITY,
              notas: { type: 'string' },
              proyecto: { type: ['string', 'null'], description: 'Nombre del proyecto, o null para sacarla' },
              hecha: { type: 'boolean' },
              duracion: { type: ['integer', 'null'], minimum: 1, description: 'Minutos estimados, o null para quitarla' },
            },
            required: ['id'],
          },
        },
      },
      required: ['cambios'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'crear_nota',
    title: 'Crear nota',
    description: 'Guarda una nota en NTab (ideas, resúmenes, apuntes de una reunión…).',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        contenido: { type: 'string', description: 'Texto; las líneas "- [ ] algo" se pueden convertir luego en tareas' },
        proyecto: { type: 'string' },
      },
      required: ['titulo'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'marcar_habito',
    title: 'Marcar hábito',
    description: 'Marca (o desmarca) un hábito como hecho en un día; por defecto, hoy.',
    inputSchema: {
      type: 'object',
      properties: {
        habito: { type: 'string', description: 'Nombre del hábito' },
        fecha: DATE,
        hecho: { type: 'boolean', description: 'false para desmarcarlo; por defecto true' },
      },
      required: ['habito'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'crear_proyecto',
    title: 'Crear proyecto',
    description: 'Crea un proyecto (algo que necesita varias tareas: una mudanza, un viaje…). Después se le pueden añadir tareas con crear_tareas indicando el proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        area: { type: 'string', description: 'Área de vida (Trabajo, Personal, Salud…)' },
        descripcion: { type: 'string', description: '¿Qué significa terminarlo?' },
        limite: DATE,
      },
      required: ['nombre'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'actualizar_objetivo',
    title: 'Actualizar objetivo',
    description: 'Actualiza un objetivo: poner la cifra (cifra), sumarle algo (sumar, p. ej. 1 libro más) o marcarlo como conseguido.',
    inputSchema: {
      type: 'object',
      properties: {
        objetivo: { type: 'string', description: 'Nombre del objetivo' },
        cifra: { type: 'number' },
        sumar: { type: 'number' },
        conseguido: { type: 'boolean' },
      },
      required: ['objetivo'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'registrar_contacto',
    title: 'Registrar contacto',
    description: 'Apunta que ha hablado con una persona (llamada, mensaje, reunión…). Actualiza su último contacto.',
    inputSchema: {
      type: 'object',
      properties: {
        persona: { type: 'string' },
        tipo: { type: 'string', enum: ['llamada', 'mensaje', 'reunión', 'email', 'otro'] },
        resumen: { type: 'string', description: 'De qué hablasteis' },
        fecha: DATE,
      },
      required: ['persona'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'marcar_pago',
    title: 'Marcar pago como pagado',
    description: 'Marca un recibo o pago recurrente como pagado: pasa al siguiente cargo.',
    inputSchema: {
      type: 'object',
      properties: { pago: { type: 'string', description: 'Nombre del pago (alquiler, luz…)' } },
      required: ['pago'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'ver_plantillas',
    title: 'Ver plantillas',
    description: 'Lista las plantillas del usuario (listas reutilizables: maleta de viaje, cierre de mes…) con sus tareas.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'usar_plantilla',
    title: 'Usar plantilla',
    description:
      'Crea las tareas de una plantilla con fechas relativas al día de inicio. Con como="proyecto" crea además un proyecto; con proyecto="nombre" (sin como) las añade a un proyecto existente.',
    inputSchema: {
      type: 'object',
      properties: {
        plantilla: { type: 'string', description: 'Nombre de la plantilla' },
        fecha_inicio: DATE,
        como: { type: 'string', enum: ['proyecto', 'tareas'], description: 'proyecto: crea un proyecto nuevo; tareas: tareas sueltas (por defecto)' },
        proyecto: { type: 'string', description: 'Nombre del proyecto nuevo, o de uno existente donde añadirlas' },
      },
      required: ['plantilla'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
]

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const ok = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const text = (s: string, isError = false) => ({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) })

async function callTool(name: string, args: Record<string, unknown>, store: Store, env: Env) {
  const rows = await store.load()
  switch (name) {
    case 'ver_resumen': {
      const cal = store.events ? await store.events(env.now - 864e5, env.now + 8 * 864e5).catch(() => undefined) : undefined
      if (cal) {
        const soon = cal.events.filter((e) => Date.parse(e.allDay ? `${e.end}T00:00:00Z` : e.end) > env.now)
        return text(buildSummary(rows, env, { events: soon, names: cal.names }))
      }
      return text(buildSummary(rows, env))
    }
    case 'ver_eventos': {
      if (!store.events) return text('No hay calendarios conectados.')
      const from = isDate(args.desde) ? Date.parse(`${args.desde}T00:00:00Z`) - 864e5 : env.now - 864e5
      const to = isDate(args.hasta) ? Date.parse(`${args.hasta}T00:00:00Z`) + 2 * 864e5 : env.now + 8 * 864e5
      const cal = await store.events(from, Math.min(to, from + 95 * 864e5))
      if (!Object.keys(cal.names).length) return text('No hay calendarios conectados. Se conectan en NTab → Ajustes → Tus calendarios.')
      const lines = eventLines(cal.events, cal.names, env).filter((l) => {
        const m = l.match(/\((\d{4}-\d{2}-\d{2})\)/)
        return !m || ((!isDate(args.desde) || m[1] >= (args.desde as string)) && (!isDate(args.hasta) || m[1] <= (args.hasta as string)))
      })
      return text(lines.length ? lines.join('\n') : 'No hay eventos en esas fechas.')
    }
    case 'buscar_tareas':
      return text(searchTasks(rows, args as SearchArgs, env))
    case 'crear_tareas': {
      if (!Array.isArray(args.tareas)) return text('Falta la lista "tareas".', true)
      const r = createTasks(rows, args.tareas as NewTask[], env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    case 'actualizar_tareas': {
      if (!Array.isArray(args.cambios)) return text('Falta la lista "cambios".', true)
      const r = updateTasks(rows, args.cambios as Change[], env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    case 'crear_nota': {
      const r = createNote(rows, args, env)
      await store.save(r.writes)
      return text(r.report.join('\n'))
    }
    case 'marcar_habito': {
      const r = markHabit(rows, args, env)
      if (r.writes.length || r.deletes.length) await store.save(r.writes, r.deletes)
      return text(r.report.join('\n'))
    }
    case 'ver_plantillas':
      return text(listTemplates(rows))
    case 'usar_plantilla': {
      const r = useTemplate(rows, args, env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    case 'crear_proyecto':
    case 'actualizar_objetivo':
    case 'registrar_contacto':
    case 'marcar_pago': {
      const fn = { crear_proyecto: createProject, actualizar_objetivo: updateGoal, registrar_contacto: logContact, marcar_pago: markPaid }[name]
      const r = fn(rows, args, env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    default:
      return null
  }
}

/** Responde a un mensaje JSON-RPC. Devuelve null para las notificaciones (sin respuesta). */
export async function handleMessage(msg: RpcRequest, store: Store, env: Env): Promise<unknown | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid Request')
  const isNotification = msg.id === undefined || msg.id === null
  if (isNotification) return null
  const params = msg.params ?? {}
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = String(params.protocolVersion ?? '')
        return ok(msg.id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return ok(msg.id, {})
      case 'tools/list':
        return ok(msg.id, { tools: TOOLS })
      case 'tools/call': {
        const name = String(params.name ?? '')
        const result = await callTool(name, (params.arguments as Record<string, unknown>) ?? {}, store, env)
        return result ? ok(msg.id, result) : fail(msg.id, -32602, `Herramienta desconocida: ${name}`)
      }
      case 'resources/list':
        return ok(msg.id, { resources: [] })
      case 'prompts/list':
        return ok(msg.id, { prompts: [] })
      default:
        return fail(msg.id, -32601, `Método no disponible: ${msg.method}`)
    }
  } catch (e) {
    // Un fallo al leer o guardar se devuelve como error de la herramienta para que Claude lo cuente
    if (msg.method === 'tools/call') return ok(msg.id, text(`No se pudo completar: ${e instanceof Error ? e.message : String(e)}`, true))
    return fail(msg.id, -32603, e instanceof Error ? e.message : 'Error interno')
  }
}

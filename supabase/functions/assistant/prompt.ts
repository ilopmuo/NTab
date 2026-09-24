/**
 * Instrucciones y herramientas del asistente. Sin dependencias de Deno para
 * poder probarlo con los tests de la app (src/lib/assistant.test.ts).
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ProposedTask {
  titulo: string
  fecha?: string
  hora?: string
  prioridad?: number
  notas?: string
  proyecto?: string
}

export interface ProposedChange {
  id: string
  titulo?: string
  fecha?: string | null
  hora?: string | null
  prioridad?: number
  hecha?: boolean
}

export interface AssistantReply {
  text: string
  tasks: ProposedTask[]
  changes: ProposedChange[]
}

export const MAX_MESSAGES = 20
export const MAX_CONTEXT = 60_000

export function systemPrompt(context: string) {
  return `Eres el asistente de NTab, la app con la que una persona muy despistada organiza su vida: tareas, proyectos, hábitos, objetivos, pagos y personas.

Cómo respondes:
- En español de España, cercano y directo. Frases cortas.
- Breve: lo justo para que actúe. Usa listas cuando ayuden y **negrita** para lo importante.
- Usa solo los datos de <datos>. Si algo no está, dilo; no inventes tareas, fechas ni cifras.
- Las fechas, en lenguaje natural ("mañana", "el jueves 26"), no en formato ISO.

Herramientas:
- proponer_tareas: cuando te pida crear, añadir o apuntar tareas, o convertir un texto (un email, una lista, notas) en tareas. Títulos cortos que empiecen por un verbo. Pon fecha u hora solo si se deducen del texto.
- proponer_cambios: cuando te pida reprogramar, mover, priorizar, planificar el día o la semana, o marcar cosas como hechas. Usa los id de <datos>.
La persona revisará la propuesta y la aplicará con un botón, así que no digas que ya está hecho: explica brevemente qué propones.

<datos>
${context.slice(0, MAX_CONTEXT)}
</datos>`
}

export const TOOLS = [
  {
    name: 'proponer_tareas',
    description: 'Propone tareas nuevas para añadir a NTab. La persona las revisa antes de crearlas.',
    input_schema: {
      type: 'object',
      properties: {
        tareas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'Corto, empieza por un verbo' },
              fecha: { type: 'string', description: 'YYYY-MM-DD' },
              hora: { type: 'string', description: 'HH:MM, 24 h' },
              prioridad: { type: 'integer', minimum: 0, maximum: 3, description: '0 ninguna, 1 baja, 2 media, 3 alta' },
              notas: { type: 'string' },
              proyecto: { type: 'string', description: 'Nombre de un proyecto existente' },
            },
            required: ['titulo'],
          },
        },
      },
      required: ['tareas'],
    },
  },
  {
    name: 'proponer_cambios',
    description: 'Propone cambios en tareas existentes (fecha, hora, prioridad o completarlas). La persona los revisa antes de aplicarlos.',
    input_schema: {
      type: 'object',
      properties: {
        cambios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'id de la tarea en <datos>' },
              titulo: { type: 'string', description: 'Título actual, para mostrarlo' },
              fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD; null para quitar la fecha' },
              hora: { type: ['string', 'null'], description: 'HH:MM; null para quitar la hora' },
              prioridad: { type: 'integer', minimum: 0, maximum: 3 },
              hecha: { type: 'boolean' },
            },
            required: ['id'],
          },
        },
      },
      required: ['cambios'],
    },
  },
]

/** Mensajes válidos para la API: alternos, empezando y acabando en el usuario */
export function cleanMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return []
  const out: ChatMessage[] = []
  for (const m of messages.slice(-MAX_MESSAGES)) {
    const role = (m as ChatMessage)?.role
    const content = String((m as ChatMessage)?.content ?? '').slice(0, 20_000).trim()
    if ((role !== 'user' && role !== 'assistant') || !content) continue
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n\n${content}`
    else out.push({ role, content })
  }
  while (out.length && out[0].role !== 'user') out.shift()
  return out
}

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}

const ymd = /^\d{4}-\d{2}-\d{2}$/
const hhmm = /^\d{2}:\d{2}$/

/** Respuesta de la API → texto + propuestas validadas */
export function parseReply(content: ContentBlock[]): AssistantReply {
  const text = content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!.trim())
    .join('\n\n')
  const tasks: ProposedTask[] = []
  const changes: ProposedChange[] = []
  for (const b of content) {
    if (b.type !== 'tool_use' || !b.input) continue
    if (b.name === 'proponer_tareas' && Array.isArray(b.input.tareas)) {
      for (const t of b.input.tareas as ProposedTask[]) {
        if (!t?.titulo?.trim()) continue
        tasks.push({
          titulo: t.titulo.trim(),
          fecha: t.fecha && ymd.test(t.fecha) ? t.fecha : undefined,
          hora: t.hora && hhmm.test(t.hora) ? t.hora : undefined,
          prioridad: typeof t.prioridad === 'number' ? Math.max(0, Math.min(3, Math.round(t.prioridad))) : undefined,
          notas: t.notas?.trim() || undefined,
          proyecto: t.proyecto?.trim() || undefined,
        })
      }
    }
    if (b.name === 'proponer_cambios' && Array.isArray(b.input.cambios)) {
      for (const c of b.input.cambios as ProposedChange[]) {
        if (!c?.id) continue
        const change: ProposedChange = { id: String(c.id), titulo: c.titulo }
        if (c.fecha === null || (typeof c.fecha === 'string' && ymd.test(c.fecha))) change.fecha = c.fecha
        if (c.hora === null || (typeof c.hora === 'string' && hhmm.test(c.hora))) change.hora = c.hora
        if (typeof c.prioridad === 'number') change.prioridad = Math.max(0, Math.min(3, Math.round(c.prioridad)))
        if (typeof c.hecha === 'boolean') change.hecha = c.hecha
        // Solo si cambia algo de verdad
        if (['fecha', 'hora', 'prioridad', 'hecha'].some((k) => k in change)) changes.push(change)
      }
    }
  }
  return {
    text: text || (tasks.length ? 'Te propongo estas tareas:' : changes.length ? 'Te propongo estos cambios:' : ''),
    tasks,
    changes,
  }
}

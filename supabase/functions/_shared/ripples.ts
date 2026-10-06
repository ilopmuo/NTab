/**
 * Lo que una tarea hecha cambia en el resto de LUNO, para que todo se
 * alimente solo: el contacto con las personas de la tarea, la «última vez»
 * que es (cambiar las sábanas) y la casilla de la nota de la que salió. Lo
 * usan la app (al completar) y el servidor (Claude y Siri). Sin dependencias.
 */
import { normalize } from './text.ts'
import { likeness } from './likeness.ts'

export type ContactKind = 'call' | 'message' | 'meeting' | 'email' | 'other'

/** Qué contacto es una tarea hecha con alguien: «Llamar a mamá», una llamada; «Comer con Ana», un encuentro */
export function contactKind(title: string): ContactKind {
  const t = normalize(title)
  if (/\b(llam|telefone)/.test(t)) return 'call'
  if (/\b(email|e-mail|correo|mail)\b/.test(t)) return 'email'
  if (/\b(escrib|mensaje|whatsapp|wasap|felicit|responder|contestar)/.test(t)) return 'message'
  if (/\b(reunion|quedar|quedada|ver a|visitar|comer con|cenar con|desayunar con|cafe con|tomar algo|cita con)/.test(t)) return 'meeting'
  return 'other'
}

/**
 * La «Última vez» que es esta tarea, si la hay: tienen que decir lo mismo en
 * los dos sentidos («Cambiar las sábanas» y «cambiar sábanas», sí; «Cambiar
 * las sábanas de invitados», no). Las de «Días sin…» no cuentan.
 */
export function trackerFor<T extends { name: string; archived?: unknown; avoid?: unknown }>(title: string, trackers: T[]): T | undefined {
  return trackers.find((x) => !x.archived && !x.avoid && likeness(title, x.name) >= 1 && likeness(x.name, title) >= 1)
}

const CHECK = /^(\s*[-*]\s*)\[([ xX])\](\s+)(.*)$/
/** El texto de una casilla, para comparar: sin mayúsculas, tildes ni espacios de más */
const key = (s: string) => normalize(s).replace(/\s+/g, ' ').trim()

/**
 * Marca (o desmarca) la casilla de una línea en el texto de una nota.
 * `undefined` si la línea ya no está (o ya estaba así).
 */
export function checkNoteLine(content: string, line: string, done: boolean): string | undefined {
  const want = key(line)
  const lines = content.split('\n')
  const i = lines.findIndex((l) => {
    const m = CHECK.exec(l)
    return !!m && key(m[4]) === want && (m[2] !== ' ') !== done
  })
  if (i < 0) return undefined
  lines[i] = lines[i].replace(CHECK, (_, a: string, _b: string, c: string, d: string) => `${a}[${done ? 'x' : ' '}]${c}${d}`)
  return lines.join('\n')
}

/** Una línea de casilla («- [x] Llamar a Juan»): si está marcada y su texto */
export function checkItem(line: string): { done: boolean; text: string } | undefined {
  const m = CHECK.exec(line)
  return m && m[4].trim() ? { done: m[2] !== ' ', text: m[4].trim() } : undefined
}

/** Si dos textos de casilla son la misma (sin mayúsculas, tildes ni espacios de más) */
export const sameLine = (a: string, b: string) => key(a) === key(b)

/** Las casillas sin marcar de una nota (para pasarlas a tareas) */
export function openChecklist(content: string): string[] {
  return content
    .split('\n')
    .map((l) => CHECK.exec(l))
    .filter((m): m is RegExpExecArray => !!m && m[2] === ' ' && !!m[4].trim())
    .map((m) => m[4].trim())
}

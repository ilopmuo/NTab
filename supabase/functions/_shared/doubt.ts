/**
 * Antes de crear una tarea desde fuera (Siri, Claude, Hermes): ¿se ha
 * entendido de verdad? Mejor preguntar «¿qué tienes que sacar?» que guardar
 * «Sacar También tengo que sacar» como si fuera una tarea buena. Y ¿no la
 * tenía ya? Sin dependencias: lo usan el conector y la captura de Siri.
 */
import { normalize } from './text.ts'
import { likeness } from './likeness.ts'

const fold = (s: string) => normalize(s).trim()

/** Verbos que no dicen nada sin lo que se hace («Sacar», «Llamar a»): con su pregunta */
const NEEDS_OBJECT: Record<string, string> = {
  sacar: '¿Qué tienes que sacar?',
  llamar: '¿A quién tienes que llamar?',
  comprar: '¿Qué tienes que comprar?',
  enviar: '¿Qué tienes que enviar, y a quién?',
  mandar: '¿Qué tienes que mandar, y a quién?',
  pagar: '¿Qué tienes que pagar?',
  pedir: '¿Qué tienes que pedir?',
  devolver: '¿Qué tienes que devolver?',
  llevar: '¿Qué tienes que llevar?',
  recoger: '¿Qué tienes que recoger?',
  traer: '¿Qué tienes que traer?',
  escribir: '¿A quién o qué tienes que escribir?',
  reservar: '¿Qué tienes que reservar?',
  buscar: '¿Qué tienes que buscar?',
  revisar: '¿Qué tienes que revisar?',
  preparar: '¿Qué tienes que preparar?',
  hacer: '¿Qué tienes que hacer?',
  mirar: '¿Qué tienes que mirar?',
  arreglar: '¿Qué tienes que arreglar?',
  renovar: '¿Qué tienes que renovar?',
  contestar: '¿A quién tienes que contestar?',
  responder: '¿A quién tienes que responder?',
  quedar: '¿Con quién has quedado?',
}

/** Coletillas del dictado que no deberían quedar a mitad de una tarea */
const MID_FILLER = /\s(?:tambi[eé]n|adem[aá]s|tengo\s+que|hay\s+que|tendr[ií]a\s+que|o\s+sea|osea|bueno|pues|vale|oye|eh+)(?=\s|$)/i
/** Se ha cortado: termina en «a», «de», «el»… */
const CUT = /\s(?:a|al|de|del|con|para|por|en|el|la|los|las|un|una|y|o|que|mi|tu|su)$/i

/**
 * Por qué una tarea no parece entendida, con la pregunta para aclararla; o
 * `undefined` si se entiende.
 */
export function unclearTask(title: string): { why: string; ask: string } | undefined {
  const t = title.trim().replace(/[.,;:!¡¿?]+$/, '')
  const words = fold(t).split(/\s+/).filter(Boolean)
  if (!words.length) return { why: 'no dice nada', ask: '¿Qué tienes que hacer?' }
  const verb = words[0]
  if (words.length === 1 && NEEDS_OBJECT[verb]) return { why: 'le falta qué', ask: NEEDS_OBJECT[verb] }
  if (CUT.test(t)) return { why: 'parece cortada', ask: `¿«${t}» qué? Dímelo entero.` }
  // La misma palabra dos veces («Sacar También tengo que sacar»): el dictado se ha liado
  const long = words.filter((w) => w.length >= 4)
  const repeated = long.find((w, i) => long.indexOf(w) !== i)
  if (repeated || MID_FILLER.test(t)) return { why: 'parece un dictado a medias', ask: NEEDS_OBJECT[verb] ?? `«${t}» no me queda claro: ¿qué tienes que hacer exactamente?` }
  return undefined
}

/**
 * Una tarea pendiente que ya dice lo mismo (en los dos sentidos: «Llamar al
 * dentista» y «llamar dentista», sí; «Llamar al dentista para la revisión», no).
 */
export function sameTask<T extends { title: string; done?: unknown }>(title: string, open: T[]): T | undefined {
  const t = fold(title)
  return open.find((x) => !x.done && (fold(x.title) === t || (likeness(title, x.title) >= 1 && likeness(x.title, title) >= 1)))
}

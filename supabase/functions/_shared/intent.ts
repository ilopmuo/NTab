/**
 * A dónde va lo que se apunta: lo mismo dicho a Siri (función mcp, ruta
 * /capturar) que escrito en la captura rápida de la app. «Compra leche y
 * pan» va a la compra; «gasto 12 café», a gastos; «nota: …», a notas;
 * «hecho: …», a lo hecho; «he dejado las llaves en el cajón», a tus cosas…
 * y lo demás es una tarea. Sin dependencias: solo el texto y los nombres de
 * lo que ya hay (hábitos, notas, listas de la compra y proyectos).
 */
import { normalize } from './text.ts'
import { parseQuickAdd } from './parse.ts'
import { parseExpense } from './expenses.ts'
import { likeness } from './likeness.ts'

const fold = (s: string) => normalize(s).trim()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ── El dictado ────────────────────────────────────────────────

/**
 * El dictado del iPhone pone mayúscula al principio y puntuación al final
 * («Compra leche y pan.», «¿Qué tengo mañana?»): se quita, y se recuerda si
 * era una pregunta.
 */
export function cleanDictation(raw: string): { text: string; question: boolean } {
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, 500)
  return { text: t.replace(/^[¿¡\s]+/, '').replace(/[\s.,;:!?¡¿…]+$/u, ''), question: /^¿|\?$/.test(t) }
}

// Muletillas del habla: «oye», «pues», «vale», «y luego también»…
const FILLER = /^(?:oye|oiga|venga|vale|bueno|pues|eh+|em+|ehm|mm+|ok(?:ay)?|a\s+ver|y|luego|despu[eé]s|tambi[eé]n|adem[aá]s|por\s+favor|porfa|siri|luno)(?:[\s,]+|$)/i
// Pedírselo a Siri: «recuérdame que…», «acuérdate de…», «no me puedo olvidar de…»
const ASK_REMIND = /^(?:recu[eé]rda(?:me|le)?|acu[eé]rda(?:te|me)|av[ií]same|no\s+(?:me\s+)?(?:puedo|debo|tengo\s+que)\s+olvidar(?:me)?|no\s+(?:te\s+)?olvides|que\s+no\s+se\s+me\s+olvide)(?:\s+(?:de\s+)?que|\s+de)?(?:[\s,]+|$)/i
// «apunta que…», «apúntame una tarea para…», «crea una tarea: …» («pon la lavadora» se queda: es la tarea)
const ASK_NOTE = /^(?:(?:a(?:p[uú]nta|n[oó]ta)(?:me)?|a[nñ]ade(?:me)?|cr[eé]a(?:me)?|p[oó]n(?:me)?|m[eé]te(?:me)?|agrega|guarda)\s+(?:que\b|(?:una\s+|la\s+)?(?:tarea|recordatorio)\b|un\s+recordatorio\b|en\s+(?:las\s+|mis\s+)?tareas\b)|(?:una\s+)?(?:tarea|recordatorio)\s*(?=[:,]|de\s|para\s|que\s))(?:\s*(?:de|para|que)\b)?[\s:,]*/i
// «tengo que…», «necesito…», «hay que…», «debería…» delante de lo que hay que hacer (un infinitivo)
const MODAL = /^(?:de\s+)?(?:que\s+)?(?:yo\s+)?(?:tengo\s+que|tenemos\s+que|tendr[ií]a\s+que|tendr[eé]\s+que|hay\s+que|habr[ií]a\s+que|he\s+de|necesito|necesitamos|quiero|queremos|debo|debemos|deber[ií]a|deber[ií]amos|me\s+toca|me\s+gustar[ií]a|voy\s+a|vamos\s+a)\s+(?=\S*?[aeií]r(?:me|te|le|lo|la|les|los|las|se|nos)*(?:\s|$))/i
// Al final: «…, por favor», «…, gracias», «…, ¿vale?»
const TAIL = /[\s,]+(?:por\s+favor|porfa|gracias|vale|eh+|o\s+algo\s+as[ií])$/i

/**
 * El título de una tarea dictada, sin lo que se dice para pedirla:
 * «Recuérdame que tengo que llamar al dentista» → «Llamar al dentista»,
 * «Oye, apunta que hay que pedir cita en el médico» → «Pedir cita en el médico».
 */
export function tidyTitle(title: string): string {
  let t = title.replace(/(^|[\s,])(?:eh+|em+|ehm|mm+)(?=[\s,]|$)/gi, '$1').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()
  for (let prev = ''; prev !== t; ) {
    prev = t
    t = t.replace(FILLER, '').replace(ASK_REMIND, '').replace(ASK_NOTE, '').replace(MODAL, '').replace(TAIL, '').replace(/^[\s,;:.-]+/, '')
  }
  // Si no queda nada (lo dicho era solo la petición), mejor lo de antes
  return t ? cap(t) : title
}

// ── Parecidos: «he llamado al dentista» ≈ «Llamar al dentista» (ver likeness.ts) ──

export { closest, infinitive, likeness } from './likeness.ts'

// ── A dónde va ────────────────────────────────────────────────

/** Una pregunta aunque el dictado no ponga «?»: con su tilde («Como con Ana el viernes» o «Tengo que llamar al banco» no lo son) */
export const ASKING = /^(?:qué|cuándo|dónde|cuánt[oa]s?|quién|cómo|cuál(?:es)?)(?=\s|$)/i

// «compra: leche», «compra leche y pan», «a la compra leche», «lista de la compra: …» (pero «comprar un regalo» es una tarea)
const SHOPPING_PREFIX = /^\s*(?:(?:(?:a[nñ]ade|apunta|pon)\s+)?(?:(?:a|en)\s+)?(?:(?:la\s+)?lista\s+de\s+)?la\s+compra\s*[:,.-]?|compra(?:\s*[:,.-]|\s+(?=\S)))\s*/i
// «añade leche y huevos a la lista de la compra», «pon pan en la compra»
const SHOPPING_SUFFIX = /^(?:(?:a[nñ]ade|apunta|pon|mete|agrega|incluye)\s+)?(.+?)\s+(?:a|en)\s+(?:la\s+)?(?:lista\s+de\s+(?:la\s+)?)?compra$/i
// «añade ibuprofeno a la lista de la farmacia», «añade llamar al seguro a la lista de Mudanza»
const TO_LIST = /^(?:(?:a[nñ]ade|apunta|pon|mete|agrega|incluye)\s+)?(.+?)\s+(?:a|en)\s+la\s+lista\s+(?:del\s+|de\s+(?:la\s+|el\s+|los\s+|las\s+)?)?(.+)$/i
// «quita la leche de la compra», «tacha el pan de la lista de la compra»
const BOUGHT = /^(?:quita|tacha|borra|elimina)\s+(.+?)\s+de\s+la\s+(?:lista\s+de\s+la\s+)?compra$/i
// «gasto 12 café», «mete un gasto de quince euros en Mercadona», «me he gastado 20 en la cena», «he pagado 30 de luz»
export const EXPENSE_PREFIX = /^\s*(?:(?:(?:mete|meter|apunta|anota|a[nñ]ade|pon|registra)(?:me)?\s+(?:un\s+)?)?gasto(?:\s+de)?|gast[eé]|(?:me\s+)?he\s+gastado|pagu[eé]|he\s+pagado)\s*[:,.-]?\s+/i
const NOTE_PREFIX = /^\s*(?:nota|apunta\s+una\s+nota)\s*[:,.-]?\s+/i
// «a la nota maleta: crema solar», «añade a la nota de ideas: una bici»
const NOTE_APPEND = /^\s*(?:(?:a[nñ]ade|apunta|pon|mete)\s+)?(?:a|en)\s+la\s+nota\s+(?:de\s+(?:la\s+|los\s+|las\s+|el\s+)?)?(.+?)\s*[:,]\s+(.+)$/i
// Sin dos puntos, como sale del dictado: «añade a la nota maleta crema solar»…
const NOTE_APPEND_LOOSE = /^(?:(?:a[nñ]ade|apunta|pon|mete|agrega)\s+)?(?:a|en)\s+la\s+nota\s+(?:de\s+(?:la\s+|los\s+|las\s+|el\s+)?)?(.+)$/i
// …o «añade crema solar a la nota maleta»
const NOTE_APPEND_AFTER = /^(?:a[nñ]ade|apunta|pon|mete|agrega)\s+(.+?)\s+(?:a|en)\s+la\s+nota\s+(?:de\s+(?:la\s+|los\s+|las\s+|el\s+)?)?(.+)$/i
// «hecho: cambiar las sábanas»
export const DONE_PREFIX = /^\s*(?:lo\s+he\s+hecho|hecho|[uú]ltima\s+vez)\s*[:,.-]?\s+/i
// «hábito: agua», «+1 agua», «+2 vasos de agua»
export const HABIT_PREFIX = /^\s*(?:h[aá]bito\s*[:,.-]?\s+|\+\s*(\d+)\s+)/i
// «he dejado las llaves en el cajón», «apunta que el pasaporte está en el armario»
const PLACE = '(en|dentro\\s+de|debajo\\s+de|encima\\s+de|detr[aá]s\\s+de|junto\\s+a|al\\s+lado\\s+de)\\s+(.+)'
const LEFT = new RegExp(`^(?:(?:ya\\s+)?he\\s+(?:dejado|guardado|puesto)|dej[eé]|guard[eé]|puse)\\s+(?!a\\s)(.+?)\\s+${PLACE}$`, 'i')
const LEFT_THAT = new RegExp(`^(?:guarda|apunta|recuerda|anota)\\s+que\\s+(.+?)\\s+est[aá]n?\\s+${PLACE}$`, 'i')
// «le he prestado el taladro a Luis»
const LENT = /^(?:le\s+|les\s+)?(?:he\s+prestado|prest[eé])\s+(.+?)\s+a\s+(.+)$/i
const ARTICLE = /^(?:el|la|los|las|mi|mis|un|una|unos|unas)\s+/i

/** Lo que ya hay, para decidir: «meditar» es un hábito, «maleta» una nota, «farmacia» una lista… */
export interface IntentNames {
  habits?: string[]
  notes?: string[]
  /** listas de la compra además de la principal */
  lists?: string[]
  projects?: string[]
}

export type Intent =
  /** marcar un hábito (con cantidad, sumar) */
  | { kind: 'habit'; name: string; qty?: number }
  /** añadir a una nota (si no existe, se crea) */
  | { kind: 'noteAppend'; note: string; text: string }
  | { kind: 'note'; title: string; body: string }
  /** «hecho: …»: la tarea que encaje, un hábito o «Última vez» */
  | { kind: 'done'; what: string }
  /** dónde está algo («he dejado las llaves en el cajón») */
  | { kind: 'thing'; name: string; where: string }
  /** a quién se lo has prestado */
  | { kind: 'lent'; name: string; person: string }
  /** tachar de la compra lo que ya está en ella */
  | { kind: 'bought'; items: string }
  /** a la compra (`list`: el nombre de otra lista) */
  | { kind: 'shopping'; items: string; list?: string }
  /** una tarea en la lista de un proyecto */
  | { kind: 'projectTask'; text: string; project: string }
  | { kind: 'expense'; text: string }
  | { kind: 'task' }

/**
 * A dónde va un texto (dictado o escrito). Lo que depende de tus tareas
 * («he llamado al dentista», «pospón…») o pide una respuesta lo decide quien
 * llama: aquí, lo que no es nada de eso es una tarea.
 */
export function classify(raw: string, names: IntentNames, today: string): Intent {
  const { text, question } = cleanDictation(raw)
  if (!text || question || ASKING.test(text)) return { kind: 'task' }
  const dated = (s: string) => !!parseQuickAdd(s, { today, projects: [], areas: [] }).dueDate

  const habit = HABIT_PREFIX.exec(text)
  // El nombre exacto de un hábito («meditar») también lo marca
  if (habit) return { kind: 'habit', name: text.slice(habit[0].length), ...(habit[1] ? { qty: Number(habit[1]) } : {}) }
  const sameHabit = names.habits?.find((n) => fold(n) === fold(text))
  if (sameHabit) return { kind: 'habit', name: sameHabit }

  const append = NOTE_APPEND.exec(text)
  if (append) return { kind: 'noteAppend', note: append[1], text: append[2] }
  const after = NOTE_APPEND_AFTER.exec(text)
  if (after && !/^(?:a|en)\s+la\s+nota\b/i.test(after[1])) return { kind: 'noteAppend', note: after[2], text: after[1] }
  const loose = NOTE_APPEND_LOOSE.exec(text)
  if (loose) {
    // La nota que ya existe con el nombre más largo que encaje; si no, la primera palabra
    const rest = loose[1]
    const hit = [...(names.notes ?? [])].sort((a, b) => b.length - a.length).find((t) => t && fold(rest).startsWith(`${fold(t)} `))
    if (hit) return { kind: 'noteAppend', note: hit, text: rest.slice(hit.length).trim() }
    const [first, ...more] = rest.split(' ')
    return { kind: 'noteAppend', note: first, text: more.join(' ') }
  }
  if (NOTE_PREFIX.test(text)) {
    // El texto de la nota, tal cual (con su punto final); de título, la primera frase (como mucho 60 letras)
    const body = raw.replace(/\s+/g, ' ').trim().slice(0, 2000).replace(NOTE_PREFIX, '')
    const first = body.split(/(?<=[.!?])\s/)[0]
    const title = first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first.replace(/[.!?]$/, '')
    return { kind: 'note', title: cap(title), body }
  }
  if (DONE_PREFIX.test(text)) return { kind: 'done', what: text.replace(DONE_PREFIX, '') }

  const lent = LENT.exec(text)
  if (lent) return { kind: 'lent', name: cap(lent[1].replace(ARTICLE, '')), person: lent[2] }
  const left = LEFT.exec(text) ?? LEFT_THAT.exec(text)
  // «He puesto la lavadora en marcha» o con un día por delante, no es dónde está algo
  if (left && !/^marcha$/i.test(left[3]) && !dated(text)) return { kind: 'thing', name: cap(left[1].replace(ARTICLE, '')), where: /^en$/i.test(left[2]) ? left[3] : `${left[2].toLowerCase()} ${left[3]}` }

  const got = BOUGHT.exec(text)
  if (got) return { kind: 'bought', items: got[1] }
  const shopping = SHOPPING_PREFIX.exec(text)
  // «Compra entradas para el viernes» (con día) es una tarea
  if (shopping && !(/^compra\s/i.test(shopping[0]) && dated(text))) return { kind: 'shopping', items: text.slice(shopping[0].length) }
  const shoppingAfter = SHOPPING_SUFFIX.exec(text)
  if (shoppingAfter) return { kind: 'shopping', items: shoppingAfter[1] }
  const toList = TO_LIST.exec(text)
  if (toList) {
    const name = fold(toList[2])
    const list = names.lists?.find((l) => fold(l) === name || fold(l).includes(name))
    if (list) return { kind: 'shopping', items: toList[1], list }
    const project = names.projects?.find((p) => likeness(toList[2], p) >= 1)
    if (project) return { kind: 'projectTask', text: toList[1], project }
  }

  const expense = EXPENSE_PREFIX.exec(text)
  // «he pagado la luz» sin importe no es un gasto: es algo hecho
  if (expense && (parseExpense(text.slice(expense[0].length)) || /gast/i.test(expense[0]))) return { kind: 'expense', text: text.slice(expense[0].length) }

  return { kind: 'task' }
}

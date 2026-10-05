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

// ── Parecidos: «he llamado al dentista» ≈ «Llamar al dentista» ──

const STOP = new Set('a al el la los las lo le les de del un una unos unas en con por para y e o u mi mis tu tus su sus que ya hoy he has ha hemos me te se'.split(' '))
// Participios y pasados irregulares → la raíz de su infinitivo
const IRREGULAR: Record<string, string> = { hech: 'hace', hice: 'hace', hizo: 'hace', pues: 'pone', puse: 'pone', vist: 'ver', vi: 'ver', vuel: 'volv', devu: 'devo', dich: 'deci', dije: 'deci', abie: 'abri', roto: 'romp', ido: 'ir', fui: 'ir', fue: 'ir', resu: 'reso' }
// Participios en -ido de verbos en -ir (los demás en -ido son de -er: comido, bebido…)
const IR_VERBS = new Set('pedir salir subir escribir recibir vivir decidir dormir servir seguir sentir elegir repetir medir anadir imprimir cumplir compartir describir discutir dividir incluir construir destruir sufrir unir permitir partir preferir prohibir reunir sacudir consumir conducir traducir producir reducir venir mentir hervir freir reir sonreir corregir dirigir exigir fingir surgir invadir aplaudir abrir cubrir descubrir resumir asistir insistir existir ocurrir'.split(' '))
const PARTICIPLE: Record<string, string> = { hecho: 'hacer', puesto: 'poner', visto: 'ver', vuelto: 'volver', devuelto: 'devolver', dicho: 'decir', escrito: 'escribir', abierto: 'abrir', roto: 'romper', ido: 'ir', resuelto: 'resolver', cubierto: 'cubrir', frito: 'freír', muerto: 'morir' }

/**
 * El infinitivo de un participio o un pasado («llamado», «llamé» → llamar;
 * «bebido», «bebí» → beber; «regué» → regar), para comparar por la raíz.
 * Se aplica igual a lo dicho y a los nombres, así que lo que no es un verbo
 * («café») también casa consigo mismo.
 */
function lemma(w: string) {
  if (w.length < 4) return w
  const root = (n: number) => w.slice(0, -n)
  const er = (r: string) => (IR_VERBS.has(fold(`${r}ir`)) ? `${r}ir` : `${r}er`)
  if (w.endsWith('ado') && w.length > 4) return `${root(3)}ar`
  if (w.endsWith('ido') && w.length > 4) return er(root(3))
  if (w.endsWith('gué')) return `${root(3)}gar`
  if (w.endsWith('qué')) return `${root(3)}car`
  if (w.endsWith('cé')) return `${root(2)}zar`
  if (w.endsWith('é')) return `${root(1)}ar`
  if (w.endsWith('í')) return er(root(1))
  return w
}
const stem = (w: string) => {
  const s = w.length > 4 ? w.slice(0, 4) : w
  return IRREGULAR[s] ?? s
}
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .map((w) => fold(lemma(w)))
    .filter((w) => w && !STOP.has(w))

/**
 * ¿Lo dicho es esto? Todo lo dicho tiene que estar (el verbo también: «he
 * llamado al dentista» no es «Pedir cita al dentista»). 0 si no; 1 o más, si
 * lo dice entero; entre medias, si se queda corto.
 */
export function likeness(said: string, name: string) {
  if (fold(said) === fold(name)) return 2
  const a = words(said).map(stem)
  const b = new Set(words(name).map(stem))
  if (!a.length || !b.size || !a.every((w) => b.has(w))) return 0
  return new Set(a).size / b.size
}

/** Lo más parecido de una lista (si hay empate entre varias, todas) */
export function closest<T>(items: T[], said: string, name: (x: T) => string, rank: (x: T) => number = () => 0): { hit?: T; tie?: T[] } {
  const scored = items
    .map((x) => ({ x, s: likeness(said, name(x)), r: rank(x) }))
    .filter((y) => y.s >= 0.5)
    .sort((p, q) => q.s - p.s || q.r - p.r)
  if (!scored.length) return {}
  const top = scored.filter((y) => y.s === scored[0].s && y.r === scored[0].r)
  return top.length > 1 && new Set(top.map((y) => fold(name(y.x)))).size > 1 ? { tie: top.map((y) => y.x) } : { hit: scored[0].x }
}

/** «he cambiado las sábanas» → «Cambiar las sábanas» (para «Última vez») */
export function infinitive(said: string) {
  const m = /^(?:ya\s+)?(?:he|hemos)\s+(\S+)\s*(.*)$/i.exec(said)
  if (!m) return cap(said)
  const p = fold(m[1])
  let verb = PARTICIPLE[p]
  if (!verb && p.endsWith('ado')) verb = `${p.slice(0, -3)}ar`
  if (!verb && p.endsWith('ido')) verb = IR_VERBS.has(`${p.slice(0, -3)}ir`) ? `${p.slice(0, -3)}ir` : `${p.slice(0, -3)}er`
  return cap([verb ?? m[1], m[2]].filter(Boolean).join(' '))
}

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

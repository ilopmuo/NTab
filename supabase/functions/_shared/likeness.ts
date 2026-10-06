/**
 * Parecidos entre lo dicho y lo que hay: «he llamado al dentista» ≈ «Llamar
 * al dentista». Aparte de intent.ts para que lo use quien no necesita el
 * analizador entero (lo que cambia al hacer una tarea, ver ripples.ts). Sin
 * dependencias.
 */
import { normalize } from './text.ts'

const fold = (s: string) => normalize(s).trim()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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

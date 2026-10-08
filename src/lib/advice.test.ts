import { describe, expect, it } from 'vitest'
import { categoryReport, spendingAdvice, totalSaving, weekMessage, weekReview, type Spent } from './advice'
import { classifyNote, guessCategories, parseExpense } from './expenses'

// Jueves 15 de octubre de 2026
const TODAY = '2026-10-15'
const e = (date: string, amount: number, category: string, note: string): Spent => ({ date, amount, category, note })

/** Tres meses normales y un octubre con mucho Glovo, cafés y un fin de semana caro */
function history(): Spent[] {
  const out: Spent[] = []
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    out.push(e(`${m}-03`, 250, 'super', 'Mercadona'), e(`${m}-10`, 40, 'comer', 'Restaurante'), e(`${m}-17`, 30, 'comer', 'Glovo'), e(`${m}-20`, 90, 'ocio', 'Concierto'), e(`${m}-24`, 30, 'ocio', 'Cine'))
  }
  for (const d of ['02', '04', '06', '08', '10', '12', '14']) out.push(e(`2026-10-${d}`, 18, 'comer', 'Glovo'))
  for (let i = 1; i <= 14; i++) out.push(e(`2026-10-${String(i).padStart(2, '0')}`, 2.2, 'comer', 'Café'))
  out.push(e('2026-10-03', 120, 'ocio', 'Fiesta'), e('2026-10-10', 60, 'ocio', 'Cena y copas'), e('2026-10-11', 200, 'super', 'Mercadona'))
  return out
}

describe('clasificar con confianza', () => {
  it('sin regla ni palabra conocida, no se sabe (y se pregunta)', () => {
    expect(classifyNote('Mercadona')).toEqual({ category: 'super', sure: true })
    expect(classifyNote('AMZN Mktp ES')).toEqual({ category: 'otros', sure: false })
    expect(classifyNote('AMZN Mktp ES', { 'amzn mktp es': 'casa' })).toEqual({ category: 'casa', sure: true })
    expect(parseExpense('23,40 amzn mktp')).toMatchObject({ category: 'otros', unsure: true })
    expect(parseExpense('12 café')!.unsure).toBeUndefined()
  })
  it('adivina por los gastos con palabras en común, y si no, por lo que más usas', () => {
    const past = [e('2026-10-01', 30, 'ocio', 'Amazon libros'), e('2026-10-02', 20, 'casa', 'Amazon bombillas'), e('2026-10-03', 25, 'ocio', 'Amazon juego'), e('2026-10-04', 60, 'super', 'Lidl')]
    expect(guessCategories('Amazon Mktp', past, 2)).toEqual(['ocio', 'casa'])
    expect(guessCategories('XYZ 123', past, 3)).toEqual(['ocio', 'casa', 'super'])
  })
})

describe('consejos para gastar menos', () => {
  const tips = spendingAdvice({
    expenses: history(),
    today: TODAY,
    budget: { categories: { ocio: 200 } },
    subs: [
      { name: 'Netflix', amount: 13.99, cycle: 'month', active: true },
      { name: 'HBO Max', amount: 9.99, cycle: 'month', active: true },
      { name: 'Disney+', amount: 99.9, cycle: 'year', active: true },
      { name: 'Spotify', amount: 11.99, cycle: 'month', active: true },
    ],
    flow: { income: 1800, saved: 90 },
  })
  const kinds = tips.map((t) => t.kind)
  const get = (id: string) => tips.find((t) => t.id.startsWith(id))!

  it('vas camino de pasarte del límite: cuánto al día para no pasarte', () => {
    const t = get('pace-ocio')
    expect(t.title).toBe('Vas camino de pasarte en ocio')
    expect(t.body).toBe('Llevas 180 € de 200 € y quedan 16 días. Si el resto del mes va como siempre, acabarías en 242 €; para no pasarte, como mucho 1,25 € al día.')
  })
  it('lo que sube y por qué', () => {
    const t = get('rising-comer')
    expect(t.body).toContain('Llevas 157 € este mes y lo normal son 70 €')
    expect(t.body).toContain('Glovo (7 veces, 126 €)')
    // Sin límite: el consejo propone poner uno
    expect(t.action).toEqual({ kind: 'limit', category: 'comer', amount: 70 })
  })
  it('lo que compras muchas veces, con un reto «Días sin…»', () => {
    const t = get('frequent-glovo')
    expect(t.title).toBe('Glovo: 8 veces en un mes')
    expect(t.saving).toBe(78)
    expect(t.action).toEqual({ kind: 'challenge', name: 'Sin glovo', costPerDay: 5.2 })
    // La compra de casa no es un «capricho repetido»
    expect(tips.some((x) => x.id === 'frequent-mercadona')).toBe(false)
  })
  it('los pequeños gastos, las suscripciones que se solapan y lo que ahorras', () => {
    // El café ya sale como compra repetida: no se cuenta otra vez como «pequeños gastos»
    expect(tips.some((t) => t.kind === 'small')).toBe(false)
    expect(get('overlap-video').title).toBe('3 suscripciones de vídeo')
    expect(get('overlap-video').body).toContain('Netflix, HBO Max, Disney+: 32 € al mes')
    expect(kinds).not.toContain('overlap-music')
    expect(get('savings').title).toBe('Ahorras el 5 % de lo que entra')
    expect(get('savings').body).toContain('unos 270 € más al mes')
  })
  it('lo urgente primero, y un total de lo que se podría ahorrar', () => {
    expect(kinds[0]).toBe('pace')
    expect(totalSaving(tips)).toBeGreaterThan(100)
  })
  it('los pequeños gastos variados que suman', () => {
    const list = Array.from({ length: 15 }, (_, i) => e(`2026-10-${String(i + 1).padStart(2, '0')}`, 3.5, i % 2 ? 'comer' : 'ocio', ['Café', 'Chicles', 'Revista', 'Helado'][i % 4]))
    const small = spendingAdvice({ expenses: list, today: TODAY }).find((t) => t.kind === 'small')!
    expect(small.body).toBe('15 compras de menos de 6 € en 30 días: 53 € (unos 630 € al año). Lo que más: Café (4 veces), Chicles (4 veces), Revista (4 veces).')
  })
  it('una compra grande suelta a principio de mes no es «vas camino de pasarte»', () => {
    const list = [...history().filter((x) => x.category !== 'ocio' || !x.date.startsWith('2026-10')), e('2026-10-03', 120, 'ocio', 'Fiesta')]
    expect(spendingAdvice({ expenses: list, today: '2026-10-08', budget: { categories: { ocio: 200 } } }).some((t) => t.kind === 'pace')).toBe(false)
  })
  it('sin historial no inventa nada', () => {
    expect(spendingAdvice({ expenses: [e(TODAY, 10, 'comer', 'Bar')], today: TODAY })).toEqual([])
  })
})

describe('análisis de una categoría y la semana', () => {
  it('meses, lo normal, conceptos, ticket medio y días', () => {
    const r = categoryReport(history(), 'comer', TODAY)
    expect(r.months.map((m) => m.total)).toEqual([0, 0, 70, 70, 70, 156.8])
    expect(r.normal).toBe(70)
    expect(r.notes[0]).toMatchObject({ note: 'Glovo', count: 9 })
    expect(r.days.map((d) => d.day)).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])
  })
  it('la semana frente a una normal', () => {
    const w = weekReview(history(), '2026-10-11')
    expect(w.start).toBe('2026-10-05')
    expect(w.top).toMatchObject({ category: 'super' })
    expect(weekMessage(w).body).toMatch(/^\d+ € esta semana, más que una semana normal/)
  })
})

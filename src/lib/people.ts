import type { Person } from '@/db/types'
import { diffDays, fromYmd, ymd } from './dates'

/** Personas con las que "toca" hablar según su frecuencia deseada */
export function dueForContact(people: Person[], ref: string) {
  return people
    .filter((p) => p.contactEvery && p.contactEvery > 0)
    .map((p) => ({ person: p, days: p.lastContact ? diffDays(ref, p.lastContact) : Infinity }))
    .filter(({ person, days }) => days >= person.contactEvery!)
    .sort((a, b) => b.days - b.person.contactEvery! - (a.days - a.person.contactEvery!))
}

/** Próximo cumpleaños (YYYY-MM-DD) a partir de `ref`, y edad que cumple si se conoce el año */
export function nextBirthday(birthday: string, ref: string): { date: string; age?: number } | undefined {
  const m = birthday.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const [, y, mm, dd] = m
  const r = fromYmd(ref)
  let d = new Date(r.getFullYear(), Number(mm) - 1, Number(dd))
  if (ymd(d) < ref) d = new Date(r.getFullYear() + 1, Number(mm) - 1, Number(dd))
  return { date: ymd(d), age: y ? d.getFullYear() - Number(y) : undefined }
}

export function upcomingBirthdays(people: Person[], ref: string, withinDays: number) {
  return people
    .flatMap((person) => {
      if (!person.birthday) return []
      const nb = nextBirthday(person.birthday, ref)
      if (!nb || diffDays(nb.date, ref) > withinDays) return []
      return [{ person, ...nb }]
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Fechas importantes que vuelven cada año (aniversarios, santos…), como en
 * Monica o Clay: las de los próximos `withinDays` días, con los años que se
 * cumplen si se sabe el año.
 */
export function upcomingDates(people: Person[], ref: string, withinDays: number) {
  return people
    .flatMap((person) =>
      (person.dates ?? []).flatMap((d) => {
        const next = nextBirthday(d.date, ref)
        if (!next || diffDays(next.date, ref) > withinDays) return []
        return [{ person, label: d.label, date: next.date, years: next.age }]
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Ideas de regalo aún sin regalar */
export const pendingGifts = (p: Pick<Person, 'gifts'>) => (p.gifts ?? []).filter((g) => !g.given)

import { useState } from 'react'
import { CalendarHeart, Check, Gift, Plus, X } from 'lucide-react'
import type { Person } from '@/db/types'
import { db } from '@/db/db'
import { uid } from '@/lib/id'
import { dateLabel, fmt, relativeDays, today } from '@/lib/dates'
import { nextBirthday } from '@/lib/people'
import { toast } from '@/app/store'
import { Button, Card, Section, cx } from '@/components/ui'
import { Input } from '@/components/form'

/**
 * Fechas importantes que vuelven cada año (aniversario, santo…), como en
 * Monica o Clay: salen en Hoy unos días antes, igual que los cumpleaños.
 */
export function PersonDates({ person }: { person: Person }) {
  const t = today()
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const dates = person.dates ?? []
  const save = (next: Person['dates']) => void db.people.update(person.id, { dates: next?.length ? next : undefined })
  const add = () => {
    if (!label.trim() || !date) return
    save([...dates, { id: uid(), label: label.trim(), date }])
    setLabel('')
    setDate('')
  }
  return (
    <Section title="Fechas importantes" count={dates.length || undefined}>
      <Card className="space-y-2 p-3">
        {dates.map((d) => {
          const next = nextBirthday(d.date, t)
          return (
            <div key={d.id} className="flex items-center gap-3 rounded-xl px-1.5 py-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
                <CalendarHeart size={15} strokeWidth={2.3} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{d.label}</span>
                {next && (
                  <span className="block text-[13px] text-muted">
                    {dateLabel(next.date, t)} ({relativeDays(next.date, t)}){next.age ? ` · ${next.age} ${next.age === 1 ? 'año' : 'años'}` : ''}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Quitar ${d.label}`}
                onClick={() => {
                  save(dates.filter((x) => x.id !== d.id))
                  toast(`${d.label}, quitada`, { label: 'Deshacer', run: () => save(dates) })
                }}
                className="hit flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Aniversario, su santo…" aria-label="Qué se celebra" className="h-10 min-w-40 flex-1" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" className="h-10 w-auto" />
          <Button type="submit" size="sm" disabled={!label.trim() || !date} aria-label="Añadir la fecha">
            <Plus size={15} strokeWidth={2.6} />
          </Button>
        </form>
      </Card>
    </Section>
  )
}

/** Ideas de regalo (como en Monica): se apuntan cuando surgen y se marcan al regalarlas */
export function PersonGifts({ person }: { person: Person }) {
  const t = today()
  const [text, setText] = useState('')
  const gifts = person.gifts ?? []
  const pending = gifts.filter((g) => !g.given)
  const given = gifts.filter((g) => g.given).sort((a, b) => b.given!.localeCompare(a.given!))
  const save = (next: Person['gifts']) => void db.people.update(person.id, { gifts: next?.length ? next : undefined })
  const toggle = (id: string) => save(gifts.map((g) => (g.id === id ? { ...g, given: g.given ? undefined : t } : g)))
  return (
    <Section title="Ideas de regalo" count={pending.length || undefined}>
      <Card className="space-y-1 p-3">
        {[...pending, ...given].map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-xl px-1.5 py-1">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!g.given}
              aria-label={g.given ? `${g.text}: regalado` : `Marcar «${g.text}» como regalado`}
              onClick={() => toggle(g.id)}
              className={cx('hit flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.6px]', g.given ? 'border-green bg-green text-on-green' : 'border-faint')}
            >
              {g.given && <Check size={13} strokeWidth={3.2} />}
            </button>
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-[15px]', g.given && 'text-muted line-through')}>{g.text}</span>
              {g.given && <span className="block text-[12.5px] text-muted">Regalado el {fmt(g.given, "d 'de' MMMM yyyy")}</span>}
            </span>
            <button
              type="button"
              aria-label={`Quitar ${g.text}`}
              onClick={() => save(gifts.filter((x) => x.id !== g.id))}
              className="hit flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            save([...gifts, { id: uid(), text: text.trim() }])
            setText('')
          }}
        >
          <Gift size={16} className="ml-1.5 shrink-0 text-muted" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Una idea: «la novela que mencionó»" aria-label="Nueva idea de regalo" className="h-10 flex-1" />
          <Button type="submit" size="sm" disabled={!text.trim()} aria-label="Añadir la idea">
            <Plus size={15} strokeWidth={2.6} />
          </Button>
        </form>
      </Card>
    </Section>
  )
}

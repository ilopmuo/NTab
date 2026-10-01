import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import type { JournalEntry } from '@/db/types'
import { fmt } from '@/lib/dates'
import { isScheduled } from '@/lib/habits'
import { hasContent, moodBoosters, moodLabel, onThisDay } from '@/lib/journal'
import { Icon } from '@/components/icons'
import { Card, Group, Section, cx } from '@/components/ui'
import { useHabits } from '../habits/useHabits'
import { useFeatures } from '@/app/features'
import { MoodIcon, moodColor } from './MoodPicker'

/** «Tal día como hoy» (como en Day One): hace un mes y otros años */
export function OnThisDay({ byDate, date, onPick }: { byDate: Map<string, JournalEntry>; date: string; onPick: (d: string) => void }) {
  const items = onThisDay(byDate, date)
  if (!items.length) return null
  return (
    <Section title="Tal día como hoy">
      <Group>
        {items.map(({ label, date: d, entry }) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: entry.mood ? moodColor(entry.mood) : 'var(--c-fill)', color: entry.mood === 5 ? 'var(--c-on-green)' : entry.mood === 4 ? '#fff' : entry.mood ? 'var(--c-bg)' : 'var(--c-muted)' }}
            >
              {entry.mood ? <MoodIcon mood={entry.mood} size={17} /> : <Sparkles size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">
                {label} <span className="font-normal text-muted">· {fmt(d, "d 'de' MMMM yyyy")}</span>
              </span>
              <span className="block truncate text-[13px] text-muted">{entry.text.trim() || entry.good.filter(Boolean).join(' · ') || moodLabel(entry.mood)}</span>
            </span>
          </button>
        ))}
      </Group>
    </Section>
  )
}

const MONTHS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** «Año en píxeles» (como en Daylio): cada día del año, del color de tu ánimo */
export function YearPixels({ byDate, year, today, onYear, onPick }: { byDate: Map<string, JournalEntry>; year: number; today: string; onYear: (y: number) => void; onPick: (d: string) => void }) {
  const firstYear = useMemo(() => Math.min(Number(today.slice(0, 4)), ...[...byDate.keys()].map((d) => Number(d.slice(0, 4)))), [byDate, today])
  const thisYear = Number(today.slice(0, 4))
  const counts = [1, 2, 3, 4, 5].map((m) => [...byDate.values()].filter((e) => e.id.startsWith(String(year)) && e.mood === m).length)
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" aria-label="Año anterior" disabled={year <= firstYear} onClick={() => onYear(year - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-fill active:scale-90 disabled:opacity-30">
          <ChevronLeft size={16} />
        </button>
        <p className="font-num flex-1 text-center text-[15px] font-bold">{year}</p>
        <button type="button" aria-label="Año siguiente" disabled={year >= thisYear} onClick={() => onYear(year + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-fill active:scale-90 disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <div role="group" aria-label={`Ánimo de cada día de ${year}`} className="mx-auto grid w-max grid-cols-[18px_repeat(12,14px)] gap-[3px]">
          <span />
          {MONTHS.map((m, i) => (
            <span key={i} aria-hidden className="text-center text-[11px] font-semibold text-muted">
              {m}
            </span>
          ))}
          {Array.from({ length: 31 }, (_, r) => (
            <Row key={r} day={r + 1} year={year} byDate={byDate} today={today} onPick={onPick} />
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-muted">
        {counts.some(Boolean) ? counts.map((n, i) => (n ? `${n} ${moodLabel(i + 1)?.toLowerCase()}` : '')).filter(Boolean).join(' · ') : 'Aún no hay días con ánimo este año'}
      </p>
    </Card>
  )
}

function Row({ day, year, byDate, today, onPick }: { day: number; year: number; byDate: Map<string, JournalEntry>; today: string; onPick: (d: string) => void }) {
  return (
    <>
      <span aria-hidden className="font-num pr-1 text-right text-[10px] leading-[14px] text-muted">
        {day % 5 === 0 || day === 1 ? day : ''}
      </span>
      {MONTHS.map((_, m) => {
        const exists = day <= new Date(year, m + 1, 0).getDate()
        const d = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        if (!exists) return <span key={m} aria-hidden />
        const e = byDate.get(d)
        const future = d > today
        if (!e || !hasContent(e))
          return <span key={m} aria-hidden className={cx('h-[14px] w-[14px] rounded-[3px]', future ? 'bg-fill-2' : 'bg-fill')} />
        return (
          <button
            key={m}
            type="button"
            onClick={() => onPick(d)}
            aria-label={`${fmt(d, "d 'de' MMMM")}${e.mood ? `: ${moodLabel(e.mood)}` : ''}`}
            title={`${fmt(d, "d 'de' MMMM")}${e.mood ? ` · ${moodLabel(e.mood)}` : ''}`}
            className={cx('h-[14px] w-[14px] rounded-[3px] transition-transform hover:scale-125', d === today && 'ring-[1.5px] ring-blue')}
            style={{ background: e.mood ? moodColor(e.mood) : 'var(--c-faint)', opacity: e.mood && e.mood <= 3 ? 0.35 + e.mood * 0.15 : 1 }}
          />
        )
      })}
    </>
  )
}

/** «Lo que te sienta bien» (como las estadísticas de Daylio): ánimo con y sin cada hábito */
export function MoodBoosters({ byDate, today }: { byDate: Map<string, JournalEntry>; today: string }) {
  const { habits, byHabit } = useHabits(95)
  const habitsOn = useFeatures().on('habits')
  const list = useMemo(
    () =>
      habits
        ? moodBoosters(
            byDate,
            habits.map((h) => ({ id: h.id, done: byHabit.get(h.id) ?? new Set<string>(), scheduled: (d: string) => isScheduled(h, d) })),
            today,
          )
        : [],
    [habits, byHabit, byDate, today],
  )
  if (!habitsOn || !habits || !list.length) return null
  return (
    <Section title="Lo que te sienta bien">
      <Group>
        {list.slice(0, 4).map((b) => {
          const h = habits.find((x) => x.id === b.id)!
          return (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
                <Icon name={h.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{h.name}</span>
                <span className="block text-[13px] text-muted">
                  Los días que lo haces, tu ánimo es <strong className="font-semibold text-fg">{String(b.withIt).replace('.', ',')}</strong> (y{' '}
                  {String(b.without).replace('.', ',')} cuando no)
                </span>
              </span>
            </div>
          )
        })}
      </Group>
      <p className="mt-2 px-1 text-[12px] text-muted">Con tus últimos 90 días: ánimo del 1 (muy mal) al 5 (muy bien).</p>
    </Section>
  )
}

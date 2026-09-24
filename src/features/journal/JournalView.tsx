import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { Bell, BookOpen, Check, ChevronLeft, ChevronRight, Flame, Minus, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { db } from '@/db/db'
import type { JournalEntry } from '@/db/types'
import { saveJournal, setSetting } from '@/db/actions'
import { addDaysYmd, dateLabel, fmt, fromYmd, today, weekStart } from '@/lib/dates'
import { averageMood, hasContent, journalStreak, moodLabel, moodTrend } from '@/lib/journal'
import { navigate } from '@/app/router'
import { SectionIcon, section } from '@/app/sections'
import { Card, Group, PageHeader, Section, Switch, Textarea, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { MoodIcon, MoodPicker, moodColor } from './MoodPicker'

const WEEKS = 20

/** Diario: cómo ha ido cada día, en un minuto */
export function JournalView({ date: routeDate }: { date?: string }) {
  const t = today()
  const date = routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate) && routeDate <= t ? routeDate : t
  const entries = useLiveQuery(() => db.journal.toArray(), [])
  const reminder = useLiveQuery(() => db.settings.get('journalReminder').then((r) => (r?.value as { enabled: boolean; time: string } | undefined) ?? null), [])
  const byDate = useMemo(() => new Map((entries ?? []).map((e) => [e.id, e])), [entries])
  if (!entries || reminder === undefined) return null

  const entry = byDate.get(date)
  const streak = journalStreak(byDate, t)
  const avg = averageMood(byDate, t, 30)
  const trend = moodTrend(byDate, t)
  const past = entries.filter((e) => e.id !== date && hasContent(e)).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 8)
  const go = (d: string) => navigate(d === t ? '/journal' : `/journal/${d}`)

  return (
    <Page>
      <PageHeader icon={<SectionIcon def={section('journal')} size={40} />} title="Diario" subtitle="Cómo te ha ido el día, en un minuto. Lo que hiciste se apunta solo." />

      <div className="mb-4 flex items-center gap-2">
        <button type="button" aria-label="Día anterior" onClick={() => go(addDaysYmd(date, -1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[17px] font-bold">{date === t ? 'Hoy' : dateLabel(date, t)}</p>
          <p className="text-[13px] text-muted">{fmt(date, "EEEE d 'de' MMMM")}</p>
        </div>
        <button type="button" aria-label="Día siguiente" disabled={date >= t} onClick={() => go(addDaysYmd(date, 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90 disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={date} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={softSpring}>
          <Entry date={date} entry={entry} />
          <DayDone date={date} />
        </motion.div>
      </AnimatePresence>

      <div className="mb-8 grid grid-cols-3 gap-3">
        <Stat icon={<Flame size={16} strokeWidth={2.4} />} value={String(streak)} label={streak === 1 ? 'día seguido' : 'días seguidos'} />
        <Stat icon={avg ? <MoodIcon mood={Math.round(avg)} size={16} /> : <Minus size={16} />} value={avg ? String(avg).replace('.', ',') : '–'} label="ánimo medio (30 días)" />
        <Stat
          icon={trend === 'up' ? <TrendingUp size={16} /> : trend === 'down' ? <TrendingDown size={16} /> : <Minus size={16} />}
          value={trend === 'up' ? 'Mejor' : trend === 'down' ? 'Peor' : trend === 'flat' ? 'Igual' : '–'}
          label="esta semana"
        />
      </div>

      <Section title="Tu ánimo">
        <MoodMap byDate={byDate} today={t} onPick={go} />
      </Section>

      {past.length > 0 && (
        <Section title="Días anteriores">
          <Group>
            {past.map((e) => (
              <button key={e.id} type="button" onClick={() => go(e.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: e.mood ? moodColor(e.mood) : 'var(--c-fill)', color: e.mood === 5 ? 'var(--c-on-green)' : e.mood === 4 ? '#fff' : e.mood ? 'var(--c-bg)' : 'var(--c-muted)' }}>
                  {e.mood ? <MoodIcon mood={e.mood} size={17} /> : <BookOpen size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">
                    {fmt(e.id, "EEEE d 'de' MMMM")}
                    {e.mood ? <span className="font-normal text-muted"> · {moodLabel(e.mood)}</span> : null}
                  </span>
                  <span className="block truncate text-[13px] text-muted">{e.text.trim() || e.good.filter(Boolean).join(' · ') || 'Sin texto'}</span>
                </span>
              </button>
            ))}
          </Group>
        </Section>
      )}

      <Group className="mb-8">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill">
            <Bell size={15} />
          </span>
          <span className="flex-1 text-[15px]">{reminder?.enabled ? 'Recordármelo cada noche a las' : 'Recordármelo cada noche'}</span>
          {reminder?.enabled && (
            <input
              type="time"
              aria-label="Hora del recordatorio"
              value={reminder.time}
              onChange={(e) => e.target.value && void setSetting('journalReminder', { enabled: true, time: e.target.value })}
              className="font-num h-8 rounded-lg bg-fill px-2 text-[14px] font-semibold"
            />
          )}
          <Switch label="Recordatorio del diario" checked={!!reminder?.enabled} onChange={(v) => void setSetting('journalReminder', { enabled: v, time: reminder?.time ?? '21:30' })} />
        </div>
      </Group>
    </Page>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <Card className="p-3.5">
      <span className="text-muted">{icon}</span>
      <p className="font-num mt-1.5 text-[22px] leading-none font-bold">{value}</p>
      <p className="mt-1 text-[12px] leading-tight text-muted">{label}</p>
    </Card>
  )
}

/** Ánimo, texto y tres cosas buenas; se guarda solo */
function Entry({ date, entry }: { date: string; entry?: JournalEntry }) {
  const [text, setText] = useState(entry?.text ?? '')
  const [good, setGood] = useState<string[]>(() => [0, 1, 2].map((i) => entry?.good[i] ?? ''))
  const first = useRef(true)
  // Guardar al dejar de escribir
  useEffect(() => {
    if (first.current) return void (first.current = false)
    const tm = setTimeout(() => void saveJournal(date, { text, good: good.map((g) => g.trim()).filter(Boolean) }), 400)
    return () => clearTimeout(tm)
  }, [text, good, date])

  return (
    <Card className="mb-4 p-4">
      <p className="mb-3 text-[15px] font-bold">¿Qué tal el día?</p>
      <MoodPicker value={entry?.mood} onChange={(m) => void saveJournal(date, { mood: entry?.mood === m ? undefined : m })} />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Qué ha pasado, cómo te has sentido, algo que no quieras olvidar…"
        className="mt-4 min-h-[96px] rounded-xl bg-fill-2 px-3.5 py-3 text-[15px] leading-relaxed"
      />
      <p className="mt-4 mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Tres cosas buenas</p>
      <div className="space-y-1.5">
        {good.map((g, i) => (
          <label key={i} className="flex h-10 items-center gap-2.5 rounded-xl bg-fill-2 px-3">
            <span className="font-num text-[13px] font-bold text-faint">{i + 1}</span>
            <input
              value={g}
              onChange={(e) => setGood(good.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={['Algo que ha salido bien', 'Alguien que te ha ayudado', 'Un momento que has disfrutado'][i]}
              aria-label={`Cosa buena ${i + 1}`}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            />
          </label>
        ))}
      </div>
    </Card>
  )
}

/** Lo que se hizo ese día, sin tener que escribirlo */
function DayDone({ date }: { date: string }) {
  const from = fromYmd(date).getTime()
  const to = from + 864e5
  const tasks = useLiveQuery(() => db.tasks.where('completedAt').between(from, to).filter((x) => !!x.done).toArray(), [from]) ?? []
  const habits = useLiveQuery(async () => {
    const logs = await db.habitLogs.where('date').equals(date).toArray()
    const all = await db.habits.bulkGet(logs.map((l) => l.habitId))
    return all.filter((h) => !!h).map((h) => h!.name)
  }, [date]) ?? []
  const focus = useLiveQuery(() => db.focusLogs.where('date').equals(date).toArray(), [date]) ?? []
  const routines = useLiveQuery(async () => {
    const runs = (await db.routineRuns.where('date').equals(date).toArray()).filter((r) => r.completedAt)
    return (await db.routines.bulkGet(runs.map((r) => r.routineId))).filter((r) => !!r).map((r) => r!.name)
  }, [date]) ?? []
  const minutes = focus.reduce((s, f) => s + (f.minutes ?? 0), 0)
  const items = [...tasks.map((x) => x.title), ...routines.map((r) => `Rutina: ${r}`), ...habits.map((h) => `Hábito: ${h}`)]
  if (!items.length && !minutes) return null
  return (
    <Card className="mb-6 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[15px] font-bold">Lo que hiciste</p>
        {minutes > 0 && (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-muted">
            <Timer size={13} /> {minutes} min de foco
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {items.slice(0, 12).map((x, i) => (
          <li key={i} className="flex items-center gap-2 text-[14px]">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-green text-on-green">
              <Check size={11} strokeWidth={3.2} />
            </span>
            <span className="truncate">{x}</span>
          </li>
        ))}
        {items.length > 12 && <li className="pl-7 text-[13px] text-muted">…y {items.length - 12} más</li>}
      </ul>
    </Card>
  )
}

/** Mapa de las últimas semanas coloreado por ánimo */
function MoodMap({ byDate, today, onPick }: { byDate: Map<string, JournalEntry>; today: string; onPick: (d: string) => void }) {
  const start = addDaysYmd(weekStart(today), -(WEEKS - 1) * 7)
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysYmd(start, w * 7 + d)))
  return (
    <Card className="overflow-x-auto p-4">
      <div className="flex min-w-max gap-[4px]">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-[4px]">
            {week.map((d) => {
              const e = byDate.get(d)
              const future = d > today
              return (
                <button
                  key={d}
                  type="button"
                  disabled={future}
                  title={`${fmt(d, 'd MMM')}${e?.mood ? ` · ${moodLabel(e.mood)}` : ''}`}
                  onClick={() => onPick(d)}
                  className={cx('h-[14px] w-[14px] rounded-[4px] transition-transform hover:scale-125', d === today && 'ring-[1.5px] ring-blue ring-offset-1 ring-offset-transparent')}
                  style={{
                    background: future ? 'transparent' : e?.mood ? moodColor(e.mood) : hasContent(e) ? 'var(--c-faint)' : 'var(--c-fill)',
                    opacity: e?.mood && e.mood <= 3 ? 0.35 + e.mood * 0.15 : 1,
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--c-text)', opacity: 0.5 }} /> Mal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-blue" /> Bien
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-green" /> Muy bien
        </span>
      </div>
    </Card>
  )
}

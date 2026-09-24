import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { Cake, ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { addDaysYmd, capitalize, fmt, fromYmd, longDateLabel, today, weekStart, ymd } from '@/lib/dates'
import { upcomingBirthdays } from '@/lib/people'
import { sortTasks } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { ui } from '@/app/store'
import { TaskList } from '@/components/TaskList'
import { Button, Card, IconButton, PageHeader, Segmented, cx, spring } from '@/components/ui'
import { dragToDay, useDropOver } from '@/components/dayDrag'
import { eventTime, eventsByDay, useEvents, type CalEvent } from '@/lib/calendarEvents'
import type { Person } from '@/db/types'
import { Page } from '../Page'

type Mode = 'month' | 'week'
const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarView() {
  const t = today()
  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 640 ? 'week' : 'month'))
  const [cursor, setCursor] = useState(t)
  const [selected, setSelected] = useState(t)
  const [dir, setDir] = useState(0)

  const range = useMemo(() => {
    if (mode === 'week') {
      const s = weekStart(cursor)
      return { start: s, days: Array.from({ length: 7 }, (_, i) => addDaysYmd(s, i)) }
    }
    const first = ymd(startOfMonth(fromYmd(cursor)))
    const s = weekStart(first)
    const last = ymd(endOfMonth(fromYmd(cursor)))
    const days: string[] = []
    for (let d = s; d <= last || days.length % 7 !== 0; d = addDaysYmd(d, 1)) days.push(d)
    return { start: s, days }
  }, [mode, cursor])

  const end = range.days[range.days.length - 1]
  const tasks = useLiveQuery(() => db.tasks.where('dueDate').between(range.start, end, true, true).toArray(), [range.start, end]) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const cal = useEvents(range.start, end)
  const evByDay = useMemo(() => eventsByDay(cal.events), [cal.events])
  const birthdays = useMemo(() => upcomingBirthdays(people, range.start, 45), [people, range.start])

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const x of tasks) m.set(x.dueDate!, [...(m.get(x.dueDate!) ?? []), x])
    for (const list of m.values()) list.sort(sortTasks)
    return m
  }, [tasks])

  const move = (d: number) => {
    setDir(d)
    setCursor(mode === 'week' ? addDaysYmd(cursor, d * 7) : ymd(addMonths(fromYmd(cursor), d)))
  }
  const title = mode === 'month' ? capitalize(fmt(cursor, 'MMMM')) : `Semana del ${fmt(range.start, 'd')}`
  const month = cursor.slice(0, 7)
  const selectedTasks = byDay.get(selected) ?? []
  const selectedBirthdays = birthdays.filter((b) => b.date === selected)

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('calendar')} size={40} />}
        title={
          <>
            {title} <span className="font-num text-muted">{fmt(cursor, 'yyyy')}</span>
          </>
        }
        actions={
          <>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'month', label: 'Mes' },
                { value: 'week', label: 'Semana' },
              ]}
            />
            <Button
              size="sm"
              variant="tinted"
              className="ml-1"
              onClick={() => {
                setCursor(t)
                setSelected(t)
              }}
            >
              Hoy
            </Button>
            <IconButton label="Anterior" filled onClick={() => move(-1)}>
              <ChevronLeft size={18} strokeWidth={2.4} />
            </IconButton>
            <IconButton label="Siguiente" filled onClick={() => move(1)}>
              <ChevronRight size={18} strokeWidth={2.4} />
            </IconButton>
          </>
        }
      />

      {mode === 'month' ? (
        <div className="grid gap-6 @[1100px]:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-hidden p-2">
            <div className="grid grid-cols-7 pb-1">
              {HEAD.map((h, i) => (
                <div key={h} className={cx('py-2 text-center text-[12px] font-semibold', i >= 5 ? 'text-faint' : 'text-muted')}>
                  {h}
                </div>
              ))}
            </div>
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={cursor.slice(0, 7) + mode}
                custom={dir}
                initial={{ opacity: 0, x: dir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -40 }}
                transition={spring}
                className="grid grid-cols-7 gap-1"
              >
                {range.days.map((d) => (
                  <MonthCell
                    key={d}
                    day={d}
                    list={byDay.get(d) ?? []}
                    events={evByDay.get(d) ?? []}
                    inMonth={d.slice(0, 7) === month}
                    birthday={birthdays.some((b) => b.date === d)}
                    selected={selected === d}
                    isToday={d === t}
                    onSelect={() => setSelected(d)}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          </Card>

          <div>
            <h2 className="px-1 text-[20px] font-bold tracking-tight">{longDateLabel(selected)}</h2>
            <p className="mb-3 px-1 text-[13px] text-muted">
              {selectedTasks.length ? `${selectedTasks.length} ${selectedTasks.length === 1 ? 'tarea' : 'tareas'}` : 'Sin tareas'} · doble clic en un día para añadir
            </p>
            {selectedBirthdays.map((b) => (
              <a key={b.person.id} href={`#/people/${b.person.id}`} className="glass mb-3 flex items-center gap-3 rounded-[16px] px-4 py-3 text-[15px]">
                <Cake size={18} className="text-pink" strokeWidth={2.3} /> Cumpleaños de <b className="font-semibold">{b.person.name}</b>
                {b.age ? <span className="text-muted">({b.age})</span> : null}
              </a>
            ))}
            {(evByDay.get(selected) ?? []).length > 0 && (
              <div className="glass mb-3 overflow-hidden rounded-[16px]">
                {(evByDay.get(selected) ?? []).map((e) => (
                  <EventRow key={e.id} event={e} source={cal.names[e.sourceId]} />
                ))}
              </div>
            )}
            <TaskList key={selected} tasks={selectedTasks} hideDate add={{ defaults: { dueDate: selected } }} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 @[560px]:grid-cols-2 @[820px]:grid-cols-4 @[1180px]:grid-cols-7">
          {range.days.map((d, i) => (
            <WeekDay key={d} day={d} index={i} list={byDay.get(d) ?? []} events={evByDay.get(d) ?? []} birthdays={birthdays.filter((b) => b.date === d).map((b) => b.person)} isToday={d === t} />
          ))}
        </div>
      )}
    </Page>
  )
}

const chipColor = 'var(--c-muted)'

function EventRow({ event, source }: { event: CalEvent; source?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
      <span className="font-num w-11 shrink-0 text-[13px] font-semibold text-muted">{event.allDay ? 'Todo' : eventTime(event)}</span>
      <span className="h-7 w-[3px] shrink-0 rounded-full bg-line-strong" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{event.title}</span>
        <span className="block truncate text-[12px] text-faint">{[source, event.location].filter(Boolean).join(' · ')}</span>
      </span>
    </div>
  )
}

function MonthCell({
  day,
  list,
  events,
  inMonth,
  birthday,
  selected,
  isToday,
  onSelect,
}: {
  day: string
  list: Task[]
  events: CalEvent[]
  inMonth: boolean
  birthday: boolean
  selected: boolean
  isToday: boolean
  onSelect: () => void
}) {
  const over = useDropOver(day)
  // Caben 3 fichas: hasta 2 eventos y el resto tareas
  const maxTasks = events.length ? 2 : 3
  const hidden = Math.max(0, list.length - maxTasks) + Math.max(0, events.length - 2)
  return (
    <button
      type="button"
      data-drop-day={day}
      onClick={onSelect}
      onDoubleClick={() => ui.quickAdd({ dueDate: day })}
      className={cx(
        'relative flex min-h-[62px] flex-col items-stretch gap-1 rounded-[12px] p-1.5 text-left transition-colors sm:min-h-[104px]',
        over ? 'bg-accent-soft ring-2 ring-blue' : selected ? 'bg-fill' : 'hover:bg-hover',
        !inMonth && !over && 'opacity-35',
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cx(
            'font-num flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[14px] font-semibold',
            isToday ? 'bg-blue text-white' : selected ? 'text-fg' : '',
          )}
        >
          {fromYmd(day).getDate()}
        </span>
        {birthday && <Cake size={13} className="text-pink" strokeWidth={2.4} />}
      </span>
      <span className="hidden flex-col gap-[3px] sm:flex">
        {events.slice(0, 2).map((e) => (
          <span key={e.id} className="flex items-center gap-1 truncate rounded-[5px] border border-line-strong px-1.5 text-[11.5px] leading-[17px] font-medium text-muted">
            {!e.allDay && <span className="font-num opacity-80">{eventTime(e)}</span>}
            <span className="truncate">{e.title}</span>
          </span>
        ))}
        {list.slice(0, maxTasks).map((x) => (
          <span
            key={x.id}
            {...dragToDay(x)}
            title="Arrastra a otro día"
            className={cx('flex cursor-grab items-center gap-1 truncate rounded-[5px] px-1.5 text-[11.5px] leading-[19px] font-medium select-none active:cursor-grabbing', x.done && 'line-through opacity-45')}
            style={{ background: `color-mix(in srgb, ${chipColor} 20%, transparent)`, color: `color-mix(in srgb, ${chipColor} 70%, var(--c-text))`, WebkitTouchCallout: 'none' }}
          >
            {x.dueTime && <span className="font-num opacity-80">{x.dueTime}</span>}
            <span className="truncate">{x.title}</span>
          </span>
        ))}
        {hidden > 0 && <span className="px-1 text-[11px] font-semibold text-muted">+{hidden} más</span>}
      </span>
      {list.length + events.length > 0 && (
        <span className="flex justify-center gap-0.5 sm:hidden">
          {events.slice(0, 2).map((e) => (
            <span key={e.id} className="h-1.5 w-1.5 rounded-full border border-muted" />
          ))}
          {list.slice(0, 3).map((x) => (
            <span key={x.id} className="h-1.5 w-1.5 rounded-full" style={{ background: chipColor }} />
          ))}
        </span>
      )}
    </button>
  )
}

function WeekDay({ day, index, list, events, birthdays, isToday }: { day: string; index: number; list: Task[]; events: CalEvent[]; birthdays: Person[]; isToday: boolean }) {
  const over = useDropOver(day)
  return (
    <motion.div
      data-drop-day={day}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.03 }}
      className={cx('glass flex min-h-44 flex-col rounded-[18px] p-2 transition-shadow', over ? 'ring-2 ring-blue' : isToday && 'ring-2 ring-blue/60')}
    >
      <div className="mb-1 flex items-baseline gap-1.5 px-1.5 pt-1">
        <span className={cx('font-num text-[22px] font-bold', isToday && 'text-blue')}>{fromYmd(day).getDate()}</span>
        <span className="text-[13px] font-semibold text-muted">{capitalize(fmt(day, 'EEEE'))}</span>
      </div>
      {birthdays.map((p) => (
        <p key={p.id} className="flex items-center gap-1.5 px-1.5 py-1 text-[12px] font-semibold text-pink">
          <Cake size={12} /> {p.name}
        </p>
      ))}
      {events.map((e) => (
        <p key={e.id} className="mx-1.5 mb-1 truncate rounded-[8px] border border-line-strong px-2 py-1 text-[12.5px] text-muted">
          {!e.allDay && <span className="font-num mr-1 font-semibold">{eventTime(e)}</span>}
          {e.title}
        </p>
      ))}
      <div className="flex-1">
        <TaskList tasks={list} hideDate hideProject bare compact draggable />
      </div>
      <button type="button" onClick={() => ui.quickAdd({ dueDate: day })} className="mt-1 rounded-[10px] py-1.5 text-[13px] font-semibold text-blue transition-colors hover:bg-hover">
        + Añadir
      </button>
    </motion.div>
  )
}

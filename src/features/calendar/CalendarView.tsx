import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, m as motion } from 'motion/react'
import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { Cake, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { addDaysYmd, capitalize, fmt, fromYmd, longDateLabel, today, weekStart, ymd } from '@/lib/dates'
import { upcomingBirthdays } from '@/lib/people'
import { sortTasks } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { ui } from '@/app/store'
import { TaskList } from '@/components/TaskList'
import { useOpenTasks } from '@/db/hooks'
import { SelectButton } from '@/features/select/SelectButton'
import { UpcomingList, scheduledFrom } from '../Upcoming'
import { Progressive } from '@/components/Progressive'
import { Button, Card, IconButton, PageHeader, Section, cx, spring, useIsMobile, useMediaQuery } from '@/components/ui'
import { Segmented } from '@/components/form'
import { dragToDay, useDropOver } from '@/components/dayDrag'
import { eventTime, eventsByDay, useEvents, type CalEvent } from '@/lib/calendarEvents'
import type { Person } from '@/db/types'
import { Page } from '../Page'
import { DayTimeline } from '../plan/DayTimeline'
import { LoadMeter } from './LoadMeter'
import { WeekGrid } from './WeekGrid'
import { MarkIcons, MarkRow, useDayMarks, type DayMark } from './dayMarks'

type Mode = 'list' | 'month' | 'week' | 'day'
const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// La vista elegida se recuerda en cada dispositivo
const MODE_KEY = 'ntab-calendar-mode'
function storedMode(): Mode | undefined {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'list' || v === 'month' || v === 'week' || v === 'day' ? v : undefined
  } catch {
    return undefined
  }
}

/**
 * Calendario: lo que viene en lista (lo que antes era «Próximo», como en
 * Things), o el día, la semana o el mes. Un solo sitio para todo lo que tiene fecha.
 */
export function CalendarView({ initial }: { initial?: Mode }) {
  const t = today()
  const [mode, setModeState] = useState<Mode>(() => initial ?? storedMode() ?? (window.innerWidth < 640 ? 'list' : 'month'))
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* sin almacenamiento */
    }
  }
  const open = useOpenTasks()
  const [cursor, setCursor] = useState(t)
  const [selected, setSelected] = useState(t)
  const [dir, setDir] = useState(0)

  const range = useMemo(() => {
    if (mode === 'day') return { start: cursor, days: [cursor] }
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
  const marks = useDayMarks(range.start, end, open)

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const x of tasks) m.set(x.dueDate!, [...(m.get(x.dueDate!) ?? []), x])
    for (const list of m.values()) list.sort(sortTasks)
    return m
  }, [tasks])

  const move = (d: number) => {
    setDir(d)
    setCursor(mode === 'day' ? addDaysYmd(cursor, d) : mode === 'week' ? addDaysYmd(cursor, d * 7) : ymd(addMonths(fromYmd(cursor), d)))
  }
  const mobile = useIsMobile()
  // La semana por horas necesita sitio; en pantallas estrechas, la semana en lista
  const wide = useMediaQuery('(min-width: 1100px)')
  const weekEnd = range.days[6] ?? cursor
  const title =
    mode === 'list'
      ? 'Próximo'
      : mode === 'day'
      ? capitalize(fmt(cursor, mobile ? "EEE d MMM" : "EEEE, d 'de' MMMM"))
      : mode === 'month'
      ? capitalize(fmt(cursor, 'MMMM'))
      : range.start.slice(0, 7) === weekEnd.slice(0, 7)
        ? `${fmt(range.start, 'd')} – ${fmt(weekEnd, 'd MMM')}`
        : `${fmt(range.start, 'd MMM')} – ${fmt(weekEnd, 'd MMM')}`
  // En el móvil el año solo si no es el de ahora (si no, el título no cabe)
  const showYear = mode !== 'list' && (!mobile || cursor.slice(0, 4) !== t.slice(0, 4))
  const views = (
    <Segmented
      value={mode}
      onChange={setMode}
      options={[
        { value: 'list', label: 'Lista' },
        { value: 'day', label: 'Día' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mes' },
      ]}
    />
  )
  const controls =
    mode === 'list' ? (
      <>
        {views}
        <span className="ml-auto sm:ml-1">
          <SelectButton />
        </span>
      </>
    ) : (
    <>
      {views}
      <Button
        size="sm"
        variant="tinted"
        className="ml-auto sm:ml-1"
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
    )
  const month = cursor.slice(0, 7)
  const selectedTasks = byDay.get(selected) ?? []
  const selectedBirthdays = birthdays.filter((b) => b.date === selected)

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('calendar')} size={40} />}
        title={
          <>
            {title} {showYear && <span className="font-num text-muted">{fmt(cursor, 'yyyy')}</span>}
          </>
        }
        subtitle={mode === 'list' && open ? `${scheduledFrom(open, t)} ${scheduledFrom(open, t) === 1 ? 'tarea programada' : 'tareas programadas'} a partir de hoy` : undefined}
        actions={mobile ? undefined : controls}
      />
      {/* En el móvil los controles van debajo, para que el título quepa entero */}
      {mobile && <div className="-mt-3 mb-5 flex items-center gap-1.5">{controls}</div>}

      {mode === 'list' ? (
        <UpcomingList />
      ) : mode === 'day' ? (
        <DayView day={cursor} tasks={byDay.get(cursor) ?? []} events={evByDay.get(cursor) ?? []} birthdays={birthdays.filter((b) => b.date === cursor).map((b) => b.person)} marks={marks.get(cursor) ?? []} names={cal.names} />
      ) : mode === 'month' ? (
        <div className="grid gap-6 @[1100px]:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-hidden p-2">
            <div className="grid grid-cols-7 pb-1">
              {HEAD.map((h, i) => (
                <div key={h} className={cx('py-2 text-center text-[12px] font-semibold', i >= 5 ? 'text-muted' : 'text-muted')}>
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
                    past={d < t}
                    birthday={birthdays.some((b) => b.date === d)}
                    marks={marks.get(d) ?? []}
                    selected={selected === d}
                    isToday={d === t}
                    onSelect={() => setSelected(d)}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          </Card>

          <div>
            <div className="flex items-center gap-2 px-1">
              <h2 className="flex-1 text-[20px] font-bold tracking-tight">{longDateLabel(selected)}</h2>
              <Button
                size="sm"
                variant="tinted"
                onClick={() => {
                  setCursor(selected)
                  setMode('day')
                }}
              >
                Hora a hora
              </Button>
            </div>
            <p className="mb-3 px-1 text-[13px] text-muted">
              {selectedTasks.length ? `${selectedTasks.length} ${selectedTasks.length === 1 ? 'tarea' : 'tareas'}` : 'Sin tareas'} · doble clic en un día para añadir
            </p>
            {selectedBirthdays.map((b) => (
              <a key={b.person.id} href={`#/people/${b.person.id}`} className="glass mb-3 flex items-center gap-3 rounded-[16px] px-4 py-3 text-[15px]">
                <Cake size={18} className="text-pink" strokeWidth={2.3} /> Cumpleaños de <b className="font-semibold">{b.person.name}</b>
                {b.age ? <span className="text-muted">({b.age})</span> : null}
              </a>
            ))}
            {(marks.get(selected) ?? []).length > 0 && (
              <div className="glass mb-3 space-y-0.5 rounded-[16px] px-2.5 py-2">
                {(marks.get(selected) ?? []).map((m) => (
                  <MarkRow key={m.id} mark={m} />
                ))}
              </div>
            )}
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
      ) : wide ? (
        <WeekGrid days={range.days} byDay={byDay} evByDay={evByDay} birthdays={birthdays} marks={marks} />
      ) : (
        <div className="grid gap-3 @[560px]:grid-cols-2 @[820px]:grid-cols-4 @[1180px]:grid-cols-7">
          {/* Una semana con muchas tareas: los días de abajo se pintan al acercarse */}
          <Progressive
            items={range.days.map((d, i) => ({ d, i }))}
            weight={({ d }) => (byDay.get(d)?.length ?? 0) + 2}
            render={({ d, i }) => (
              <WeekDay key={d} day={d} index={i} list={byDay.get(d) ?? []} events={evByDay.get(d) ?? []} birthdays={birthdays.filter((b) => b.date === d).map((b) => b.person)} marks={marks.get(d) ?? []} isToday={d === t} />
            )}
          />
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
        <span className="block truncate text-[12px] text-muted">{[source, event.location].filter(Boolean).join(' · ')}</span>
      </span>
    </div>
  )
}

function MonthCell({
  day,
  list,
  events,
  inMonth,
  past,
  birthday,
  marks,
  selected,
  isToday,
  onSelect,
}: {
  day: string
  list: Task[]
  events: CalEvent[]
  inMonth: boolean
  past: boolean
  birthday: boolean
  marks: DayMark[]
  selected: boolean
  isToday: boolean
  onSelect: () => void
}) {
  const over = useDropOver(day)
  const weekend = [0, 6].includes(fromYmd(day).getDay())
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
        over ? 'bg-accent-soft ring-2 ring-blue' : selected ? 'bg-fill' : isToday ? 'bg-accent-soft/50 hover:bg-hover' : 'hover:bg-hover',

      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cx(
            'font-num flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[14px] font-semibold',
            // Hoy, en relleno; lo que ya pasó, el fin de semana y los días de otro mes, más apagados
            isToday ? 'bg-accent-fill text-white' : selected ? 'text-fg' : !inMonth || past || weekend ? 'text-muted' : '',
          )}
        >
          {fromYmd(day).getDate()}
        </span>
        <span className="flex items-center gap-0.5">
          <MarkIcons marks={marks} />
          {birthday && <Cake size={13} className="text-pink" strokeWidth={2.4} />}
        </span>
      </span>
      <span className="hidden flex-col gap-[3px] sm:flex">
        {events.slice(0, 2).map((e) => (
          <span key={e.id} className="flex items-center gap-1 truncate rounded-[5px] border border-line-strong px-1.5 text-[11.5px] leading-[17px] font-medium text-muted">
            {!e.allDay && <span className="font-num">{eventTime(e)}</span>}
            <span className="truncate">{e.title}</span>
          </span>
        ))}
        {list.slice(0, maxTasks).map((x) => (
          <span
            key={x.id}
            {...dragToDay(x)}
            title="Arrastra a otro día"
            className={cx(
              'flex cursor-grab items-center gap-1 truncate rounded-[5px] px-1.5 text-[11.5px] leading-[19px] font-medium select-none active:cursor-grabbing',
              x.done && 'line-through',
              x.priority === 3 && !x.done && 'shadow-[inset_2px_0_0_var(--c-blue)]',
            )}
            // Las hechas, sin fondo y en gris (tachadas, pero legibles)
            style={
              x.done
                ? { color: 'var(--c-muted)', WebkitTouchCallout: 'none' }
                : { background: `color-mix(in srgb, ${chipColor} 20%, transparent)`, color: `color-mix(in srgb, ${chipColor} 70%, var(--c-text))`, WebkitTouchCallout: 'none' }
            }
          >
            {x.dueTime && <span className="font-num">{x.dueTime}</span>}
            <span className="truncate">{x.title}</span>
          </span>
        ))}
        {hidden > 0 && <span className="px-1 text-[11px] font-semibold text-muted">+{hidden} más</span>}
      </span>
      <LoadMeter tasks={list} events={events} className="mt-auto hidden px-0.5 sm:block" />
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

function WeekDay({ day, index, list, events, birthdays, marks, isToday }: { day: string; index: number; list: Task[]; events: CalEvent[]; birthdays: Person[]; marks: DayMark[]; isToday: boolean }) {
  const over = useDropOver(day)
  const empty = !list.length && !events.length && !birthdays.length && !marks.length
  const past = day < today()
  return (
    <motion.div
      data-drop-day={day}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.03 }}
      className={cx(
        'glass flex flex-col rounded-[18px] p-2 transition-shadow @[560px]:min-h-44',
        over ? 'ring-2 ring-blue' : isToday && 'ring-2 ring-blue/60',
      )}
    >
      <div className="flex items-center gap-1.5 px-1.5 pt-1">
        <span className={cx('font-num text-[22px] font-bold', isToday ? 'text-blue' : past && 'text-muted')}>{fromYmd(day).getDate()}</span>
        <span className="text-[13px] font-semibold text-muted">{capitalize(fmt(day, 'EEEE'))}</span>
        {empty && <span className="text-[13px] text-muted @[560px]:hidden">· libre</span>}
        <LoadMeter tasks={list} events={events} className="w-10" />
        <button
          type="button"
          onClick={() => ui.quickAdd({ dueDate: day })}
          aria-label={`Añadir el ${fmt(day, "EEEE d 'de' MMMM")}`}
          title="Añadir"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-blue transition-colors hover:bg-hover"
        >
          <Plus size={17} strokeWidth={2.6} />
        </button>
      </div>
      {birthdays.map((p) => (
        <p key={p.id} className="flex items-center gap-1.5 px-1.5 py-1 text-[12px] font-semibold text-pink">
          <Cake size={12} /> {p.name}
        </p>
      ))}
      {marks.map((m) => (
        <MarkRow key={m.id} mark={m} />
      ))}
      {events.map((e) => (
        <p key={e.id} className="mx-1.5 mb-1 truncate rounded-[8px] border border-line-strong px-2 py-1 text-[12.5px] text-muted">
          {!e.allDay && <span className="font-num mr-1 font-semibold">{eventTime(e)}</span>}
          {e.title}
        </p>
      ))}
      {list.length > 0 && (
        <div className="flex-1">
          <TaskList tasks={list} hideDate hideProject bare compact draggable />
        </div>
      )}
    </motion.div>
  )
}

/** Un día hora a hora (como la vista de día de Fantastical): reuniones, tareas con hora, lo de todo el día y lo que no tiene hora */
function DayView({ day, tasks, events, birthdays, marks, names }: { day: string; tasks: Task[]; events: CalEvent[]; birthdays: Person[]; marks: DayMark[]; names: Record<string, string> }) {
  const allDay = events.filter((e) => e.allDay)
  const untimed = tasks.filter((x) => !x.dueTime)
  return (
    <div className="grid gap-x-8 gap-y-2 @[1000px]:grid-cols-[minmax(0,1fr)_340px]">
      <DayTimeline day={day} tasks={tasks.filter((x) => !x.done)} events={events} />
      <div>
        <LoadMeter tasks={tasks} events={events} className="mb-4 px-1" />
        {birthdays.map((p) => (
          <a key={p.id} href={`#/people/${p.id}`} className="glass mb-3 flex items-center gap-3 rounded-[16px] px-4 py-3 text-[15px]">
            <Cake size={18} className="text-pink" strokeWidth={2.3} /> Cumpleaños de <b className="font-semibold">{p.name}</b>
          </a>
        ))}
        {marks.length > 0 && (
          <div className="glass mb-3 space-y-0.5 rounded-[16px] px-2.5 py-2">
            {marks.map((m) => (
              <MarkRow key={m.id} mark={m} />
            ))}
          </div>
        )}
        {allDay.length > 0 && (
          <div className="glass mb-3 overflow-hidden rounded-[16px]">
            {allDay.map((e) => (
              <EventRow key={e.id} event={e} source={names[e.sourceId]} />
            ))}
          </div>
        )}
        <Section title="Sin hora" count={untimed.length}>
          <TaskList key={day} tasks={untimed} hideDate add={{ defaults: { dueDate: day } }} />
        </Section>
      </div>
    </div>
  )
}

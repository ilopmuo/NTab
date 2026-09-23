import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { Cake, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { addDaysYmd, capitalize, fmt, fromYmd, longDateLabel, today, weekStart, ymd } from '@/lib/dates'
import { upcomingBirthdays } from '@/lib/people'
import { PRIORITY_COLOR, sortTasks } from '@/lib/tasks'
import { ui } from '@/app/store'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { Button, IconButton, PageHeader, Segmented, cx } from '@/components/ui'
import { Page } from '../Page'

type Mode = 'month' | 'week'
const HEAD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function CalendarView() {
  const t = today()
  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 640 ? 'week' : 'month'))
  const [cursor, setCursor] = useState(t)
  const [selected, setSelected] = useState(t)

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
  const birthdays = useMemo(() => upcomingBirthdays(people, range.start, 45), [people, range.start])

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const x of tasks) m.set(x.dueDate!, [...(m.get(x.dueDate!) ?? []), x])
    for (const list of m.values()) list.sort(sortTasks)
    return m
  }, [tasks])

  const move = (dir: number) => {
    const next = mode === 'week' ? addDaysYmd(cursor, dir * 7) : ymd(addMonths(fromYmd(cursor), dir))
    setCursor(next)
  }
  const title = mode === 'month' ? capitalize(fmt(cursor, 'MMMM yyyy')) : `Semana del ${fmt(range.start, "d 'de' MMMM")}`
  const month = cursor.slice(0, 7)
  const selectedTasks = byDay.get(selected) ?? []
  const selectedBirthdays = birthdays.filter((b) => b.date === selected)

  return (
    <Page wide>
      <PageHeader
        icon={<CalendarDays size={26} className="text-accent" />}
        title={title}
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
              variant="ghost"
              className="ml-2"
              onClick={() => {
                setCursor(t)
                setSelected(t)
              }}
            >
              Hoy
            </Button>
            <IconButton label="Anterior" onClick={() => move(-1)}>
              <ChevronLeft size={17} />
            </IconButton>
            <IconButton label="Siguiente" onClick={() => move(1)}>
              <ChevronRight size={17} />
            </IconButton>
          </>
        }
      />

      {mode === 'month' ? (
        <div className="grid gap-8 @[1100px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="grid grid-cols-7 border-b border-line">
              {HEAD.map((h) => (
                <div key={h} className="py-2.5 text-center text-[11.5px] font-medium tracking-wide text-muted uppercase">
                  {h}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {range.days.map((d, i) => {
                const list = byDay.get(d) ?? []
                const open = list.filter((x) => !x.done)
                const inMonth = d.slice(0, 7) === month
                const bday = birthdays.some((b) => b.date === d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelected(d)}
                    onDoubleClick={() => ui.quickAdd({ dueDate: d })}
                    className={cx(
                      'flex min-h-[64px] flex-col items-stretch gap-1 border-line p-1.5 text-left transition-colors sm:min-h-[104px]',
                      i % 7 !== 6 && 'border-r',
                      i < range.days.length - 7 && 'border-b',
                      selected === d ? 'bg-accent-soft' : 'hover:bg-hover',
                      !inMonth && 'opacity-40',
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={cx(
                          'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12.5px] tabular-nums',
                          d === t ? 'bg-accent font-semibold text-white' : 'text-fg',
                        )}
                      >
                        {fromYmd(d).getDate()}
                      </span>
                      {bday && <Cake size={12} className="text-warn" />}
                    </span>
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {list.slice(0, 3).map((x) => (
                        <span
                          key={x.id}
                          className={cx('flex items-center gap-1 truncate rounded px-1 text-[11.5px] leading-[18px]', x.done ? 'text-faint line-through' : 'text-fg')}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: x.priority ? PRIORITY_COLOR[x.priority] : 'var(--c-faint)' }} />
                          {x.dueTime && <span className="text-muted">{x.dueTime}</span>}
                          <span className="truncate">{x.title}</span>
                        </span>
                      ))}
                      {list.length > 3 && <span className="px-1 text-[11px] text-muted">+{list.length - 3} más</span>}
                    </span>
                    {open.length > 0 && (
                      <span className="flex gap-0.5 px-1 sm:hidden">
                        {open.slice(0, 4).map((x) => (
                          <span key={x.id} className="h-1.5 w-1.5 rounded-full bg-accent" />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h2 className="mb-1 px-1 text-[15px] font-semibold">{longDateLabel(selected)}</h2>
            <p className="mb-3 px-1 text-[12.5px] text-muted">
              {selectedTasks.length ? `${selectedTasks.length} tareas` : 'Sin tareas'} · doble clic en un día para añadir
            </p>
            {selectedBirthdays.map((b) => (
              <a key={b.person.id} href={`#/people/${b.person.id}`} className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] hover:bg-hover">
                <Cake size={16} className="text-warn" /> Cumpleaños de {b.person.name}
                {b.age ? ` (${b.age})` : ''}
              </a>
            ))}
            <TaskList tasks={selectedTasks} hideDate />
            <InlineAdd key={selected} defaults={{ dueDate: selected }} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 @[860px]:grid-cols-7">
          {range.days.map((d) => {
            const list = byDay.get(d) ?? []
            const bdays = birthdays.filter((b) => b.date === d)
            return (
              <div key={d} className={cx('flex min-h-40 flex-col rounded-2xl border bg-surface p-2', d === t ? 'border-accent/50' : 'border-line')}>
                <div className="mb-1 flex items-baseline gap-1.5 px-1.5 pt-1">
                  <span className={cx('text-[20px] font-bold tabular-nums', d === t && 'text-accent')}>{fromYmd(d).getDate()}</span>
                  <span className="text-[12px] text-muted">{capitalize(fmt(d, 'EEEE'))}</span>
                </div>
                {bdays.map((b) => (
                  <p key={b.person.id} className="flex items-center gap-1.5 px-1.5 py-1 text-[12px] text-warn">
                    <Cake size={12} /> {b.person.name}
                  </p>
                ))}
                <div className="flex-1 [&_p]:text-[13px]">
                  <TaskList tasks={list} hideDate hideProject />
                </div>
                <button
                  type="button"
                  onClick={() => ui.quickAdd({ dueDate: d })}
                  className="mt-1 rounded-lg py-1.5 text-[12px] text-faint transition-colors hover:bg-hover hover:text-accent"
                >
                  + Añadir
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Page>
  )
}

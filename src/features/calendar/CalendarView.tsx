import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { Cake, ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { useLookup } from '@/db/hooks'
import { addDaysYmd, capitalize, fmt, fromYmd, longDateLabel, today, weekStart, ymd } from '@/lib/dates'
import { upcomingBirthdays } from '@/lib/people'
import { sortTasks } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { ui } from '@/app/store'
import { TaskList } from '@/components/TaskList'
import { Button, Card, IconButton, PageHeader, Segmented, cx, spring } from '@/components/ui'
import { Page } from '../Page'

type Mode = 'month' | 'week'
const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarView() {
  const t = today()
  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 640 ? 'week' : 'month'))
  const [cursor, setCursor] = useState(t)
  const [selected, setSelected] = useState(t)
  const [dir, setDir] = useState(0)
  const { project, area } = useLookup()

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

  const colorOf = (x: Task) => project(x.projectId)?.color ?? area(x.areaId)?.color ?? 'var(--c-teal)'
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
              className="ml-1 !bg-[color-mix(in_srgb,var(--c-teal)_16%,transparent)] !text-teal"
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
                {range.days.map((d) => {
                  const list = byDay.get(d) ?? []
                  const inMonth = d.slice(0, 7) === month
                  const bday = birthdays.some((b) => b.date === d)
                  const isSel = selected === d
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelected(d)}
                      onDoubleClick={() => ui.quickAdd({ dueDate: d })}
                      className={cx(
                        'relative flex min-h-[62px] flex-col items-stretch gap-1 rounded-[12px] p-1.5 text-left transition-colors sm:min-h-[104px]',
                        isSel ? 'bg-[color-mix(in_srgb,var(--c-teal)_16%,transparent)]' : 'hover:bg-hover',
                        !inMonth && 'opacity-35',
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span
                          className={cx(
                            'font-num flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[14px] font-semibold',
                            d === t ? 'bg-blue text-white' : isSel ? 'text-teal' : '',
                          )}
                        >
                          {fromYmd(d).getDate()}
                        </span>
                        {bday && <Cake size={13} className="text-pink" strokeWidth={2.4} />}
                      </span>
                      <span className="hidden flex-col gap-[3px] sm:flex">
                        {list.slice(0, 3).map((x) => (
                          <span
                            key={x.id}
                            className={cx('flex items-center gap-1 truncate rounded-[5px] px-1.5 text-[11.5px] leading-[19px] font-medium', x.done && 'line-through opacity-45')}
                            style={{ background: `color-mix(in srgb, ${colorOf(x)} 20%, transparent)`, color: `color-mix(in srgb, ${colorOf(x)} 70%, var(--c-text))` }}
                          >
                            {x.dueTime && <span className="font-num opacity-80">{x.dueTime}</span>}
                            <span className="truncate">{x.title}</span>
                          </span>
                        ))}
                        {list.length > 3 && <span className="px-1 text-[11px] font-semibold text-muted">+{list.length - 3} más</span>}
                      </span>
                      {list.length > 0 && (
                        <span className="flex justify-center gap-0.5 sm:hidden">
                          {list.slice(0, 3).map((x) => (
                            <span key={x.id} className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(x) }} />
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
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
            <TaskList key={selected} tasks={selectedTasks} hideDate add={{ defaults: { dueDate: selected }, color: 'var(--c-teal)' }} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 @[860px]:grid-cols-7">
          {range.days.map((d, i) => {
            const list = byDay.get(d) ?? []
            const bdays = birthdays.filter((b) => b.date === d)
            return (
              <motion.div
                key={d}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: i * 0.03 }}
                className={cx('glass flex min-h-44 flex-col rounded-[18px] p-2', d === t && 'ring-2 ring-blue')}
              >
                <div className="mb-1 flex items-baseline gap-1.5 px-1.5 pt-1">
                  <span className={cx('font-num text-[22px] font-bold', d === t && 'text-blue')}>{fromYmd(d).getDate()}</span>
                  <span className="text-[13px] font-semibold text-muted">{capitalize(fmt(d, 'EEEE'))}</span>
                </div>
                {bdays.map((b) => (
                  <p key={b.person.id} className="flex items-center gap-1.5 px-1.5 py-1 text-[12px] font-semibold text-pink">
                    <Cake size={12} /> {b.person.name}
                  </p>
                ))}
                <div className="flex-1">
                  <TaskList tasks={list} hideDate hideProject bare compact />
                </div>
                <button
                  type="button"
                  onClick={() => ui.quickAdd({ dueDate: d })}
                  className="mt-1 rounded-[10px] py-1.5 text-[13px] font-semibold text-teal transition-colors hover:bg-hover"
                >
                  + Añadir
                </button>
              </motion.div>
            )
          })}
        </div>
      )}
    </Page>
  )
}

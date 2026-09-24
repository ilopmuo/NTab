import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { CalendarClock } from 'lucide-react'
import type { Task } from '@/db/types'
import { ui } from '@/app/store'
import { eventTime, type CalEvent } from '@/lib/calendarEvents'
import { Card, cx } from '@/components/ui'

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Item = { kind: 'task'; time: string; task: Task } | { kind: 'event'; time: string; end: string; event: CalEvent }

/** Lo que tiene hora hoy (tareas y eventos de tus calendarios), con la línea de "ahora" */
export function Agenda({ tasks, events = [], names = {} }: { tasks: Task[]; events?: CalEvent[]; names?: Record<string, string> }) {
  const [now, setNow] = useState(nowHHMM)
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 30_000)
    return () => clearInterval(t)
  }, [])
  const allDay = events.filter((e) => e.allDay)
  const timed: Item[] = [
    ...tasks.filter((t) => t.dueTime).map((t) => ({ kind: 'task' as const, time: t.dueTime!, task: t })),
    ...events.filter((e) => !e.allDay).map((e) => ({ kind: 'event' as const, time: eventTime(e), end: new Date(e.end).toTimeString().slice(0, 5), event: e })),
  ].sort((a, b) => a.time.localeCompare(b.time))
  const nowIndex = timed.findIndex((t) => t.time > now)
  const markerAt = nowIndex === -1 ? timed.length : nowIndex

  const marker = (
    <motion.div key="now" layout className="flex items-center gap-2 py-1">
      <span className="font-num w-11 text-right text-[12px] font-bold text-blue">{now}</span>
      <span className="relative h-2.5 w-2.5 rounded-full bg-blue">
        <span className="absolute inset-0 animate-ping rounded-full bg-blue opacity-60" />
      </span>
      <span className="h-[1.5px] flex-1 rounded-full bg-blue" />
    </motion.div>
  )

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Agenda</h3>
      </div>
      {allDay.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <span key={e.id} className="rounded-full border border-line-strong px-2.5 py-0.5 text-[12.5px] font-medium text-muted" title={names[e.sourceId]}>
              {e.title}
            </span>
          ))}
        </div>
      )}
      {timed.length === 0 ? (
        <p className="py-2 text-[14px] leading-snug text-muted">
          Nada con hora hoy. Escribe <span className="font-medium text-fg">"a las 10"</span> al crear una tarea o conecta tus calendarios en Ajustes.
        </p>
      ) : (
        <div className="space-y-0.5">
          {timed.map((it, i) => {
            const key = it.kind === 'task' ? it.task.id : it.event.id
            const past = (it.kind === 'event' ? it.end : it.time) < now
            return (
              <div key={key}>
                {i === markerAt && marker}
                {it.kind === 'task' ? (
                  <button
                    type="button"
                    onClick={() => ui.openTask(it.task.id)}
                    className={cx('flex w-full items-center gap-2 rounded-lg py-1.5 text-left transition-colors hover:bg-hover', past && 'opacity-45')}
                  >
                    <span className="font-num w-11 shrink-0 text-right text-[13px] font-semibold text-muted">{it.time}</span>
                    <span className="h-8 w-[3px] shrink-0 rounded-full bg-blue" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{it.task.title}</span>
                  </button>
                ) : (
                  <div className={cx('flex w-full items-center gap-2 rounded-lg py-1.5', past && 'opacity-45')} title={names[it.event.sourceId]}>
                    <span className="font-num w-11 shrink-0 text-right text-[13px] font-semibold text-muted">{it.time}</span>
                    <span className="h-8 w-[3px] shrink-0 rounded-full bg-line-strong" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-muted">{it.event.title}</span>
                      <span className="block truncate text-[12px] text-faint">
                        hasta las {it.end}
                        {it.event.location ? ` · ${it.event.location}` : ''}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          {markerAt === timed.length && marker}
        </div>
      )}
    </Card>
  )
}

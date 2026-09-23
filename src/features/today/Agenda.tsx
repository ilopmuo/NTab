import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { CalendarClock } from 'lucide-react'
import type { Task } from '@/db/types'
import { useLookup } from '@/db/hooks'
import { ui } from '@/app/store'
import { Card, cx } from '@/components/ui'

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Lo que tiene hora hoy, con la línea roja de "ahora" como en Calendario */
export function Agenda({ tasks }: { tasks: Task[] }) {
  const { project, area } = useLookup()
  const [now, setNow] = useState(nowHHMM)
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 30_000)
    return () => clearInterval(t)
  }, [])
  const timed = tasks.filter((t) => t.dueTime).sort((a, b) => a.dueTime!.localeCompare(b.dueTime!))
  const nowIndex = timed.findIndex((t) => t.dueTime! > now)
  const markerAt = nowIndex === -1 ? timed.length : nowIndex

  const marker = (
    <motion.div key="now" layout className="flex items-center gap-2 py-1">
      <span className="font-num w-11 text-right text-[12px] font-bold text-red">{now}</span>
      <span className="relative h-2.5 w-2.5 rounded-full bg-red">
        <span className="absolute inset-0 animate-ping rounded-full bg-red opacity-60" />
      </span>
      <span className="h-[1.5px] flex-1 rounded-full bg-red" />
    </motion.div>
  )

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock size={16} className="text-teal" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold text-teal">Agenda</h3>
      </div>
      {timed.length === 0 ? (
        <p className="py-2 text-[14px] leading-snug text-muted">
          Nada con hora hoy. Escribe <span className="font-medium text-fg">"a las 10"</span> al crear una tarea.
        </p>
      ) : (
        <div className="space-y-0.5">
          {timed.map((t, i) => {
            const color = project(t.projectId)?.color ?? area(t.areaId)?.color ?? 'var(--c-teal)'
            const past = t.dueTime! < now
            return (
              <div key={t.id}>
                {i === markerAt && marker}
                <button
                  type="button"
                  onClick={() => ui.openTask(t.id)}
                  className={cx('flex w-full items-center gap-2 rounded-lg py-1.5 text-left transition-colors hover:bg-hover', past && 'opacity-45')}
                >
                  <span className="font-num w-11 shrink-0 text-right text-[13px] font-semibold text-muted">{t.dueTime}</span>
                  <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{t.title}</span>
                </button>
              </div>
            )
          })}
          {markerAt === timed.length && marker}
        </div>
      )}
    </Card>
  )
}

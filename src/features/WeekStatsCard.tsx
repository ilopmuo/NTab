import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Flame, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { db } from '@/db/db'
import { addDaysYmd, capitalize, fmt, today } from '@/lib/dates'
import { formatMinutes, weekStats } from '@/lib/stats'
import { CountUp, cx } from '@/components/ui'

/** Resumen de los últimos 7 días: tareas por día, foco, hábitos y racha */
export function WeekStatsCard() {
  const t = today()
  const since = new Date(`${addDaysYmd(t, -13)}T00:00:00`).getTime()
  const data = useLiveQuery(async () => {
    const [tasks, focus, habits, logs] = await Promise.all([
      db.tasks.where('completedAt').aboveOrEqual(since).toArray(),
      db.focusLogs.where('date').aboveOrEqual(addDaysYmd(t, -6)).toArray(),
      db.habits.toArray(),
      db.habitLogs.where('date').aboveOrEqual(addDaysYmd(t, -6)).toArray(),
    ])
    return weekStats({ tasks, focus, habits, logs, today: t })
  }, [t, since])
  if (!data) return null

  const max = Math.max(1, ...data.days.map((d) => d.done))
  const delta = data.donePrev ? Math.round(((data.done - data.donePrev) / data.donePrev) * 100) : null

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass mb-8 rounded-[22px] p-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-[13px] font-semibold text-muted">Tu semana</p>
          <p className="font-num text-[40px] leading-none font-bold tracking-tight">
            <CountUp value={data.done} />
            <span className="ml-2 text-[16px] font-semibold text-muted">{data.done === 1 ? 'tarea' : 'tareas'}</span>
          </p>
          {delta !== null && (
            <p className={cx('mt-1 flex items-center gap-1 text-[13px] font-semibold', delta >= 0 ? 'text-fg' : 'text-muted')}>
              {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {delta >= 0 ? '+' : ''}
              {delta} % que la semana anterior
            </p>
          )}
        </div>
        <div className="flex gap-6">
          <div>
            <p className="flex items-center gap-1 text-[12px] font-semibold text-muted">
              <Timer size={12} /> Foco
            </p>
            <p className="font-num text-[19px] font-bold">{data.focusMin ? formatMinutes(data.focusMin) : '—'}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-muted">Hábitos</p>
            <p className="font-num text-[19px] font-bold">{data.habitRate === null ? '—' : `${Math.round(data.habitRate * 100)} %`}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[12px] font-semibold text-muted">
              <Flame size={12} /> Racha
            </p>
            <p className="font-num text-[19px] font-bold">{data.streak ? `${data.streak} ${data.streak === 1 ? 'día' : 'días'}` : '—'}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid h-32 grid-cols-7 items-end gap-2">
        {data.days.map((d, i) => {
          const isToday = d.date === t
          return (
            <div key={d.date} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${d.done} tareas · ${d.focusMin} min de foco`}>
              <span className={cx('font-num text-[12px] font-semibold', d.done ? 'text-fg' : 'text-faint')}>{d.done || ''}</span>
              <motion.span
                className={cx('w-full max-w-10 rounded-[8px]', isToday ? 'bg-green' : 'bg-blue')}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(d.done ? 8 : 3, (d.done / max) * 80)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: i * 0.04 }}
                style={{ opacity: d.done ? 1 : 0.25 }}
              />
              <span className={cx('text-[12px] font-semibold', isToday ? 'text-fg' : 'text-muted')}>{isToday ? 'Hoy' : capitalize(fmt(d.date, 'EEEEEE'))}</span>
            </div>
          )
        })}
      </div>
      {data.best && data.best.done > 1 && (
        <p className="mt-3 text-[13px] text-muted">
          Tu mejor día: <b className="font-semibold text-fg">{data.best.date === t ? 'hoy' : fmt(data.best.date, "EEEE d")}</b>, con {data.best.done} tareas.
        </p>
      )}
    </motion.section>
  )
}

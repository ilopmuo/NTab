import { motion } from 'motion/react'
import { Check, ChevronRight, ListChecks } from 'lucide-react'
import { routineProgress, routineToday } from '@/lib/routines'
import { href } from '@/app/router'
import { Icon } from '@/components/icons'
import { Card, ProgressRing, cx } from '@/components/ui'
import { runner, useRoutines } from './useRoutines'

/** Rutinas de hoy en la pantalla Hoy: un toque y empieza el paso a paso */
export function RoutinesCard() {
  const { routines, byRoutine, today } = useRoutines(2)
  const todays = (routines ?? []).filter((r) => routineToday(r, today) && r.steps.length)
  if (!todays.length) return null
  // Primero las pendientes, por hora
  const sorted = todays
    .map((r) => ({ r, p: routineProgress(r, byRoutine.get(r.id)?.get(today)) }))
    .sort((a, b) => Number(a.p.complete) - Number(b.p.complete) || (a.r.time ?? '99').localeCompare(b.r.time ?? '99'))
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <ListChecks size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Rutinas</h3>
        <a href={href('/routines')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Ver todas
        </a>
      </div>
      <div className="space-y-1">
        {sorted.map(({ r, p }) => (
          <motion.button
            key={r.id}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => runner.open(r.id)}
            className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-hover"
          >
            <span className="relative shrink-0">
              <ProgressRing value={p.total ? p.done / p.total : 0} size={34} stroke={3.5} color="var(--c-green)" track="var(--c-fill)" />
              <span className={cx('absolute inset-0 flex items-center justify-center', p.complete ? 'text-fg' : 'text-muted')}>
                {p.complete ? <Check size={15} strokeWidth={3} /> : <Icon name={r.icon} size={14} />}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-[14.5px] font-medium', p.complete && 'text-muted')}>{r.name}</span>
              <span className="font-num block text-[12px] text-muted">
                {p.complete ? 'Hecha' : `${p.done} de ${p.total}`}
                {r.time && !p.complete ? ` · ${r.time}` : ''}
              </span>
            </span>
            {!p.complete && <ChevronRight size={16} className="text-faint" />}
          </motion.button>
        ))}
      </div>
    </Card>
  )
}

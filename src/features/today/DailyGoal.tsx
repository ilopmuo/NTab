import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Flame, Pencil, Target } from 'lucide-react'
import { db } from '@/db/db'
import { today } from '@/lib/dates'
import { doneByDay, goalStreak, type DailyGoal } from '@/lib/day'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { IconButton, Modal, cx } from '@/components/ui'

// El formulario, solo al abrirlo
const GoalForm = lazy(() => import('./DailyGoalForm'))


/**
 * Objetivo diario de tareas y su racha (como en Todoist): días seguidos
 * cumpliéndolo, sin romperla en los días libres. Va al pie de los anillos de Hoy.
 */
export function GoalFooter() {
  const t = today()
  const goal = useLiveQuery(() => db.settings.get('dailyGoal').then((r) => (r?.value as DailyGoal | undefined)?.tasks ? (r!.value as DailyGoal) : null), [])
  const since = Date.now() - 400 * 864e5
  const history = useLiveQuery(
    () => (goal ? db.tasks.where('completedAt').above(since).filter((x) => !!x.done).toArray().then((xs) => xs.map((x) => x.completedAt!)) : Promise.resolve([] as number[])),
    [goal?.tasks, t],
  )
  const [editing, setEditing] = useState(false)
  const streak = goal && history ? goalStreak(doneByDay(history), goal, t) : undefined

  // Al cumplirlo, un aviso (solo si se cumple ahora, no al abrir Hoy)
  const prev = useRef<number | null>(null)
  useEffect(() => {
    if (!goal || !streak) return
    if (prev.current !== null && prev.current < goal.tasks && streak.today >= goal.tasks) {
      haptic()
      toast(streak.current > 1 ? `¡Objetivo del día cumplido! Llevas ${streak.current} días seguidos` : '¡Objetivo del día cumplido!')
    }
    prev.current = streak.today
  }, [goal, streak])

  if (goal === undefined) return null
  return (
    <>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[13px]">
        {!goal ? (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 font-semibold text-blue">
            <Target size={14} strokeWidth={2.4} /> Ponte un objetivo diario
          </button>
        ) : (
          streak && (
            <>
              <span className="flex-1">
                <span className="font-semibold">Objetivo:</span>{' '}
                <span className={cx('font-num font-bold', streak.today >= goal.tasks && 'text-blue')}>
                  {Math.min(streak.today, goal.tasks)}/{goal.tasks}
                </span>
                {streak.dayOff && streak.today < goal.tasks && <span className="text-muted"> · hoy es día libre</span>}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold" title={`Mejor racha: ${streak.best} ${streak.best === 1 ? 'día' : 'días'}`}>
                <Flame size={14} strokeWidth={2.4} className={streak.current ? 'text-blue' : 'text-muted'} />
                <span className="font-num">{streak.current}</span> {streak.current === 1 ? 'día' : 'días'}
                {streak.best > streak.current && <span className="font-normal text-muted">· mejor {streak.best}</span>}
              </span>
              <IconButton label="Cambiar el objetivo diario" onClick={() => setEditing(true)} className="h-7 w-7">
                <Pencil size={13} />
              </IconButton>
            </>
          )
        )}
      </div>
      <Modal open={editing} onClose={() => setEditing(false)} position="center">
        {editing && (
          <Suspense fallback={<div className="h-72" />}>
            <GoalForm goal={goal} onClose={() => setEditing(false)} />
          </Suspense>
        )}
      </Modal>
    </>
  )
}

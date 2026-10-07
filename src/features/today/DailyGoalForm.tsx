import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { setSetting } from '@/db/actions'
import type { DailyGoal } from '@/lib/day'
import { Button, IconButton, cx } from '@/components/ui'
import { Modal, ModalHeader } from '@/components/Modal'

const DAYS = [
  { d: 1, l: 'L', name: 'lunes' },
  { d: 2, l: 'M', name: 'martes' },
  { d: 3, l: 'X', name: 'miércoles' },
  { d: 4, l: 'J', name: 'jueves' },
  { d: 5, l: 'V', name: 'viernes' },
  { d: 6, l: 'S', name: 'sábado' },
  { d: 0, l: 'D', name: 'domingo' },
]

/** Cuántas tareas al día y qué días son libres */
export default function GoalForm({ goal, onClose }: { goal: DailyGoal | null; onClose: () => void }) {
  const [tasks, setTasks] = useState(goal?.tasks ?? 5)
  const [off, setOff] = useState<number[]>(goal?.daysOff ?? [0, 6])
  return (
    <div>
      <ModalHeader title="Objetivo diario" onClose={onClose} />
      <div className="space-y-5 px-5 pb-2">
        <p className="text-[14px] text-muted">Cuántas tareas quieres hacer al día. Cada día que lo cumples suma a la racha.</p>
        <div className="flex items-center justify-center gap-4">
          <IconButton filled label="Una tarea menos" disabled={tasks <= 1} onClick={() => setTasks((n) => Math.max(1, n - 1))}>
            <Minus size={16} />
          </IconButton>
          <p className="w-28 text-center">
            <span className="font-num block text-[40px] leading-none font-bold">{tasks}</span>
            <span className="text-[13px] text-muted">{tasks === 1 ? 'tarea al día' : 'tareas al día'}</span>
          </p>
          <IconButton filled label="Una tarea más" disabled={tasks >= 30} onClick={() => setTasks((n) => Math.min(30, n + 1))}>
            <Plus size={16} />
          </IconButton>
        </div>
        <div role="group" aria-labelledby="goal-days-off">
          <p id="goal-days-off" className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
            Días libres (no rompen la racha)
          </p>
          <div className="flex justify-between gap-1.5">
            {DAYS.map(({ d, l, name }) => {
              const on = off.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${name} libre`}
                  onClick={() => setOff((o) => (on ? o.filter((x) => x !== d) : [...o, d]))}
                  className={cx('h-10 flex-1 rounded-xl text-[14px] font-semibold transition-colors', on ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-hover')}
                >
                  {l}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 px-5 pt-3 pb-5">
        {goal && (
          <Button
            variant="ghost"
            onClick={async () => {
              await setSetting('dailyGoal', null)
              onClose()
            }}
          >
            Quitar
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={async () => {
            await setSetting('dailyGoal', { tasks, daysOff: off.sort() } satisfies DailyGoal)
            onClose()
          }}
        >
          Guardar
        </Button>
      </div>
    </div>
  )
}

/** La hoja del objetivo diario: se carga la primera vez que se abre y se queda (para cerrarse con su animación) */
export function GoalSheet({ open, goal, onClose }: { open: boolean; goal: DailyGoal | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <GoalForm goal={goal} onClose={onClose} />}
    </Modal>
  )
}

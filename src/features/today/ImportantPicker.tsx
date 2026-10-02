import { useState } from 'react'
import { Star } from 'lucide-react'
import { db } from '@/db/db'
import { useOpenTasks } from '@/db/hooks'
import { dateLabel, today } from '@/lib/dates'
import { MAX_IMPORTANT } from '@/lib/day'
import { sortTasks, whenDue } from '@/lib/tasks'
import { toast } from '@/app/store'
import { Button, Modal, ModalHeader, cx } from '@/components/ui'

/**
 * Lo importante de un día (los «objetivos» de Sunsama, el «Highlight» de Make
 * Time): hasta tres tareas que, si las haces, el día ha merecido la pena.
 * Se eligen entre lo que toca ese día o antes.
 */
export default function ImportantPicker({ open, day, onClose }: { open: boolean; day: string; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Picker day={day} onClose={onClose} />}
    </Modal>
  )
}

function Picker({ day, onClose }: { day: string; onClose: () => void }) {
  const open = useOpenTasks()
  const candidates = [...(open ?? [])].filter((x) => x.important === day || (whenDue(x) ?? '9') <= day).sort(sortTasks)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const chosen = picked ?? new Set(candidates.filter((x) => x.important === day).map((x) => x.id))
  const t = today()
  const label = day === t ? 'hoy' : 'mañana'
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else if (next.size < MAX_IMPORTANT) next.add(id)
    setPicked(next)
  }
  const save = async () => {
    await db.transaction('rw', db.tasks, async () => {
      for (const x of candidates) {
        // Lo importante de mañana que hoy seguía pendiente pasa a mañana
        if (chosen.has(x.id) && x.important !== day) await db.tasks.update(x.id, { important: day, ...(day > t && (!x.dueDate || x.dueDate < day) ? { dueDate: day, dueTime: undefined } : {}) })
        if (!chosen.has(x.id) && x.important === day) await db.tasks.update(x.id, { important: undefined })
      }
    })
    onClose()
    if (chosen.size) toast(chosen.size === 1 ? `Lo importante de ${label}, elegido` : `${chosen.size} cosas importantes para ${label}`)
  }
  return (
    <div>
      <ModalHeader title={`Lo importante de ${label}`} onClose={onClose} />
      <div className="max-h-[60vh] overflow-y-auto px-5 pb-2">
        <p className="mb-3 text-[14px] text-muted">Elige hasta {MAX_IMPORTANT}: lo que, si lo haces, hará que el día haya merecido la pena. Irán arriba del todo en Hoy.</p>
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-muted">No hay tareas para {label}. Pon fecha a alguna y vuelve.</p>
        ) : (
          <ul className="space-y-1" aria-label="Tareas">
            {candidates.map((x) => {
              const on = chosen.has(x.id)
              const full = !on && chosen.size >= MAX_IMPORTANT
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={full}
                    onClick={() => toggle(x.id)}
                    className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-40', on ? 'bg-accent-soft' : 'hover:bg-hover')}
                  >
                    <Star size={18} strokeWidth={2.4} className={on ? 'text-blue' : 'text-muted'} fill={on ? 'currentColor' : 'none'} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{x.title}</span>
                      {x.dueDate && x.dueDate !== day && <span className="block text-[12.5px] text-muted">{dateLabel(x.dueDate, t)}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 px-5 pt-2 pb-5">
        <span className="font-num text-[13px] text-muted">
          {chosen.size} de {MAX_IMPORTANT}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={() => void save()}>
          Guardar
        </Button>
      </div>
    </div>
  )
}

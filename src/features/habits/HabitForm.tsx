import { useState } from 'react'
import type { Habit } from '@/db/types'
import { db } from '@/db/db'
import { createHabit, deleteHabit } from '@/db/moreActions'
import { WEEK_ORDER, WEEKDAYS_SHORT } from '@/lib/dates'
import { ICONS, Icon } from '@/components/icons'
import { toastTrashed } from '../trash/undo'
import { Button, cx } from '@/components/ui'
import { Field, Input, Segmented, Switch } from '@/components/form'
import { Modal, ModalHeader } from '@/components/Modal'
import { Bell } from 'lucide-react'


export function HabitForm({ habit, open, onClose }: { habit?: Habit; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form habit={habit} onClose={onClose} />}
    </Modal>
  )
}

function Form({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const [name, setName] = useState(habit?.name ?? '')
  const [icon, setIcon] = useState(habit?.icon ?? 'droplet')
  const [days, setDays] = useState<number[]>(habit?.perWeek ? [0, 1, 2, 3, 4, 5, 6] : (habit?.days ?? [0, 1, 2, 3, 4, 5, 6]))
  const [remind, setRemind] = useState(!!habit?.remindTime)
  const [time, setTime] = useState(habit?.remindTime ?? '21:00')
  const [counted, setCounted] = useState((habit?.target ?? 1) > 1)
  const [target, setTarget] = useState(String(habit?.target && habit.target > 1 ? habit.target : 8))
  const [unit, setUnit] = useState(habit?.unit ?? '')
  const [weekly, setWeekly] = useState(!!habit?.perWeek)
  const [perWeek, setPerWeek] = useState(habit?.perWeek ?? 3)
  const n = Math.round(Number(target))
  const valid = !!name.trim() && (weekly || days.length > 0) && (!counted || (n >= 2 && n <= 1000))

  const save = async () => {
    if (!valid) return
    const data: Partial<Habit> = {
      name: name.trim(),
      icon,
      // Con «N veces por semana» vale cualquier día
      days: weekly ? [0, 1, 2, 3, 4, 5, 6] : days,
      perWeek: weekly ? perWeek : undefined,
      target: counted ? n : undefined,
      unit: counted && unit.trim() ? unit.trim() : undefined,
      remindTime: remind && time ? time : undefined,
    }
    if (habit) await db.habits.update(habit.id, data)
    else await createHabit({ ...data, name: data.name! })
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={habit ? 'Editar hábito' : 'Nuevo hábito'} onClose={onClose} />
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
            <Icon name={icon} size={22} />
          </span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Beber 2 L de agua" className="h-11 text-[15px]" />
        </div>
        <Box label="Objetivo">
          <Segmented
            value={counted ? 'count' : 'done'}
            onChange={(v) => setCounted(v === 'count')}
            className="w-full"
            options={[
              { value: 'done', label: 'Hecho o no' },
              { value: 'count', label: 'Una cantidad' },
            ]}
          />
          {counted && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={1000}
                aria-label="Cantidad al día"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="font-num h-11 w-24 text-center text-[15px]"
              />
              <Input aria-label="Unidad" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="vasos, páginas, minutos…" className="h-11 flex-1 text-[15px]" />
              <span className="shrink-0 text-[14px] text-muted">al día</span>
            </div>
          )}
        </Box>
        <Box label="Cuándo">
          <Segmented
            value={weekly ? 'week' : 'days'}
            onChange={(v) => setWeekly(v === 'week')}
            className="mb-2 w-full"
            options={[
              { value: 'days', label: 'Días fijos' },
              { value: 'week', label: 'Veces por semana' },
            ]}
          />
          {weekly ? (
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={perWeek === k}
                  onClick={() => setPerWeek(k)}
                  className={cx('font-num h-9 w-9 rounded-full text-[14px] font-semibold transition-colors', perWeek === k ? 'bg-accent-fill text-white' : 'bg-fill text-muted hover:text-fg')}
                >
                  {k}
                </button>
              ))}
              <span className="ml-2 text-[13px] text-muted">{perWeek === 1 ? 'vez' : 'veces'} por semana, el día que quieras</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {WEEK_ORDER.map((d) => {
                const on = days.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    className={cx('h-9 w-9 rounded-full text-[13px] font-medium transition-colors', on ? 'bg-accent-fill text-white' : 'bg-fill text-muted hover:text-fg')}
                  >
                    {WEEKDAYS_SHORT[d]}
                  </button>
                )
              })}
              <button type="button" className="ml-2 text-[13px] font-semibold text-blue" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
                Todos
              </button>
              <button type="button" className="text-[13px] font-semibold text-blue" onClick={() => setDays([1, 2, 3, 4, 5])}>
                L–V
              </button>
            </div>
          )}
        </Box>
        <Field label="Recordatorio" group>
          <div className="flex h-11 items-center gap-3 rounded-xl bg-fill-2 px-3.5">
            <Bell size={16} className="text-muted" />
            <span className="flex-1 text-[15px]">{remind ? 'Avisarme si no lo he hecho a las' : 'Sin recordatorio'}</span>
            {remind && (
              <input
                type="time"
                aria-label="Hora del recordatorio"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="font-num h-8 rounded-lg bg-fill px-2 text-[14px] font-semibold"
              />
            )}
            <Switch label="Recordatorio" checked={remind} onChange={setRemind} />
          </div>
        </Field>
        <Field label="Icono" group>
          <div className="grid grid-cols-10 gap-1">
            {Object.keys(ICONS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setIcon(k)}
                className={cx('flex h-9 items-center justify-center rounded-full transition-all active:scale-90', icon === k ? 'bg-accent-fill text-white' : 'text-muted hover:bg-hover hover:text-fg')}
              >
                <Icon name={k} size={16} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {habit && (
          <>
            <Button type="button" variant="danger" onClick={async () => (await deleteHabit(habit.id), onClose(), toastTrashed('Hábito en la papelera', 'habits', habit.id))}>
              Eliminar
            </Button>
            <Button type="button" variant="ghost" onClick={async () => (await db.habits.update(habit.id, { archived: 1 }), onClose())}>
              Archivar
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {habit ? 'Guardar' : 'Crear hábito'}
        </Button>
      </div>
    </form>
  )
}

/** Como Field, pero sin <label>: dentro hay varios controles */
function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1.5 block px-1 text-[12px] font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </div>
  )
}

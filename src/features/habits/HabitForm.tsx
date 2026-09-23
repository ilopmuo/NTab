import { useState } from 'react'
import type { Habit } from '@/db/types'
import { db } from '@/db/db'
import { createHabit, deleteHabit } from '@/db/actions'
import { WEEK_ORDER, WEEKDAYS_SHORT } from '@/lib/dates'
import { COLORS, ICONS, Icon } from '@/components/icons'
import { Button, ColorPicker, Field, Input, Modal, ModalHeader, cx } from '@/components/ui'

const HABIT_COLORS = ['#C5F82A', ...COLORS.filter((c) => c !== '#C5F82A')]

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
  const [color, setColor] = useState(habit?.color ?? HABIT_COLORS[0])
  const [days, setDays] = useState<number[]>(habit?.days ?? [0, 1, 2, 3, 4, 5, 6])

  const save = async () => {
    if (!name.trim() || !days.length) return
    const data = { name: name.trim(), icon, color, days }
    if (habit) await db.habits.update(habit.id, data)
    else await createHabit(data)
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}22`, color }}>
            <Icon name={icon} size={22} />
          </span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Beber 2 L de agua" className="h-11 text-[15px]" />
        </div>
        <Field label="Qué días">
          <div className="flex items-center gap-1.5">
            {WEEK_ORDER.map((d) => {
              const on = days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  className={cx('h-9 w-9 rounded-full text-[13px] font-medium transition-colors', on ? 'bg-accent text-white' : 'bg-hover text-muted hover:text-fg')}
                >
                  {WEEKDAYS_SHORT[d]}
                </button>
              )
            })}
            <button type="button" className="ml-2 text-[12px] text-accent hover:underline" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
              Todos
            </button>
            <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => setDays([1, 2, 3, 4, 5])}>
              L–V
            </button>
          </div>
        </Field>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} colors={HABIT_COLORS} />
        </Field>
        <Field label="Icono">
          <div className="grid grid-cols-10 gap-1">
            {Object.keys(ICONS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setIcon(k)}
                className={cx('flex h-8 items-center justify-center rounded-lg transition-colors', icon === k ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg')}
              >
                <Icon name={k} size={16} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        {habit && (
          <>
            <Button type="button" variant="danger" onClick={async () => (await deleteHabit(habit.id), onClose())}>
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
        <Button type="submit" variant="primary" disabled={!name.trim() || !days.length}>
          {habit ? 'Guardar' : 'Crear hábito'}
        </Button>
      </div>
    </form>
  )
}

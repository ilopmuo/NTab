import { useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { Bell, GripVertical, Plus, X } from 'lucide-react'
import type { Routine, RoutineStep } from '@/db/types'
import { db } from '@/db/db'
import { createRoutine, deleteRoutine } from '@/db/actions'
import { uid } from '@/lib/id'
import { WEEK_ORDER, WEEKDAYS_SHORT } from '@/lib/dates'
import { ICONS, Icon } from '@/components/icons'
import { toastTrashed } from '../trash/undo'
import { Button, Field, Input, Modal, ModalHeader, Switch, cx } from '@/components/ui'

const ROUTINE_ICONS = ['key', 'sun', 'moon', 'home', 'door', 'backpack', 'bed', 'shirt', 'pill', 'food', 'briefcase', 'car', 'plane', 'dumbbell', 'book', 'list']

export function RoutineForm({ routine, open, onClose }: { routine?: Routine; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form routine={routine} onClose={onClose} />}
    </Modal>
  )
}

function Form({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const [name, setName] = useState(routine?.name ?? '')
  const [icon, setIcon] = useState(routine?.icon ?? 'key')
  const [days, setDays] = useState<number[]>(routine?.days ?? [0, 1, 2, 3, 4, 5, 6])
  const [remind, setRemind] = useState(!!routine?.time)
  const [time, setTime] = useState(routine?.time ?? '08:00')
  const [steps, setSteps] = useState<RoutineStep[]>(routine?.steps ?? [])
  const [draft, setDraft] = useState('')

  const addStep = () => {
    const t = draft.trim()
    if (!t) return
    setSteps((s) => [...s, { id: uid(), title: t }])
    setDraft('')
  }
  const valid = name.trim() && days.length && (steps.length || draft.trim())

  const save = async () => {
    if (!valid) return
    const all = draft.trim() ? [...steps, { id: uid(), title: draft.trim() }] : steps
    const data = { name: name.trim(), icon, days, time: remind && time ? time : undefined, steps: all.filter((s) => s.title.trim()) }
    if (routine) await db.routines.update(routine.id, data)
    else await createRoutine(data)
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={routine ? 'Editar rutina' : 'Nueva rutina'} onClose={onClose} />
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
            <Icon name={icon} size={22} />
          </span>
          <Input autoFocus={!routine} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Antes de salir de casa" className="h-11 text-[15px]" />
        </div>

        <Field label="Pasos">
          <Reorder.Group axis="y" values={steps} onReorder={setSteps} className="space-y-1.5">
            {steps.map((s, i) => (
              <StepRow
                key={s.id}
                step={s}
                index={i}
                onChange={(title) => setSteps((all) => all.map((x) => (x.id === s.id ? { ...x, title } : x)))}
                onRemove={() => setSteps((all) => all.filter((x) => x.id !== s.id))}
              />
            ))}
          </Reorder.Group>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
              placeholder={steps.length ? 'Otro paso…' : 'Primer paso: Llaves'}
              className="h-10 text-[15px]"
              aria-label="Nuevo paso"
            />
            <Button type="button" size="sm" onClick={addStep} disabled={!draft.trim()} aria-label="Añadir paso">
              <Plus size={15} strokeWidth={2.6} />
            </Button>
          </div>
        </Field>

        <Field label="Qué días">
          <div className="flex flex-wrap items-center gap-1.5">
            {WEEK_ORDER.map((d) => {
              const on = days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  className={cx('h-9 w-9 rounded-full text-[13px] font-medium transition-colors', on ? 'bg-accent text-white' : 'bg-fill text-muted hover:text-fg')}
                >
                  {WEEKDAYS_SHORT[d]}
                </button>
              )
            })}
            <button type="button" className="ml-1 text-[13px] font-semibold text-blue" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
              Todos
            </button>
            <button type="button" className="text-[13px] font-semibold text-blue" onClick={() => setDays([1, 2, 3, 4, 5])}>
              L–V
            </button>
          </div>
        </Field>

        <Field label="Aviso">
          <div className="flex h-11 items-center gap-3 rounded-xl bg-fill-2 px-3.5">
            <Bell size={16} className="text-muted" />
            <span className="flex-1 text-[15px]">{remind ? 'Recordarme empezarla a las' : 'Sin aviso (la empiezo yo)'}</span>
            {remind && (
              <input
                type="time"
                aria-label="Hora del aviso"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="font-num h-8 rounded-lg bg-fill px-2 text-[14px] font-semibold"
              />
            )}
            <Switch label="Aviso" checked={remind} onChange={setRemind} />
          </div>
        </Field>

        <Field label="Icono">
          <div className="grid grid-cols-8 gap-1">
            {ROUTINE_ICONS.filter((k) => k in ICONS).map((k) => (
              <button
                key={k}
                type="button"
                aria-label={k}
                onClick={() => setIcon(k)}
                className={cx('flex h-9 items-center justify-center rounded-full transition-all active:scale-90', icon === k ? 'bg-accent text-white' : 'text-muted hover:bg-hover hover:text-fg')}
              >
                <Icon name={k} size={16} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {routine && (
          <Button type="button" variant="danger" onClick={async () => (await deleteRoutine(routine.id), onClose(), toastTrashed('Rutina en la papelera', 'routines', routine.id))}>
            Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {routine ? 'Guardar' : 'Crear rutina'}
        </Button>
      </div>
    </form>
  )
}

function StepRow({ step, index, onChange, onRemove }: { step: RoutineStep; index: number; onChange: (t: string) => void; onRemove: () => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={step} dragListener={false} dragControls={controls} className="flex items-center gap-2 rounded-xl bg-fill-2 py-1 pr-1 pl-1.5">
      <button
        type="button"
        aria-label="Mover"
        onPointerDown={(e) => controls.start(e)}
        className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing"
      >
        <GripVertical size={15} />
      </button>
      <span className="font-num w-4 shrink-0 text-center text-[13px] font-semibold text-muted">{index + 1}</span>
      <input
        value={step.title}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Paso ${index + 1}`}
        className="h-8 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
      />
      <button type="button" aria-label={`Quitar ${step.title}`} onClick={onRemove} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg">
        <X size={14} />
      </button>
    </Reorder.Item>
  )
}

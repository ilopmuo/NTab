import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Goal } from '@/db/types'
import { db } from '@/db/db'
import { createGoal, deleteGoal, linkGoalProjects, setGoalStatus } from '@/db/actions'
import { useLookup } from '@/db/hooks'
import { toastTrashed } from '../trash/undo'
import { Button, Field, Input, Modal, ModalHeader, Segmented, Select, Textarea, cx } from '@/components/ui'

export function GoalForm({ goal, open, onClose }: { goal?: Goal; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form goal={goal} onClose={onClose} />}
    </Modal>
  )
}

function Form({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { areas, projects } = useLookup()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [why, setWhy] = useState(goal?.why ?? '')
  const [kind, setKind] = useState<Goal['kind']>(goal?.kind ?? 'projects')
  const [current, setCurrent] = useState(String(goal?.current ?? 0))
  const [target, setTarget] = useState(goal?.target ? String(goal.target) : '')
  const [unit, setUnit] = useState(goal?.unit ?? '')
  const [areaId, setAreaId] = useState(goal?.areaId ?? '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [linked, setLinked] = useState<string[]>(() => (goal ? projects.filter((p) => p.goalId === goal.id).map((p) => p.id) : []))
  const candidates = projects.filter((p) => p.status !== 'done' || linked.includes(p.id))
  const num = (s: string) => {
    const n = Number(s.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const valid = title.trim() && (kind === 'projects' || num(target) > 0)

  const save = async () => {
    if (!valid) return
    const data: Partial<Goal> = {
      title: title.trim(),
      why,
      kind,
      areaId: areaId || undefined,
      deadline: deadline || undefined,
      current: kind === 'number' ? num(current) : undefined,
      target: kind === 'number' ? num(target) : undefined,
      unit: kind === 'number' ? unit.trim() || undefined : undefined,
    }
    const id = goal ? (await db.goals.update(goal.id, data), goal.id) : (await createGoal({ ...data, title: data.title! })).id
    await linkGoalProjects(id, linked)
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={goal ? 'Editar objetivo' : 'Nuevo objetivo'} onClose={onClose} />
      <div className="max-h-[68vh] space-y-4 overflow-y-auto p-5">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Correr una media maratón" className="h-11 text-[15px]" />
        <Textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="¿Por qué te importa? Te lo recordará cuando flojees."
          rows={2}
          className="rounded-xl bg-fill-2 px-3.5 py-2.5"
        />
        <Field label="Cómo se mide">
          <Segmented
            className="w-full"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'projects', label: 'Con proyectos' },
              { value: 'number', label: 'Con una cifra' },
            ]}
          />
        </Field>
        {kind === 'number' ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Llevo">
              <Input inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field label="Meta">
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="12" />
            </Field>
            <Field label="Unidad">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="libros" />
            </Field>
          </div>
        ) : (
          <Field label="Proyectos que lo hacen avanzar">
            {candidates.length === 0 ? (
              <p className="px-1 text-[14px] text-muted">Aún no tienes proyectos. Créalos en Proyectos y vincúlalos aquí.</p>
            ) : (
              <div className="overflow-hidden rounded-xl bg-fill-2">
                {candidates.map((p, i) => {
                  const on = linked.includes(p.id)
                  const other = p.goalId && p.goalId !== goal?.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLinked(on ? linked.filter((x) => x !== p.id) : [...linked, p.id])}
                      className={cx('flex h-11 w-full items-center gap-3 px-3.5 text-left text-[15px] transition-colors hover:bg-hover', i > 0 && 'shadow-[inset_0_1px_0_var(--c-border)]')}
                    >
                      <span
                        className={cx(
                          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.6px] transition-colors',
                          on ? 'border-accent bg-accent text-white' : 'border-faint',
                        )}
                      >
                        {on && <Check size={13} strokeWidth={3.2} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {other && !on && <span className="text-[12px] text-faint">En otro objetivo</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Área">
            <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Sin área</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Para cuándo">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-1 pb-5">
        {goal && (
          <>
            <Button type="button" variant="danger" onClick={async () => (await deleteGoal(goal.id), onClose(), toastTrashed('Objetivo en la papelera', 'goals', goal.id))}>
              Eliminar
            </Button>
            {goal.status === 'active' ? (
              <Button type="button" variant="ghost" onClick={async () => (await setGoalStatus(goal.id, 'dropped'), onClose())}>
                Descartar
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={async () => (await setGoalStatus(goal.id, 'active'), onClose())}>
                Reactivar
              </Button>
            )}
          </>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {goal ? 'Guardar' : 'Crear objetivo'}
        </Button>
      </div>
    </form>
  )
}

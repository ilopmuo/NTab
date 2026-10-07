import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import { filterTasks, WHEN_LABEL, type SmartList, type SmartWhen } from '@/lib/smartLists'
import { saveSmartList } from '@/app/smartLists'
import { useFeatures } from '@/app/features'
import { navigate } from '@/app/router'
import { Button, cx } from '@/components/ui'
import { Field, Input, Segmented, Select } from '@/components/form'
import { Modal, ModalHeader } from '@/components/Modal'

export function SmartListForm({ list, open, onClose }: { list?: SmartList; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form list={list} onClose={onClose} />}
    </Modal>
  )
}

/** Botón que se enciende y se apaga, para elegir entre varias opciones a la vista */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'hit inline-flex h-8 items-center gap-1 rounded-full px-3 text-[14px] font-medium transition-colors',
        on ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-hover',
      )}
    >
      {on && <Check size={13} strokeWidth={3} aria-hidden />}
      {children}
    </button>
  )
}

function Form({ list, onClose }: { list?: SmartList; onClose: () => void }) {
  const { areas, projects, people } = useLookup()
  const { on } = useFeatures()
  const open = useLiveQuery(() => db.tasks.where('done').equals(0).toArray(), []) ?? []
  const tagNames = [...new Set([...open.flatMap((t) => t.tags), ...(list?.tags ?? [])])].sort((a, b) => a.localeCompare(b, 'es'))
  const [name, setName] = useState(list?.name ?? '')
  const [when, setWhen] = useState<SmartWhen | ''>(list?.when ?? '')
  const [minPriority, setMinPriority] = useState(list?.minPriority ?? 0)
  const [tags, setTags] = useState<string[]>(list?.tags ?? [])
  const [where, setWhere] = useState(list?.list ?? '')
  const [person, setPerson] = useState(list?.person ?? '')
  const [maxEstimate, setMaxEstimate] = useState(list?.maxEstimate ?? 0)

  const draft: SmartList = {
    id: list?.id ?? '',
    name: name.trim(),
    when: when || undefined,
    minPriority: minPriority || undefined,
    tags: tags.length ? tags : undefined,
    list: where || undefined,
    person: person || undefined,
    maxEstimate: maxEstimate || undefined,
  }
  const count = filterTasks(draft, open).length

  const save = async () => {
    if (!draft.name) return
    const id = await saveSmartList({ ...draft, id: list?.id })
    onClose()
    if (!list) navigate(`/list/${id}`)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={list ? 'Editar filtro' : 'Nuevo filtro'} onClose={onClose} />
      <div className="max-h-[68vh] space-y-5 overflow-y-auto p-5">
        <Input autoFocus aria-label="Nombre de la lista" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Llamadas de trabajo" className="h-11 text-[15px]" />
        <p className="-mt-2 px-1 text-[13px] text-muted">Solo salen las tareas pendientes que cumplen todo lo que elijas. Se actualiza sola.</p>

        <fieldset>
          <legend className="mb-1.5 px-1 text-[12px] font-medium tracking-wide text-muted uppercase">Cuándo</legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={!when} onClick={() => setWhen('')}>
              Cuando sea
            </Chip>
            {(Object.keys(WHEN_LABEL) as SmartWhen[]).map((w) => (
              <Chip key={w} on={when === w} onClick={() => setWhen(when === w ? '' : w)}>
                {WHEN_LABEL[w]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <Field label="Prioridad" group>
          <Segmented
            className="w-full"
            value={minPriority}
            onChange={setMinPriority}
            options={[
              { value: 0, label: 'Cualquiera' },
              { value: 1, label: 'Baja o más' },
              { value: 2, label: 'Media o más' },
              { value: 3, label: 'Alta' },
            ]}
          />
        </Field>

        {tagNames.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 px-1 text-[12px] font-medium tracking-wide text-muted uppercase">Con alguna de estas etiquetas</legend>
            <div className="flex flex-wrap gap-1.5">
              {tagNames.map((g) => (
                <Chip key={g} on={tags.includes(g)} onClick={() => setTags(tags.includes(g) ? tags.filter((x) => x !== g) : [...tags, g])}>
                  #{g}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}

        <div className={cx('grid gap-3', on('people') && people.length > 0 && 'sm:grid-cols-2')}>
          <Field label="Dónde">
            <Select value={where} onChange={(e) => setWhere(e.target.value)}>
              <option value="">En cualquier sitio</option>
              {areas.length > 0 && (
                <optgroup label="Áreas">
                  {areas.map((a) => (
                    <option key={a.id} value={`a:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {projects.some((p) => p.status === 'active') && (
                <optgroup label="Proyectos">
                  {projects
                    .filter((p) => p.status === 'active' || where === `p:${p.id}`)
                    .map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </Select>
          </Field>
          {on('people') && people.length > 0 && (
            <Field label="Con quién">
              <Select value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Con quien sea</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <Field label="Duración estimada" group>
          <Segmented
            className="w-full"
            value={maxEstimate}
            onChange={setMaxEstimate}
            options={[
              { value: 0, label: 'Cualquiera' },
              { value: 15, label: '≤ 15 min' },
              { value: 30, label: '≤ 30 min' },
              { value: 60, label: '≤ 1 h' },
            ]}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        <span className="flex-1 text-[14px] text-muted" aria-live="polite">
          {count === 0 ? 'Ahora mismo, ninguna tarea' : `Ahora mismo, ${count} ${count === 1 ? 'tarea' : 'tareas'}`}
        </span>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!draft.name}>
          {list ? 'Guardar' : 'Crear lista'}
        </Button>
      </div>
    </form>
  )
}

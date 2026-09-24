import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { ClipboardList, Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import type { Template, TemplateItem } from '@/db/types'
import { dateLabel, today } from '@/lib/dates'
import { SAMPLE_TEMPLATES, applyTemplate, createTemplate, expandTemplate } from '@/lib/templates'
import { navigate } from '@/app/router'
import { setUI, toast, useUI } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { ICONS, Icon } from '@/components/icons'
import { Button, Empty, Field, IconButton, Input, Modal, ModalHeader, PageHeader, Segmented, Select, cx } from '@/components/ui'
import { Page } from '../Page'

export function TemplatesView() {
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), [])
  const creating = useUI((s) => s.creating === 'template')
  const [editing, setEditing] = useState<Template | undefined>()
  const [using, setUsing] = useState<Template | undefined>()
  if (!templates) return null

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('templates')} size={40} />}
        title="Plantillas"
        subtitle="Listas que repites: úsalas y se crean las tareas con sus fechas."
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'template' })}>
            <Plus size={15} /> Nueva
          </Button>
        }
      />
      {templates.length === 0 ? (
        <Empty
          icon={<ClipboardList size={28} strokeWidth={2.2} />}
          color="var(--c-blue)"
          title="Sin plantillas todavía"
          hint="Una plantilla es una lista que repites: la maleta de un viaje, el cierre de mes, una limpieza… También puedes guardar cualquier proyecto como plantilla."
        >
          <Button
            onClick={async () => {
              for (const t of SAMPLE_TEMPLATES) await createTemplate(t)
              toast('Ejemplos añadidos')
            }}
          >
            <Sparkles size={15} /> Añadir ejemplos
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-3 @[560px]:grid-cols-2 @[900px]:grid-cols-3">
          {templates.map((t, i) => {
            const dated = t.items.filter((x) => typeof x.offset === 'number').length
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30, delay: i * 0.04 }}
                className="glass flex flex-col gap-3 rounded-[20px] p-4"
              >
                <button type="button" onClick={() => setEditing(t)} className="flex items-center gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-fill text-fg">
                    <Icon name={t.icon} size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{t.name}</span>
                    <span className="block text-[13px] text-muted">
                      {t.items.length} {t.items.length === 1 ? 'tarea' : 'tareas'}
                      {dated ? ` · ${dated} con fecha` : ''}
                    </span>
                  </span>
                </button>
                <p className="line-clamp-2 text-[13px] leading-snug text-muted">{t.items.map((x) => x.title).join(' · ')}</p>
                <Button variant="tinted" size="sm" className="self-start" onClick={() => setUsing(t)}>
                  Usar plantilla
                </Button>
              </motion.div>
            )
          })}
        </div>
      )}
      <TemplateEditor open={creating} onClose={() => setUI({ creating: null })} />
      <TemplateEditor open={!!editing} template={editing} onClose={() => setEditing(undefined)} />
      <UseTemplate template={using} onClose={() => setUsing(undefined)} />
    </Page>
  )
}

// ── Editor ────────────────────────────────────────────────────

export function TemplateEditor({ open, template, onClose }: { open: boolean; template?: Template; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Editor template={template} onClose={onClose} />}
    </Modal>
  )
}

function Editor({ template, onClose }: { template?: Template; onClose: () => void }) {
  const [name, setName] = useState(template?.name ?? '')
  const [icon, setIcon] = useState(template?.icon ?? 'list')
  const [items, setItems] = useState<TemplateItem[]>(template?.items.length ? template.items : [{ title: '' }, { title: '' }, { title: '' }])
  const valid = name.trim() && items.some((x) => x.title.trim())
  const set = (i: number, patch: Partial<TemplateItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    if (!valid) return
    const clean = items.filter((x) => x.title.trim()).map((x) => ({ ...x, title: x.title.trim() }))
    if (template) await db.templates.update(template.id, { name: name.trim(), icon, items: clean })
    else await createTemplate({ name: name.trim(), icon, items: clean })
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={template ? 'Editar plantilla' : 'Nueva plantilla'} onClose={onClose} />
      <div className="max-h-[68vh] space-y-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-fill text-fg">
            <Icon name={icon} size={20} />
          </span>
          <Input autoFocus={!template} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Maleta de viaje" className="h-11 text-[15px]" />
        </div>
        <div className="grid grid-cols-10 gap-1">
          {Object.keys(ICONS).slice(0, 20).map((k) => (
            <button
              key={k}
              type="button"
              aria-label={k}
              onClick={() => setIcon(k)}
              className={cx('flex h-8 items-center justify-center rounded-full transition-all active:scale-90', icon === k ? 'bg-accent text-white' : 'text-muted hover:bg-hover hover:text-fg')}
            >
              <Icon name={k} size={15} />
            </button>
          ))}
        </div>
        <Field label="Tareas">
          <div className="overflow-hidden rounded-xl bg-fill-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                <input
                  value={it.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setItems([...items.slice(0, i + 1), { title: '' }, ...items.slice(i + 1)])
                      setTimeout(() => (document.querySelectorAll<HTMLInputElement>('[data-tpl-title]')[i + 1])?.focus())
                    }
                  }}
                  data-tpl-title
                  placeholder={`Tarea ${i + 1}`}
                  className="h-9 min-w-0 flex-1 bg-transparent px-2 text-[15px] placeholder:text-faint"
                />
                {it.subtasks?.length ? <span className="shrink-0 text-[12px] text-faint">+{it.subtasks.length}</span> : null}
                <label className="flex shrink-0 items-center gap-1 text-[12px] text-muted" title="Día respecto al inicio (vacío = sin fecha)">
                  Día
                  <input
                    type="number"
                    inputMode="numeric"
                    value={it.offset ?? ''}
                    onChange={(e) => set(i, { offset: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="—"
                    className="font-num h-8 w-12 rounded-lg bg-fill text-center text-[14px] text-fg placeholder:text-faint"
                  />
                </label>
                <IconButton label="Quitar" className="h-8 w-8" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  <Minus size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        </Field>
        <button type="button" onClick={() => setItems([...items, { title: '' }])} className="flex items-center gap-2 px-1 text-[14px] font-semibold text-blue">
          <Plus size={15} /> Añadir tarea
        </button>
        <p className="px-1 text-[12.5px] leading-snug text-muted">
          Día: 0 es el día que uses la plantilla, 1 el siguiente, −2 dos días antes. Vacío: sin fecha.
        </p>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {template && (
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              await db.templates.delete(template.id)
              onClose()
              toast('Plantilla eliminada', { label: 'Deshacer', run: () => void db.templates.add(template) })
            }}
          >
            <Trash2 size={14} /> Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {template ? 'Guardar' : 'Crear plantilla'}
        </Button>
      </div>
    </form>
  )
}

// ── Usar ──────────────────────────────────────────────────────

type Mode = 'project' | 'loose' | 'existing'

function UseTemplate({ template, onClose }: { template?: Template; onClose: () => void }) {
  return (
    <Modal open={!!template} onClose={onClose} position="center">
      {template && <UseForm template={template} onClose={onClose} />}
    </Modal>
  )
}

function UseForm({ template, onClose }: { template: Template; onClose: () => void }) {
  const { areas, projects } = useLookup()
  const [start, setStart] = useState(today())
  const [mode, setMode] = useState<Mode>('project')
  const [projectName, setProjectName] = useState(template.name)
  const [areaId, setAreaId] = useState('')
  const [projectId, setProjectId] = useState('')
  const preview = useMemo(() => expandTemplate(template.items, start || today()), [template, start])
  const active = projects.filter((p) => p.status === 'active')
  const valid = !!start && (mode !== 'existing' || !!projectId) && (mode !== 'project' || !!projectName.trim())

  const apply = async () => {
    const r = await applyTemplate(template, {
      start,
      asProject: mode === 'project',
      projectName,
      areaId: mode === 'loose' ? undefined : areaId || undefined,
      projectId: mode === 'existing' ? projectId : undefined,
    })
    onClose()
    toast(`${r.tasks.length} ${r.tasks.length === 1 ? 'tarea creada' : 'tareas creadas'}`)
    const target = r.project?.id ?? (mode === 'existing' ? projectId : undefined)
    if (target) navigate(`/project/${target}`)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) void apply()
      }}
    >
      <ModalHeader title={`Usar «${template.name}»`} onClose={onClose} />
      <div className="max-h-[68vh] space-y-4 overflow-y-auto p-5">
        <Segmented
          className="w-full"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'project', label: 'Proyecto nuevo' },
            { value: 'loose', label: 'Tareas sueltas' },
            { value: 'existing', label: 'En un proyecto' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día 0 (referencia)">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          {mode === 'project' && (
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
          )}
          {mode === 'existing' && (
            <Field label="Proyecto">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Elige…</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {mode === 'project' && (
          <Field label="Nombre del proyecto">
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </Field>
        )}
        <div className="overflow-hidden rounded-xl bg-fill-2">
          {preview.map((x, i) => (
            <div key={i} className="flex items-center gap-3 px-3.5 py-2 text-[14px] shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
              <span className="h-[18px] w-[18px] shrink-0 rounded-full border-[1.6px] border-faint" />
              <span className="min-w-0 flex-1 truncate">{x.title}</span>
              {x.subtasks.length > 0 && <span className="text-[12px] text-faint">+{x.subtasks.length}</span>}
              <span className="shrink-0 text-[12.5px] font-medium text-muted">{x.dueDate ? `${dateLabel(x.dueDate)}${x.dueTime ? ` ${x.dueTime}` : ''}` : 'Sin fecha'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 pt-1 pb-5">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          Crear {preview.length} {preview.length === 1 ? 'tarea' : 'tareas'}
        </Button>
      </div>
    </form>
  )
}

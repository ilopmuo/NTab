import { useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import type { Project, Task } from '@/db/types'
import { db } from '@/db/db'
import { uid } from '@/lib/id'
import { today } from '@/lib/dates'
import { readImport, type ImportResult } from '@/lib/importers'
import { toast } from '@/app/store'
import { Button, Modal, ModalHeader, Textarea, cx } from '@/components/ui'

/**
 * Crea lo que se trae: los proyectos que no existan (o les añade las
 * secciones que falten) y las tareas, en orden. Devuelve cómo deshacerlo.
 */
export async function applyImport(results: ImportResult[], withDone: boolean) {
  return db.transaction('rw', db.projects, db.tasks, async () => {
    const existing = await db.projects.toArray()
    const created: string[] = []
    const touched: { id: string; sections: Project['sections'] }[] = []
    const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]))
    const projectFor = async (name: string, sections: string[]) => {
      const key = name.trim().toLowerCase()
      let p = byName.get(key)
      if (!p) {
        p = { id: uid(), name: name.trim(), description: '', status: 'active', color: '#0A84FF', order: Date.now() + created.length, createdAt: Date.now(), sections: sections.map((s) => ({ id: uid(), name: s })) }
        await db.projects.add(p)
        created.push(p.id)
        byName.set(key, p)
        return p
      }
      const missing = sections.filter((s) => !(p!.sections ?? []).some((x) => x.name.toLowerCase() === s.toLowerCase()))
      if (missing.length) {
        touched.push({ id: p.id, sections: p.sections })
        p = { ...p, sections: [...(p.sections ?? []), ...missing.map((s) => ({ id: uid(), name: s }))] }
        await db.projects.update(p.id, { sections: p.sections })
        byName.set(key, p)
      }
      return p
    }
    for (const r of results) for (const p of r.projects) await projectFor(p.name, p.sections)
    const now = Date.now()
    const tasks: Task[] = []
    for (const r of results)
      for (const t of r.tasks) {
        if (t.done && !withDone) continue
        const project = t.project ? byName.get(t.project.trim().toLowerCase()) : undefined
        tasks.push({
          id: uid(),
          title: t.title,
          notes: t.notes,
          done: t.done ? 1 : 0,
          ...(t.done ? { completedAt: now } : {}),
          priority: t.priority,
          tags: t.tags,
          subtasks: t.subtasks.map((s) => ({ id: uid(), title: s.title, done: s.done })),
          ...(t.dueDate ? { dueDate: t.dueDate } : {}),
          ...(t.dueDate && t.dueTime ? { dueTime: t.dueTime } : {}),
          ...(t.recurrence ? { recurrence: t.recurrence } : {}),
          ...(project ? { projectId: project.id, ...(project.areaId ? { areaId: project.areaId } : {}) } : {}),
          ...(project && t.section ? { sectionId: project.sections?.find((s) => s.name.toLowerCase() === t.section!.toLowerCase())?.id } : {}),
          order: now + tasks.length,
          createdAt: now,
        })
      }
    await db.tasks.bulkAdd(tasks)
    return {
      count: tasks.length,
      undo: () =>
        db.transaction('rw', db.projects, db.tasks, async () => {
          await db.tasks.bulkDelete(tasks.map((t) => t.id))
          await db.projects.bulkDelete(created)
          for (const p of touched) await db.projects.update(p.id, { sections: p.sections })
        }),
    }
  })
}

const SOURCES = [
  { app: 'Todoist', how: 'en cada proyecto, ⋯ → Exportar como plantilla → Descargar como CSV (uno por proyecto: puedes subir varios)' },
  { app: 'TickTick', how: 'Ajustes → Cuenta → Copia de seguridad → Generar copia (un CSV con todo)' },
  { app: 'Google Tasks', how: 'takeout.google.com, solo «Tasks»: el archivo Tasks.json' },
  { app: 'Cualquier otra', how: 'Recordatorios, Notas, Microsoft To Do…: copia la lista y pégala aquí' },
]

export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center" className="max-w-lg">
      {open && <Sheet onClose={onClose} />}
    </Modal>
  )
}

function Sheet({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<{ name: string; text: string }[]>([])
  const [pasted, setPasted] = useState('')
  const [withDone, setWithDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const results = useMemo(() => {
    const t = today()
    return [...files.map((f) => readImport(f.text, f.name, t, tz)), ...(pasted.trim() ? [readImport(pasted, '', t, tz)] : [])].filter((r) => r.tasks.length)
  }, [files, pasted, tz])
  const all = results.flatMap((r) => r.tasks)
  const done = all.filter((t) => t.done).length
  const count = all.length - (withDone ? 0 : done)

  const run = async () => {
    setBusy(true)
    try {
      const r = await applyImport(results, withDone)
      toast(`${r.count} ${r.count === 1 ? 'tarea traída' : 'tareas traídas'}`, { label: 'Deshacer', run: () => void r.undo() }, 10_000)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <ModalHeader title="Traer de otra app" onClose={onClose} />
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 pb-2">
        <ul className="space-y-1.5 text-[13.5px] leading-snug text-muted">
          {SOURCES.map((s) => (
            <li key={s.app}>
              <b className="font-semibold text-fg">{s.app}</b>: {s.how}.
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-4 text-[14px] font-semibold text-blue hover:bg-hover"
        >
          <FileUp size={17} /> {files.length ? files.map((f) => f.name).join(', ') : 'Elegir archivos (.csv, .json, .txt)'}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".csv,.json,.txt,.md,text/csv,application/json,text/plain"
          aria-label="Archivos para traer"
          className="hidden"
          onChange={async (e) => {
            const list = [...(e.target.files ?? [])]
            e.target.value = ''
            setFiles(await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() }))))
          }}
        />
        <Textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          aria-label="O pega una lista"
          placeholder={'O pega una lista, una tarea por línea:\n- Llamar al dentista mañana a las 10\n- Renovar el DNI antes del viernes'}
          className="min-h-24 rounded-2xl bg-fill-2 p-3"
        />
        {results.length > 0 && (
          <div className="rounded-2xl bg-fill-2 p-3 text-[14px]" aria-live="polite">
            {results.map((r, i) => {
              const dated = r.tasks.filter((t) => t.dueDate).length
              return (
                <p key={i}>
                  <b className="font-semibold">{r.source}</b>: {r.tasks.length} {r.tasks.length === 1 ? 'tarea' : 'tareas'}
                  {r.projects.length > 0 && ` en ${r.projects.length === 1 ? `«${r.projects[0].name}»` : `${r.projects.length} proyectos`}`}
                  {dated > 0 && ` · ${dated} con fecha`}
                  {r.skipped > 0 && ` · ${r.skipped} sin traer (notas sueltas)`}
                </p>
              )
            })}
            {done > 0 && (
              <label className="mt-2 flex items-center gap-2 text-[13.5px] text-muted">
                <input type="checkbox" checked={withDone} onChange={(e) => setWithDone(e.target.checked)} className="h-4 w-4 accent-[var(--c-blue)]" />
                {done === 1 ? 'Traer también la que ya está hecha' : `Traer también las ${done} ya hechas`}
              </label>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 px-5 pt-3 pb-5">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" disabled={!count || busy} onClick={() => void run()} className={cx(busy && 'opacity-60')}>
          {count ? `Traer ${count} ${count === 1 ? 'tarea' : 'tareas'}` : 'Traer'}
        </Button>
      </div>
    </div>
  )
}

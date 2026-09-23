import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Inbox } from 'lucide-react'
import type { Task } from '@/db/types'
import { useLookup } from '@/db/hooks'
import { createTask } from '@/db/actions'
import { parseQuickAdd } from '@/lib/parse'
import { dateLabel } from '@/lib/dates'
import { toast, ui, useUI } from '@/app/store'
import { ParsedChips } from './ParsedChips'
import { Kbd, Modal } from './ui'

const EXAMPLES = [
  'Llamar al dentista mañana a las 10 !alta',
  'Pagar el alquiler el 1 de cada mes +Finanzas',
  'Gimnasio cada lunes y jueves a las 19',
  'Revisar presupuesto el viernes #trabajo',
  'Comprar regalo para Ana en 2 semanas',
]

export function QuickAdd() {
  const { open, defaults, text } = useUI((s) => s.quickAdd)
  return (
    <Modal open={open} onClose={ui.closeQuickAdd} className="max-w-xl">
      {open && <QuickAddForm defaults={defaults} initial={text} />}
    </Modal>
  )
}

function QuickAddForm({ defaults, initial }: { defaults?: Partial<Task>; initial?: string }) {
  const [value, setValue] = useState(initial ?? '')
  const [notes, setNotes] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { areas, projects, project, area } = useLookup()
  const parsed = useMemo(() => parseQuickAdd(value, { areas, projects }), [value, areas, projects])
  const example = useMemo(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)], [])

  useEffect(() => inputRef.current?.focus(), [])

  const final: Partial<Task> = { ...defaults }
  if (parsed.dueDate) final.dueDate = parsed.dueDate
  if (parsed.dueTime) final.dueTime = parsed.dueTime
  if (parsed.recurrence) final.recurrence = parsed.recurrence
  if (parsed.projectId) {
    final.projectId = parsed.projectId
    final.areaId = parsed.areaId
  } else if (parsed.areaId) {
    final.areaId = parsed.areaId
    final.projectId = undefined
  }
  const destination = project(final.projectId)?.name ?? area(final.areaId)?.name
  const toInbox = !final.projectId && !final.areaId && !final.dueDate

  const submit = async (keepOpen: boolean) => {
    if (!parsed.title) return
    await createTask({
      ...final,
      title: parsed.title,
      notes,
      priority: parsed.priority || defaults?.priority || 0,
      tags: [...new Set([...(defaults?.tags ?? []), ...parsed.tags])],
    })
    const where = toInbox ? 'la Bandeja' : final.dueDate ? dateLabel(final.dueDate) : destination
    toast(`Tarea añadida${where ? ` · ${where}` : ''}`)
    setValue('')
    setNotes('')
    if (!keepOpen) ui.closeQuickAdd()
    else inputRef.current?.focus()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(false)
      }}
    >
      <div className="px-5 pt-5 pb-3">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit(true)
            }
          }}
          placeholder={example}
          className="w-full bg-transparent text-[18px] font-medium tracking-tight placeholder:font-normal placeholder:text-faint"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas"
          className="mt-1.5 w-full bg-transparent text-[13.5px] text-muted placeholder:text-faint"
        />
        <ParsedChips parsed={parsed} className="mt-3" />
      </div>
      <div className="flex items-center gap-3 border-t border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-muted">
          {toInbox ? (
            <>
              <Inbox size={13} /> Bandeja de entrada
            </>
          ) : (
            <span className="truncate">
              {[final.dueDate && dateLabel(final.dueDate), destination].filter(Boolean).join(' · ')}
            </span>
          )}
          <span className="ml-auto hidden items-center gap-1 text-faint sm:flex">
            <Kbd>#</Kbd>etiqueta <Kbd>+</Kbd>proyecto <Kbd>!</Kbd>prioridad
          </span>
        </div>
        <button
          type="submit"
          disabled={!parsed.title}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-30"
        >
          Añadir <ArrowUp size={14} />
        </button>
      </div>
    </form>
  )
}

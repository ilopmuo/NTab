import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUp, AtSign, Folder, Hash, Inbox, Mic } from 'lucide-react'
import type { Task } from '@/db/types'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import { applySuggestion, suggest, type Suggestion } from '@/lib/autocomplete'
import { createTask } from '@/db/actions'
import { parseQuickAdd } from '@/lib/parse'
import { dateLabel } from '@/lib/dates'
import { toast, ui, useUI } from '@/app/store'
import { ParsedChips } from './ParsedChips'
import { Icon } from './icons'
import { Kbd, Modal, cx } from './ui'
import { useDictation } from '@/lib/speech'
import { haptic } from '@/lib/haptics'

const EXAMPLES = [
  'Llamar al dentista mañana a las 10 !alta',
  'Pagar el alquiler el 1 de cada mes +Finanzas',
  'Gimnasio cada lunes y jueves a las 19',
  'Revisar presupuesto el viernes ~1h #trabajo',
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
  const { areas, projects, people, project, area } = useLookup()
  const parsed = useMemo(() => parseQuickAdd(value, { areas, projects, people }), [value, areas, projects, people])
  const example = useMemo(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)], [])

  // Autocompletar #etiqueta, +proyecto y @persona
  const tags = useLiveQuery(() => db.tasks.orderBy('tags').uniqueKeys(), []) as string[] | undefined
  const [caret, setCaret] = useState(value.length)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const listId = useId()
  const sug = useMemo(
    () => (dismissed === value ? undefined : suggest(value, caret, { tags: tags ?? [], projects, areas, people })),
    [value, caret, tags, projects, areas, people, dismissed],
  )
  const current = sug ? Math.min(active, sug.items.length - 1) : 0
  // El cursor se coloca en cuanto el texto nuevo está en la página, antes de la siguiente tecla
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return
    inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  }, [value])
  const complete = (s: Suggestion) => {
    if (!sug) return
    const out = applySuggestion(value, sug, s)
    pendingCaret.current = out.caret
    setValue(out.text)
    setCaret(out.caret)
    setActive(0)
  }

  useEffect(() => inputRef.current?.focus(), [])

  const final: Partial<Task> = { ...defaults }
  if (parsed.dueDate) final.dueDate = parsed.dueDate
  if (parsed.dueTime) final.dueTime = parsed.dueTime
  if (parsed.recurrence) final.recurrence = parsed.recurrence
  if (parsed.reminder) final.reminder = parsed.reminder
  if (parsed.estimate) final.estimate = parsed.estimate
  if (parsed.nag) final.nag = parsed.nag
  if (parsed.people?.length) final.people = [...new Set([...(defaults?.people ?? []), ...parsed.people])]
  if (parsed.projectId) {
    final.projectId = parsed.projectId
    final.areaId = parsed.areaId
  } else if (parsed.areaId) {
    final.areaId = parsed.areaId
    final.projectId = undefined
  }
  const destination = project(final.projectId)?.name ?? area(final.areaId)?.name
  const toInbox = !final.projectId && !final.areaId && !final.dueDate

  // Dictado: lo dicho se añade tras lo que ya hubiera escrito
  const base = useRef('')
  const dictation = useDictation((text) => {
    const next = `${base.current}${base.current && text ? ' ' : ''}${text}`
    setValue(next)
    setCaret(next.length)
  })
  const toggleMic = () => {
    if (dictation.listening) return dictation.stop()
    base.current = value.trim()
    haptic()
    dictation.start()
  }

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
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <span className="mt-1 h-[24px] w-[24px] shrink-0 rounded-full border-[1.6px] border-dashed border-faint" />
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            value={value}
            role="combobox"
            aria-label="Nueva tarea"
            aria-autocomplete="list"
            aria-expanded={!!sug}
            aria-controls={sug ? listId : undefined}
            aria-activedescendant={sug ? `${listId}-${current}` : undefined}
            onChange={(e) => {
              setValue(e.target.value)
              setCaret(e.target.selectionStart ?? e.target.value.length)
              setActive(0)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit(true)
                return
              }
              if (!sug) return
              if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault()
                complete(sug.items[current])
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const n = sug.items.length
                setActive((current + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setDismissed(value)
              }
            }}
            placeholder={example}
            className="w-full bg-transparent text-[20px] font-semibold tracking-tight placeholder:font-normal placeholder:text-faint"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas"
            className="mt-1 w-full bg-transparent text-[15px] text-muted placeholder:text-faint"
          />
          {sug && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <div id={listId} role="listbox" aria-label="Sugerencias" className="flex flex-wrap items-center gap-1.5">
                {sug.items.map((s, i) => (
                  <div
                    key={`${s.kind}:${s.label}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === current}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => complete(s)}
                    className={cx(
                      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold transition-colors',
                      i === current ? 'border-transparent bg-accent-fill text-white' : 'border-line text-fg hover:bg-hover',
                    )}
                  >
                    <SuggestIcon s={s} />
                    {s.label}
                  </div>
                ))}
              </div>
              <span className="ml-1 hidden items-center gap-1 text-[12px] text-muted sm:inline-flex" aria-hidden>
                <Kbd>Tab</Kbd> completar
              </span>
            </div>
          )}
          <ParsedChips parsed={parsed} className="mt-3" />
          {(dictation.listening || dictation.error) && (
            <p className={cx('mt-2 text-[13px] font-medium', dictation.error ? 'text-muted' : 'text-fg')}>{dictation.error ?? 'Te escucho… di la tarea como la escribirías: «llamar a Ana mañana a las 10»'}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 pt-1 pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-muted">
          {toInbox ? (
            <>
              <Inbox size={14} strokeWidth={2.3} /> Bandeja de entrada
            </>
          ) : (
            <span className="truncate">{[final.dueDate && dateLabel(final.dueDate), destination].filter(Boolean).join(' · ')}</span>
          )}
          <span className="ml-auto hidden items-center gap-1 text-muted md:flex">
            <Kbd>#</Kbd>etiqueta <Kbd>+</Kbd>lista <Kbd>@</Kbd>persona <Kbd>!</Kbd>prioridad <Kbd>~</Kbd>duración
          </span>
        </div>
        {dictation.supported && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={dictation.listening ? 'Dejar de dictar' : 'Dictar'}
            aria-pressed={dictation.listening}
            className={cx(
              'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-90',
              dictation.listening ? 'bg-green text-on-green' : 'bg-fill text-fg hover:bg-press',
            )}
          >
            {dictation.listening && <motion.span className="absolute inset-0 rounded-full bg-green" animate={{ scale: [1, 1.6], opacity: [0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
            <Mic size={17} strokeWidth={2.4} className="relative" />
          </button>
        )}
        <button
          type="submit"
          disabled={!parsed.title}
          aria-label="Añadir"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white shadow-[0_4px_14px_-4px_var(--c-blue)] transition-all active:scale-90 disabled:opacity-30 disabled:shadow-none"
        >
          <ArrowUp size={18} strokeWidth={2.8} />
        </button>
      </div>
    </form>
  )
}

function SuggestIcon({ s }: { s: Suggestion }) {
  if (s.kind === 'tag') return <Hash size={13} strokeWidth={2.6} aria-hidden />
  if (s.kind === 'person') return <AtSign size={13} strokeWidth={2.4} aria-hidden />
  if (s.kind === 'project') return <Folder size={13} strokeWidth={2.4} aria-hidden />
  return s.icon ? <Icon name={s.icon} size={13} strokeWidth={2.4} aria-hidden /> : <span aria-hidden>+</span>
}

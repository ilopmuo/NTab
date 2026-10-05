import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { m as motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUp, AtSign, CheckCircle2, Folder, Hash, History, Inbox, Link2, ListPlus, Mic, Package, Repeat, ShoppingCart, StickyNote, Wallet, X } from 'lucide-react'
import type { Task } from '@/db/types'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import { applySuggestion, suggest, type Suggestion } from '@/lib/autocomplete'
import { createTask } from '@/db/actions'
import { parseQuickAdd, type ParsedTask } from '@/lib/parse'
import { classify, type Intent } from '@/lib/intent'
import { planCapture, type CapturePlan } from './capturePlan'
import { fetchLinkTitle, findUrl, hostOf, linkTask } from '@/lib/links'
import { listLines } from '@/lib/lines'
import { useSync } from '@/sync/service'
import { dateLabel, today } from '@/lib/dates'
import { toast, ui, useUI } from '@/app/store'
import { ParsedChips } from './ParsedChips'
import { Icon } from './icons'
import { Kbd, Modal, cx } from './ui'
import { useDictation } from '@/lib/speech'
import { haptic } from '@/lib/haptics'

const EXAMPLES = [
  'Llamar al dentista mañana a las 10 !alta',
  'Compra leche, huevos y pan',
  'Gasto 12,50 comida con Ana',
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
  // Lo compartido con varias líneas (una nota, una lista): una tarea por línea
  const initialLines = useMemo(() => (initial?.includes('\n') ? listLines(initial).filter((l) => !l.done).map((l) => l.text) : []), [initial])
  const [value, setValue] = useState(initialLines.length > 1 ? '' : (initial ?? '').replace(/\s+/g, ' ').trim())
  const [notes, setNotes] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { areas, projects, people, project, area } = useLookup()
  const { user } = useSync()
  // Un enlace va a las notas; el título es lo escrito o el de la página
  const link = useMemo(() => findUrl(value), [value])
  // A dónde va lo escrito, como con Siri: «compra leche» a la compra, «gasto 12 café» a gastos…
  const names = useLiveQuery(loadNames, [])
  const projectNames = useMemo(() => projects.filter((p) => p.status !== 'done').map((p) => p.name), [projects])
  const intent: Intent = useMemo(() => (link || !names ? { kind: 'task' } : classify(value, { ...names, projects: projectNames }, today())), [value, link, names, projectNames])
  const intentKey = JSON.stringify(intent)
  const plan = useLiveQuery<CapturePlan | null>(() => planCapture(intent), [intentKey])
  // En la lista de un proyecto («añade llamar al seguro a la lista de Mudanza»): una tarea allí
  const listProject = intent.kind === 'projectTask' ? projects.find((p) => p.name === intent.project) : undefined
  const parsed = useMemo(
    () => parseQuickAdd(intent.kind === 'projectTask' ? intent.text : link ? link.rest : value, { areas, projects, people }),
    [value, link, intent, areas, projects, people],
  )
  // Una lista pegada: una tarea por línea
  const [bulk, setBulk] = useState<string[] | null>(initialLines.length > 1 ? initialLines : null)
  const bulkParsed = useMemo(() => bulk?.map((l) => ({ line: l, link: findUrl(l), p: parseQuickAdd(findUrl(l)?.rest ?? l, { areas, projects, people }) })), [bulk, areas, projects, people])
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

  const final = build(parsed)
  function build(parsed: ParsedTask): Partial<Task> {
  const final: Partial<Task> = { ...defaults, ...(listProject ? { projectId: listProject.id, areaId: listProject.areaId } : {}) }
  if (parsed.dueDate) final.dueDate = parsed.dueDate
  if (parsed.dueTime) final.dueTime = parsed.dueTime
  if (parsed.deadline) final.deadline = parsed.deadline
  if (parsed.someday) final.someday = true
  if (parsed.recurrence) final.recurrence = parsed.recurrence
  if (parsed.reminder) final.reminder = parsed.reminder
  if (parsed.estimate) final.estimate = parsed.estimate
  if (parsed.nag) final.nag = parsed.nag
  if (parsed.waitingFor) {
    final.waitingFor = parsed.waitingFor
    final.waitingSince = today()
  }
  if (parsed.people?.length) final.people = [...new Set([...(defaults?.people ?? []), ...parsed.people])]
  if (parsed.projectId) {
    final.projectId = parsed.projectId
    final.areaId = parsed.areaId
  } else if (parsed.areaId) {
    final.areaId = parsed.areaId
    final.projectId = undefined
  }
  return final
  }
  const destination = project(final.projectId)?.name ?? area(final.areaId)?.name
  const toInbox = !final.projectId && !final.areaId && !final.dueDate && !final.deadline && !final.someday

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

  const [saving, setSaving] = useState(false)
  /** La tarea de una línea: lo entendido y, si trae enlace, su título y el enlace en las notas */
  const taskOf = async (p: ParsedTask, url: string | undefined, extraNotes: string, getTitle: boolean) => {
    const title = url ? linkTask(p.title, url, !p.title && getTitle ? await fetchLinkTitle(url, !!user) : undefined).title : p.title
    return {
      ...build(p),
      title,
      notes: [extraNotes.trim(), url].filter(Boolean).join('\n'),
      priority: (p.priority || defaults?.priority || 0) as Task['priority'],
      tags: [...new Set([...(defaults?.tags ?? []), ...p.tags])],
    }
  }
  const submit = async (keepOpen: boolean) => {
    if (saving) return
    if (bulk && bulkParsed) {
      setSaving(true)
      const list = await Promise.all(bulkParsed.filter((b) => b.p.title || b.link).map((b) => taskOf(b.p, b.link?.url, '', true)))
      for (const t of list) await createTask(t)
      setSaving(false)
      toast(`${list.length} ${list.length === 1 ? 'tarea añadida' : 'tareas añadidas'}`)
      setBulk(null)
      setValue('')
      if (!keepOpen) ui.closeQuickAdd()
      return
    }
    // Con lo último de tus datos (por si se pulsa Intro antes de que se vea a dónde va)
    const now = !bulk && !link ? await planCapture(classify(value, { ...(await loadNames()), projects: projectNames }, today())) : null
    if (now) {
      setSaving(true)
      const r = await now.run()
      setSaving(false)
      haptic()
      toast(r.message, r.undo ? { label: 'Deshacer', run: () => void r.undo!() } : undefined)
      setValue('')
      if (!keepOpen) ui.closeQuickAdd()
      else inputRef.current?.focus()
      return
    }
    if (!parsed.title && !link) return
    setSaving(true)
    const task = await taskOf(parsed, link?.url, notes, true)
    setSaving(false)
    await createTask(task)
    const where = toInbox ? 'la Bandeja' : final.dueDate ? dateLabel(final.dueDate) : final.someday ? 'Algún día' : destination
    toast(`${link && !parsed.title ? `Añadido «${task.title}»` : 'Tarea añadida'}${where ? ` · ${where}` : ''}`)
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
            onPaste={(e) => {
              // Varias líneas pegadas: una tarea por línea (como en Things)
              const lines = listLines(e.clipboardData.getData('text')).filter((l) => !l.done)
              if (lines.length < 2) return
              e.preventDefault()
              setBulk(lines.map((l) => l.text))
            }}
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
          {!plan && (
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas"
              className="mt-1 w-full bg-transparent text-[15px] text-muted placeholder:text-faint"
            />
          )}
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
          {link && (
            <p className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[13px] font-semibold">
              <Link2 size={13} strokeWidth={2.4} className="shrink-0" />
              <span className="truncate">{hostOf(link.url)}</span>
              {!parsed.title && <span className="shrink-0 font-normal text-muted">· {user ? 'con el título de la página' : 'enlace en las notas'}</span>}
            </p>
          )}
          {bulk && bulkParsed && (
            <div className="mt-3 rounded-2xl bg-fill-2 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
                <ListPlus size={15} strokeWidth={2.4} /> {bulk.length} tareas, una por línea
                <button type="button" onClick={() => setBulk(null)} aria-label="No, solo una" className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg">
                  <X size={14} />
                </button>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Tareas que se van a crear">
                {bulkParsed.map((b, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[14.5px]">
                    <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {b.p.title || (b.link ? hostOf(b.link.url) : b.line)}
                      {b.p.title && b.link && <span className="text-muted"> · {hostOf(b.link.url)}</span>}
                    </span>
                    {b.p.dueDate && <span className="shrink-0 text-[12.5px] font-semibold text-muted">{dateLabel(b.p.dueDate)}{b.p.dueTime ? ` ${b.p.dueTime}` : ''}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan ? (
            // A dónde va, si no es una tarea
            <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[13px] font-semibold" data-capture-plan>
              <PlanIcon icon={plan.icon} />
              <span className="truncate">{plan.label}</span>
            </p>
          ) : (
            <ParsedChips parsed={parsed} className="mt-3" />
          )}
          {(dictation.listening || dictation.error) && (
            <p className={cx('mt-2 text-[13px] font-medium', dictation.error ? 'text-muted' : 'text-fg')}>{dictation.error ?? 'Te escucho… di la tarea como la escribirías: «llamar a Ana mañana a las 10»'}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 pt-1 pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-muted">
          {plan ? null : toInbox ? (
            <>
              <Inbox size={14} strokeWidth={2.3} /> Bandeja de entrada
            </>
          ) : (
            <span className="truncate">{[final.dueDate && `${dateLabel(final.dueDate)}${final.dueTime ? ` a las ${final.dueTime}` : ''}`, destination].filter(Boolean).join(' · ')}</span>
          )}
          <span className={cx('ml-auto hidden items-center gap-1 text-muted', !plan && 'md:flex')}>
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
          disabled={(!plan && !parsed.title && !link && !bulk) || saving}
          aria-label={bulk ? `Añadir ${bulk.length} tareas` : 'Añadir'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white transition-all active:scale-90 disabled:opacity-30 disabled:shadow-none"
        >
          <ArrowUp size={18} strokeWidth={2.8} />
        </button>
      </div>
    </form>
  )
}

/** Los nombres que deciden a dónde va lo escrito: hábitos, notas y listas de la compra */
async function loadNames() {
  return {
    habits: (await db.habits.toArray()).filter((h) => !h.archived).map((h) => h.name),
    notes: (await db.notes.toArray()).map((n) => n.title).filter(Boolean),
    lists: (((await db.settings.get('shoppingLists'))?.value as { name: string }[] | undefined) ?? []).map((l) => l.name),
  }
}

function PlanIcon({ icon }: { icon: CapturePlan['icon'] }) {
  const Glyph = { cart: ShoppingCart, wallet: Wallet, note: StickyNote, habit: Repeat, check: CheckCircle2, clock: History, box: Package }[icon]
  return <Glyph size={14} strokeWidth={2.4} className="shrink-0" aria-hidden />
}

function SuggestIcon({ s }: { s: Suggestion }) {
  if (s.kind === 'tag') return <Hash size={13} strokeWidth={2.6} aria-hidden />
  if (s.kind === 'person') return <AtSign size={13} strokeWidth={2.4} aria-hidden />
  if (s.kind === 'project') return <Folder size={13} strokeWidth={2.4} aria-hidden />
  return s.icon ? <Icon name={s.icon} size={13} strokeWidth={2.4} aria-hidden /> : <span aria-hidden>+</span>
}

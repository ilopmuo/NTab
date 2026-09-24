import { Fragment, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ArrowUp, Check, LogIn, RotateCcw, Sparkles } from 'lucide-react'
import { db } from '@/db/db'
import { createTask, toggleTask, updateTask } from '@/db/actions'
import { useLookup } from '@/db/hooks'
import type { Task } from '@/db/types'
import { dateLabel } from '@/lib/dates'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { openAuth, useSync } from '@/sync/service'
import { Button, Empty, Group, PageHeader, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { markApplied, resetChat, send, takePending, useChat, type ProposedChange, type ProposedTask, type Turn } from './chat'

const SUGGESTIONS = [
  '¿Qué tengo esta semana?',
  'Planifícame el día de hoy',
  '¿Qué tengo atrasado y qué hago con ello?',
  '¿En qué objetivos voy peor?',
  'Convierte este texto en tareas: ',
]

// ── Texto con formato mínimo (negrita, listas, títulos) ──────────

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <b key={i} className="font-semibold">
        {part.slice(2, -2)}
      </b>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const L = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <L key={blocks.length} className={cx('my-1.5 space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc marker:text-faint')}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </L>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    if (!line.trim()) continue
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    blocks.push(
      heading ? (
        <p key={blocks.length} className="mt-2 font-semibold">
          {inline(heading[1])}
        </p>
      ) : (
        <p key={blocks.length} className="my-1">
          {inline(line)}
        </p>
      ),
    )
  }
  flush()
  return <div className="text-[15px] leading-relaxed">{blocks}</div>
}

// ── Propuestas ────────────────────────────────────────────────

const PRIO = ['', '!', '!!', '!!!']
const when = (fecha?: string | null, hora?: string | null) =>
  [fecha ? dateLabel(fecha) : null, hora ?? null].filter(Boolean).join(' · ')

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-fill px-2 py-0.5 text-[12px] font-medium text-muted">{children}</span>
}

function TasksProposal({ turn }: { turn: Turn }) {
  const { projects } = useLookup()
  const tasks = turn.tasks!
  const [picked, setPicked] = useState(() => tasks.map(() => true))
  const count = picked.filter(Boolean).length
  const findProject = (name?: string) => {
    if (!name) return undefined
    const n = name.toLowerCase()
    return projects.find((p) => p.name.toLowerCase() === n) ?? projects.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()))
  }
  const apply = async () => {
    for (const [i, t] of tasks.entries()) {
      if (!picked[i]) continue
      const project = findProject(t.proyecto)
      await createTask({
        title: t.titulo,
        notes: t.notas ?? '',
        dueDate: t.fecha,
        dueTime: t.fecha ? t.hora : undefined,
        priority: (t.prioridad ?? 0) as Task['priority'],
        projectId: project?.id,
        areaId: project?.areaId,
      })
    }
    markApplied(turn.id)
    toast(count === 1 ? 'Tarea añadida' : `${count} tareas añadidas`)
  }
  return (
    <Group className="mt-3">
      {tasks.map((t: ProposedTask, i) => (
        <button
          key={i}
          type="button"
          disabled={turn.applied}
          onClick={() => setPicked(picked.map((p, j) => (j === i ? !p : p)))}
          className="flex w-full items-start gap-3 px-4 py-2.5 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover disabled:hover:bg-transparent"
        >
          <span
            className={cx(
              'mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border-[1.6px] transition-colors',
              turn.applied ? (picked[i] ? 'border-green bg-green text-on-green' : 'border-faint') : picked[i] ? 'border-accent bg-accent text-white' : 'border-faint',
            )}
          >
            {picked[i] && <Check size={12} strokeWidth={3.2} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx('block text-[15px]', !picked[i] && 'text-muted line-through')}>
              {t.prioridad ? <b className="mr-1 font-bold text-blue">{PRIO[t.prioridad]}</b> : null}
              {t.titulo}
            </span>
            {(t.fecha || t.hora || t.proyecto || t.notas) && (
              <span className="mt-1 flex flex-wrap gap-1">
                {(t.fecha || t.hora) && <Chip>{when(t.fecha, t.hora)}</Chip>}
                {t.proyecto && <Chip>{t.proyecto}</Chip>}
                {t.notas && <Chip>Con notas</Chip>}
              </span>
            )}
          </span>
        </button>
      ))}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 shadow-[inset_0_1px_0_var(--c-border)]">
        {turn.applied ? (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <Check size={14} strokeWidth={2.8} /> Añadidas
          </span>
        ) : (
          <Button size="sm" variant="primary" disabled={!count} onClick={() => void apply()}>
            Añadir {count === 1 ? '1 tarea' : `${count} tareas`}
          </Button>
        )}
      </div>
    </Group>
  )
}

function describeChange(c: ProposedChange) {
  if (c.hecha) return 'Hecha'
  const parts: string[] = []
  if (c.fecha !== undefined) parts.push(c.fecha ? dateLabel(c.fecha) : 'Sin fecha')
  if (c.hora !== undefined) parts.push(c.hora ?? 'sin hora')
  if (c.prioridad !== undefined) parts.push(['Sin prioridad', 'Prioridad baja', 'Prioridad media', 'Prioridad alta'][c.prioridad])
  return parts.join(' · ')
}

function ChangesProposal({ turn }: { turn: Turn }) {
  const changes = turn.changes!
  const [titles, setTitles] = useState<Record<string, string | null>>({})
  useEffect(() => {
    void db.tasks.bulkGet(changes.map((c) => c.id)).then((list) => setTitles(Object.fromEntries(changes.map((c, i) => [c.id, list[i]?.title ?? null]))))
  }, [changes])
  const valid = changes.filter((c) => titles[c.id] !== null)
  const apply = async () => {
    for (const c of valid) {
      const task = await db.tasks.get(c.id)
      if (!task) continue
      if (c.hecha) {
        if (!task.done) await toggleTask(task)
        continue
      }
      const patch: Partial<Task> = {}
      if (c.fecha !== undefined) patch.dueDate = c.fecha ?? undefined
      if (c.hora !== undefined) patch.dueTime = c.hora ?? undefined
      if (c.prioridad !== undefined) patch.priority = c.prioridad as Task['priority']
      if (patch.dueDate === undefined && c.fecha === null) patch.dueTime = undefined
      await updateTask(c.id, patch)
    }
    markApplied(turn.id)
    toast(valid.length === 1 ? 'Cambio aplicado' : `${valid.length} cambios aplicados`)
  }
  return (
    <Group className="mt-3">
      {changes.map((c) => (
        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[15px] shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
          <span className={cx('min-w-0 flex-1 truncate', titles[c.id] === null && 'text-faint line-through')}>{titles[c.id] ?? c.titulo ?? '…'}</span>
          <ArrowRight size={14} className="shrink-0 text-faint" />
          <span className={cx('shrink-0 text-[13px] font-semibold', c.hecha ? 'text-fg' : 'text-blue')}>{describeChange(c)}</span>
        </div>
      ))}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 shadow-[inset_0_1px_0_var(--c-border)]">
        {turn.applied ? (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <Check size={14} strokeWidth={2.8} /> Aplicados
          </span>
        ) : (
          <Button size="sm" variant="primary" disabled={!valid.length} onClick={() => void apply()}>
            Aplicar {valid.length === 1 ? 'el cambio' : `${valid.length} cambios`}
          </Button>
        )}
      </div>
    </Group>
  )
}

// ── Conversación ─────────────────────────────────────────────

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={softSpring} className="flex justify-end">
        <div className="max-w-[82%] rounded-[20px] rounded-br-[6px] bg-accent px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white">{turn.content}</div>
      </motion.div>
    )
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
        <Sparkles size={14} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        {turn.error ? <p className="text-[15px] font-medium text-fg">{turn.content}</p> : <Markdown text={turn.content} />}
        {turn.tasks && <TasksProposal turn={turn} />}
        {turn.changes && <ChangesProposal turn={turn} />}
      </div>
    </motion.div>
  )
}

function Thinking() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-fg">
        <Sparkles size={14} strokeWidth={2.4} />
      </span>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-faint"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
    </motion.div>
  )
}

export function AssistantView() {
  const sync = useSync()
  const chat = useChat()
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  // Pregunta hecha desde ⌘K (también si ya estabas en esta vista)
  useEffect(() => {
    if (!chat.pending || !sync.user) return
    const q = takePending()
    if (q) void send(q)
  }, [chat.pending, sync.user])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.turns.length, chat.loading])

  useEffect(() => {
    const el = input.current
    if (!el) return
    // Vacío: altura de una línea (el marcador de posición no debe estirarlo)
    el.style.height = ''
    if (!draft) return
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  const submit = () => {
    if (!draft.trim() || chat.loading) return
    void send(draft)
    setDraft('')
  }

  if (!sync.user) {
    return (
      <Page>
        <PageHeader icon={<SectionIcon def={section('assistant')} size={40} />} title="Asistente" />
        <Group>
          <Empty icon={<LogIn size={26} strokeWidth={2.2} />} color="var(--c-blue)" title="Inicia sesión para usar el asistente" hint="El asistente funciona a través de tu cuenta de NTab.">
            <Button variant="primary" onClick={openAuth}>
              Iniciar sesión
            </Button>
          </Empty>
        </Group>
      </Page>
    )
  }

  const empty = chat.turns.length === 0
  return (
    <Page className="flex min-h-full flex-col">
      <PageHeader
        icon={<SectionIcon def={section('assistant')} size={40} />}
        title="Asistente"
        subtitle="Pregúntale por tu semana, pídele que te organice el día o pégale un email."
        actions={
          !empty && (
            <Button variant="ghost" size="sm" onClick={resetChat} disabled={chat.loading}>
              <RotateCcw size={14} /> Nueva
            </Button>
          )
        }
      />

      <div className="flex-1 space-y-6 pb-6">
        {empty && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s.endsWith(': ')) {
                    setDraft(s)
                    input.current?.focus()
                  } else void send(s)
                }}
                className="glass rounded-full px-4 py-2 text-[14px] font-medium transition-transform active:scale-[0.97]"
              >
                {s.replace(/: $/, '…')}
              </button>
            ))}
          </motion.div>
        )}
        {chat.turns.map((t) => (
          <Bubble key={t.id} turn={t} />
        ))}
        <AnimatePresence>{chat.loading && <Thinking />}</AnimatePresence>
        <div ref={end} />
      </div>

      <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),10px)+72px)] z-10 -mx-4 bg-gradient-to-t from-bg from-60% to-transparent px-4 pt-6 pb-1 sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-10 lg:px-10 lg:pb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex items-end gap-2 rounded-[24px] bg-surface py-2 pr-2 pl-4 shadow-[var(--c-shadow)]"
        >
          <textarea
            ref={input}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Pregunta o pega un texto…"
            className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-snug text-fg placeholder:text-faint"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!draft.trim() || chat.loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-all active:scale-90 disabled:opacity-30"
          >
            <ArrowUp size={18} strokeWidth={2.6} />
          </button>
        </form>
        <p className="mt-1.5 text-center text-[11px] text-faint">Tus datos se envían a Claude (Anthropic) solo para responder. Revisa las propuestas antes de aplicarlas.</p>
      </div>
    </Page>
  )
}

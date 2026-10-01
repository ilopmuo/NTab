import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, ListPlus, Pin, PinOff, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { SectionIcon, section } from '@/app/sections'
import { db } from '@/db/db'
import { toastTrashed } from '../trash/undo'
import type { Note } from '@/db/types'
import { createNote, createTask, updateNote, deleteNote, renameNoteLinks, restoreNoteContents } from '@/db/actions'
import { useLookup } from '@/db/hooks'
import { href, navigate } from '@/app/router'
import { toast } from '@/app/store'
import { Empty, IconButton, Select, Textarea, cx, useMediaQuery } from '@/components/ui'
import { allNoteTags, groupNotes, noteTags, suggestLink } from '@/lib/notes'
import { LinkSuggestions, NoteConnections } from './NoteLinks'

/** Cuándo se tocó: la hora si es de hoy; si no, hace cuánto */
function noteWhen(t: number) {
  const d = new Date(t)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : formatDistanceToNow(t, { locale: es, addSuffix: false })
}

/** Primera línea con texto, sin las marcas de lista ni de casilla */
const preview = (content: string) =>
  content
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?#*\s*/, '').replace(/\[\[([^[\]\n]+?)\]\]/g, '$1').trim())
    .find(Boolean)
    ?.slice(0, 80) ?? ''

export function NotesView({ id }: { id?: string }) {
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), [])
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    // «#etiqueta» sola: las notas con esa etiqueta
    const tag = /^#[^\s#]+$/.test(s) ? s.slice(1) : undefined
    const all = (notes ?? []).filter((n) => !s || (tag ? noteTags(n.content).includes(tag) : n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s)))
    return [...all.filter((n) => n.pinned), ...all.filter((n) => !n.pinned)]
  }, [notes, q])
  const tags = useMemo(() => allNoteTags(notes ?? []).slice(0, 12), [notes])
  const current = notes?.find((n) => n.id === id)
  const narrow = useMediaQuery('(max-width: 767px)')
  const showTag = (t: string) => {
    setQ(`#${t}`)
    if (narrow) navigate('/notes')
  }

  const newNote = async () => {
    const n = await createNote()
    navigate(`/notes/${n.id}`)
  }

  if (!notes) return null

  return (
    <div className="flex h-full">
      <div className={cx('flex w-full flex-col md:w-[340px] md:shrink-0 md:shadow-[inset_-1px_0_0_var(--c-border)]', id && 'hidden md:flex')}>
        <div className="px-4 pt-[max(env(safe-area-inset-top),20px)] pb-3 lg:pt-10">
          <div className="mb-4 flex items-center gap-3">
            <SectionIcon def={section('notes')} size={36} />
            <h1 className="flex-1 text-[30px] font-bold tracking-[-0.025em]">Notas</h1>
            <IconButton label="Nueva nota" onClick={newNote} className="!bg-accent-fill !text-white">
              <Plus size={17} />
            </IconButton>
          </div>
          <div className="relative">
            <Search size={15} strokeWidth={2.3} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en notas"
              className="h-10 w-full rounded-[12px] bg-fill pr-3 pl-9 text-[15px] placeholder:text-muted"
            />
          </div>
          {tags.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Filtrar por etiqueta">
              {tags.map((t) => {
                const on = q.trim().toLowerCase() === `#${t}`
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setQ(on ? '' : `#${t}`)}
                    className={cx('h-7 shrink-0 rounded-full px-2.5 text-[13px] font-medium transition-colors', on ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-hover')}
                  >
                    #{t}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-36 lg:pb-4">
          {list.length === 0 &&
            (q || notes.length ? (
              <p className="px-3 py-6 text-center text-[13px] text-muted">Sin resultados</p>
            ) : (
              // Sin notas: en el móvil, el aviso con su botón (en el ordenador ya sale a la derecha)
              <div className="md:hidden">
                <Empty icon={<StickyNote size={28} strokeWidth={2.2} />} title="Aún no hay notas" hint="Ideas, apuntes de reuniones, listas, contraseñas del wifi…">
                  <button type="button" onClick={newNote} className="h-10 rounded-full bg-accent-fill px-5 text-[14px] font-semibold text-white transition-transform active:scale-95">
                    Crear nota
                  </button>
                </Empty>
              </div>
            ))}
          {groupNotes(list).map((g) => (
            <section key={g.title} className="mb-3">
              <h2 className="px-3.5 pt-2 pb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.title}</h2>
              {g.items.map((n) => (
                <a
                  key={n.id}
                  href={href(`/notes/${n.id}`)}
                  className={cx('mb-1 block rounded-[14px] px-3.5 py-3 transition-colors', n.id === id ? 'bg-fill' : 'hover:bg-hover')}
                >
                  <div className="flex items-center gap-1.5">
                    {!!n.pinned && <Pin size={12} className="shrink-0 text-muted" strokeWidth={2.6} />}
                    <span className="truncate text-[15px] font-semibold">{n.title || 'Sin título'}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    <span className="font-medium text-fg/70">{noteWhen(n.updatedAt)}</span>
                    {preview(n.content) && ` · ${preview(n.content)}`}
                  </p>
                </a>
              ))}
            </section>
          ))}
        </div>
      </div>

      <div className={cx('min-w-0 flex-1', !id && 'hidden md:block')}>
        {current ? (
          <NoteEditor key={current.id} note={current} notes={notes} onTag={showTag} />
        ) : (
          <Empty icon={<StickyNote size={28} strokeWidth={2.2} />} color="var(--c-yellow)" title={id ? 'Nota no encontrada' : notes.length ? 'Selecciona una nota' : 'Aún no hay notas'} hint="Ideas, apuntes de reuniones, listas, contraseñas del wifi…">
            <button type="button" onClick={newNote} className="h-10 rounded-full bg-accent-fill px-5 text-[14px] font-semibold text-white transition-transform active:scale-95">
              Crear nota
            </button>
          </Empty>
        )}
      </div>
    </div>
  )
}

function NoteEditor({ note, notes, onTag }: { note: Note; notes: Note[]; onTag: (tag: string) => void }) {
  const { areas, projects } = useLookup()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const dirty = useRef(false)

  // Enlaces: al escribir «[[» salen los títulos de las demás notas
  const [caret, setCaret] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const titles = useMemo(() => notes.filter((n) => n.id !== note.id && n.title.trim()).map((n) => n.title.trim()), [notes, note.id])
  const linking = caret === null ? undefined : suggestLink(content, caret, titles)
  const suggestions = linking && linking.start !== dismissed ? linking : undefined
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (pendingCaret.current === null || !el) return
    el.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  })
  const pick = (t: string) => {
    if (!suggestions) return
    const insert = `[[${t}]]`
    dirty.current = true
    setContent(content.slice(0, suggestions.start) + insert + content.slice(suggestions.end))
    const at = suggestions.start + insert.length
    pendingCaret.current = at
    setCaret(at)
    setActive(0)
  }

  useEffect(() => {
    if (!note.title && !note.content) titleRef.current?.focus()
  }, [note.title, note.content])

  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => updateNote(note.id, { title, content }), 350)
    return () => clearTimeout(t)
  }, [title, content, note.id])

  const latest = useRef({ title, content })
  latest.current = { title, content }

  // Renombrar: los [[enlaces]] de las demás notas siguen apuntando aquí
  const linkedTitle = useRef(note.title)
  const syncLinks = async () => {
    const from = linkedTitle.current
    const to = latest.current.title.trim()
    if (!to || from.trim() === to) return
    linkedTitle.current = to
    const changed = await renameNoteLinks(note.id, from, to)
    if (changed.length)
      toast(`Enlaces actualizados en ${changed.length} ${changed.length === 1 ? 'nota' : 'notas'}`, { label: 'Deshacer', run: () => void restoreNoteContents(changed) })
  }
  const syncRef = useRef(syncLinks)
  syncRef.current = syncLinks

  // Al salir: guardar lo pendiente y borrar la nota si quedó vacía
  useEffect(
    () => () => {
      void syncRef.current()
      if (dirty.current) void updateNote(note.id, latest.current)
      setTimeout(() => {
        if (window.location.hash.includes(note.id)) return
        void db.notes.get(note.id).then((n) => {
          if (n && !n.title.trim() && !n.content.trim()) void db.notes.delete(n.id)
        })
      }, 500)
    },
    [note.id],
  )

  const assign = note.projectId ? `p:${note.projectId}` : note.areaId ? `a:${note.areaId}` : ''

  /** Convierte las líneas "- [ ] algo" en tareas reales */
  const extractTasks = async () => {
    const lines = content.split('\n')
    let n = 0
    const next = []
    for (const line of lines) {
      const m = line.match(/^\s*[-*]\s*\[\s\]\s+(.+)$/)
      if (m) {
        await createTask({ title: m[1].trim(), projectId: note.projectId, areaId: note.areaId })
        next.push(line.replace('[ ]', '[x]'))
        n++
      } else next.push(line)
    }
    if (!n) return toast('Escribe líneas como "- [ ] Llamar a Juan" para convertirlas en tareas')
    dirty.current = true
    setContent(next.join('\n'))
    toast(`${n} ${n === 1 ? 'tarea creada' : 'tareas creadas'}`)
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-5 pt-[max(env(safe-area-inset-top),16px)] pb-36 lg:px-10 lg:pt-10 lg:pb-10">
      <div className="mb-4 flex items-center gap-1">
        <a href={href('/notes')} className="mr-1 flex items-center gap-0.5 rounded-lg py-1.5 pr-2 text-[16px] font-medium text-blue md:hidden" aria-label="Volver">
          <ArrowLeft size={18} strokeWidth={2.4} /> Notas
        </a>
        <Select
          value={assign}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return updateNote(note.id, { areaId: undefined, projectId: undefined })
            const id = v.slice(2)
            if (v[0] === 'a') return updateNote(note.id, { areaId: id, projectId: undefined })
            updateNote(note.id, { projectId: id, areaId: projects.find((p) => p.id === id)?.areaId })
          }}
          className="h-8 w-auto max-w-52 rounded-full pr-8 text-[13px] font-medium"
        >
          <option value="">Sin clasificar</option>
          {areas.map((a) => (
            <option key={a.id} value={`a:${a.id}`}>
              {a.name}
            </option>
          ))}
          {projects
            .filter((p) => p.status !== 'done')
            .map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                ↳ {p.name}
              </option>
            ))}
        </Select>
        <span className="ml-2 hidden text-[12px] text-muted sm:inline">
          Editada {formatDistanceToNow(note.updatedAt, { locale: es, addSuffix: true })}
        </span>
        <div className="ml-auto flex">
          <IconButton label="Convertir [ ] en tareas" onClick={extractTasks}>
            <ListPlus size={16} />
          </IconButton>
          <IconButton label={note.pinned ? 'Desfijar' : 'Fijar'} onClick={() => updateNote(note.id, { pinned: note.pinned ? 0 : 1 })}>
            {note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </IconButton>
          <IconButton
            label="Eliminar nota"
            className="hover:!text-red"
            onClick={async () => {
              // Guardar lo último escrito antes de mandarla a la papelera
              await db.notes.update(note.id, { title, content })
              await deleteNote(note.id)
              navigate('/notes')
              toastTrashed('Nota en la papelera', 'notes', note.id)
            }}
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => {
          dirty.current = true
          setTitle(e.target.value)
        }}
        onBlur={() => void syncLinks()}
        aria-label="Título de la nota"
        placeholder="Título"
        className="mb-3 w-full bg-transparent text-[30px] font-bold tracking-[-0.02em] placeholder:text-faint"
      />
      <Textarea
        ref={bodyRef}
        aria-label="Texto de la nota"
        value={content}
        onChange={(e) => {
          dirty.current = true
          setContent(e.target.value)
          setCaret(e.target.selectionStart)
          setActive(0)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onBlur={() => setCaret(null)}
        onKeyDown={(e) => {
          if (!suggestions) return
          const n = suggestions.items.length
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            pick(suggestions.items[Math.min(active, n - 1)])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setDismissed(suggestions.start)
          }
        }}
        aria-controls={suggestions ? 'note-link-suggestions' : undefined}
        aria-activedescendant={suggestions ? `note-link-${Math.min(active, suggestions.items.length - 1)}` : undefined}
        placeholder={'Empieza a escribir…\n\nTrucos: «- [ ] algo» se convierte en tarea con el botón de lista; [[Otra nota]] la enlaza; #etiqueta la clasifica.'}
        className="min-h-[50vh] flex-1 text-[17px] leading-[1.65]"
      />
      {suggestions && <LinkSuggestions items={suggestions.items} active={Math.min(active, suggestions.items.length - 1)} onPick={pick} />}
      <NoteConnections note={note} title={title} content={content} notes={notes} onTag={onTag} />
    </div>
  )
}

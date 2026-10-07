import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { BookOpen, ChevronLeft, Image as ImageIcon, LayoutTemplate, ListChecks, ListPlus, PenLine, Pin, PinOff, Plus, Search, Share, StickyNote, Trash2 } from 'lucide-react'
import { SectionIcon, section } from '@/app/sections'
import { pageTop } from '@/app/pageTop'
import { db } from '@/db/db'
import { toastTrashed } from '../trash/undo'
import type { Note } from '@/db/types'
import { createTask, setSetting } from '@/db/actions'
import { createNote, notesCreatedHere, updateNote, deleteNote, renameNoteLinks, restoreNoteContents } from '@/db/moreActions'
import { checkItem, openChecklist, sameLine } from '@/lib/ripples'
import { setNoteLineTask } from '@/db/ripples'
import { loadParser } from '@/lib/useParser'
import { today } from '@/lib/dates'
import { useLookup } from '@/db/hooks'
import { goBack, href, navigate } from '@/app/router'
import { toast } from '@/app/store'
import { Empty, IconButton, cx, useMediaQuery } from '@/components/ui'
import { Select, Textarea } from '@/components/form'
import { Progressive } from '@/components/Progressive'
import { allNoteTags, groupNotes, noteTags, suggestLink } from '@/lib/notes'
import { LinkSuggestions, NoteConnections, NoteTasks } from './NoteLinks'
import { NoteReader } from './NoteReader'
import { ChecklistBar, FormatBar, MAX_PHOTOS, NotePhotos, type FormatAction } from './NoteTools'
import { TemplatePicker } from './NoteTemplates'
import { checklistStats, noteMarkdown, setAllChecks, sortChecked, toggleCheck } from '@/lib/noteFormat'
import { continueList, toggleLinePrefix, wrapSelection, type Edit } from '@/lib/noteEdit'
import { primeKeyboard } from '@/lib/viewport'

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
    // La nota nueva se abre para escribir: el teclado, ya en el toque
    primeKeyboard()
    const n = await createNote()
    navigate(`/notes/${n.id}`)
  }
  const [templates, setTemplates] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  if (!notes) return null

  return (
    <div className="flex h-full">
      <div className={cx('flex w-full flex-col md:w-[340px] md:shrink-0 md:shadow-[inset_-1px_0_0_var(--c-border)]', id && 'hidden md:flex')}>
        <div className="px-4 pt-[max(env(safe-area-inset-top),20px)] pb-3 lg:pt-10">
          {pageTop.Component && <pageTop.Component anyDepth />}
          <div className="mb-4 flex items-center gap-3">
            <SectionIcon def={section('notes')} size={36} />
            <h1 className="flex-1 text-[30px] font-bold tracking-[-0.025em]">Notas</h1>
            <IconButton label="Plantillas de notas" onClick={() => setTemplates(true)} filled>
              <LayoutTemplate size={16} />
            </IconButton>
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
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 pb-36 md:pb-4">
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
          {/* Cientos de notas: se pintan por tramos según se baja */}
          <Progressive
            root={listRef}
            items={groupNotes(list).flatMap((g): { key: string; head?: string; note?: Note }[] => [{ key: `h:${g.title}`, head: g.title }, ...g.items.map((n) => ({ key: n.id, note: n }))])}
            weight={() => 1}
            render={(x) =>
              x.note ? (
                <NoteRow key={x.key} note={x.note} active={x.note.id === id} />
              ) : (
                <h2 key={x.key} className="px-3.5 pt-3 pb-1 text-[12px] font-semibold tracking-wide text-muted uppercase first:pt-2">
                  {x.head}
                </h2>
              )
            }
          />
        </div>
      </div>

      <TemplatePicker open={templates} onClose={() => setTemplates(false)} />
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

/** Una nota en la lista: título, cuándo, cómo va su lista y la primera línea */
const NoteRow = memo(function NoteRow({ note: n, active }: { note: Note; active: boolean }) {
  const first = preview(n.content)
  return (
    <a href={href(`/notes/${n.id}`)} className={cx('row-lazy mb-1 block rounded-[14px] px-3.5 py-3 transition-colors', active ? 'bg-fill' : 'hover:bg-hover')}>
      <div className="flex items-center gap-1.5">
        {!!n.pinned && <Pin size={12} className="shrink-0 text-muted" strokeWidth={2.6} />}
        <span className="truncate text-[15px] font-semibold">{n.title || 'Sin título'}</span>
      </div>
      <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted">
        <span className="shrink-0 font-medium text-fg/70">{noteWhen(n.updatedAt)}</span>
        <ListProgress content={n.content} />
        {!!n.images?.length && <ImageIcon size={12} strokeWidth={2.4} className="shrink-0" aria-label="Con fotos" />}
        <span className="truncate">{first && ` · ${first}`}</span>
      </p>
    </a>
  )
},
// Dexie da objetos nuevos en cada consulta: la fila solo se repinta si la nota cambió
(a, b) => a.active === b.active && a.note.updatedAt === b.note.updatedAt && a.note.id === b.note.id && a.note.pinned === b.note.pinned)

/** «☑ 3/7» en la lista: cómo va la lista de casillas de la nota */
function ListProgress({ content }: { content: string }) {
  const { done, total } = checklistStats(content)
  if (!total) return null
  return (
    <span className={cx('font-num inline-flex shrink-0 items-center gap-0.5 font-semibold', done === total ? 'text-blue' : 'text-fg/70')} aria-label={`${done} de ${total} marcadas`}>
      <ListChecks size={12} strokeWidth={2.4} aria-hidden />
      {done}/{total}
    </span>
  )
}

function NoteEditor({ note, notes, onTag }: { note: Note; notes: Note[]; onTag: (tag: string) => void }) {
  const { areas, projects, people } = useLookup()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const dirty = useRef(false)
  // Con texto, se abre para leer (con formato y casillas que se marcan); vacía o recién creada, para escribir
  const [mode, setMode] = useState<'read' | 'edit'>(() => (note.content.trim() && !notesCreatedHere.has(note.id) ? 'read' : 'edit'))
  const sortOn = useLiveQuery(() => db.settings.get('noteSortChecked').then((r) => !!r?.value), []) ?? false
  const images = note.images ?? []
  const stats = checklistStats(content)
  const pendingSel = useRef<[number, number] | null>(null)
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!pendingSel.current || !el) return
    el.focus()
    el.setSelectionRange(...pendingSel.current)
    pendingSel.current = null
  })
  const change = (next: string) => {
    dirty.current = true
    setContent(next)
  }
  const applyEdit = (e: Edit) => {
    change(e.value)
    pendingSel.current = [e.start, e.end]
    setCaret(e.start)
  }
  const format = (a: FormatAction) => {
    const el = bodyRef.current
    const start = el?.selectionStart ?? content.length
    const end = el?.selectionEnd ?? content.length
    applyEdit(a === 'bold' ? wrapSelection(content, start, end) : toggleLinePrefix(content, start, a === 'check' ? '- [ ] ' : a === 'list' ? '- ' : '## '))
  }
  const toggleLine = (line: number) => {
    const item = checkItem(content.split('\n')[line] ?? '')
    const next = toggleCheck(content, line)
    change(sortOn ? sortChecked(next) : next)
    // Si la casilla es una tarea, se hace (o se reabre) también
    if (item) void setNoteLineTask(note.id, item.text, !item.done)
  }
  const write = () => {
    setMode('edit')
    pendingSel.current = [content.length, content.length]
  }
  const share = async () => {
    const md = noteMarkdown(title, content)
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Nota', text: md })
      } catch {
        /* cancelado */
      }
      return
    }
    await navigator.clipboard?.writeText(md)
    toast('Nota copiada en Markdown')
  }

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

  // Si la nota cambia desde fuera (al hacer una de sus tareas se marca su casilla;
  // Claude o Siri le añaden algo) y aquí no hay nada sin guardar, se ve al momento
  const stored = useRef(note.content)
  useEffect(() => {
    const before = stored.current
    stored.current = note.content
    if (note.content !== before && latest.current.content === before) setContent(note.content)
  }, [note.content])

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

  /**
   * Las casillas sin marcar pasan a tareas de verdad (con sus fechas, @personas y
   * #etiquetas, en la lista de la nota). Quedan enlazadas: al hacer la tarea se
   * marca aquí su casilla, y una casilla que ya es tarea no se repite.
   */
  const extractTasks = async () => {
    const linked = (await db.tasks.filter((t) => t.source?.noteId === note.id).toArray()).map((t) => t.source!.line)
    const lines = openChecklist(content).filter((l) => !linked.some((x) => sameLine(x, l)))
    if (!lines.length) return toast(linked.length ? 'Todas las casillas ya son tareas' : 'Escribe líneas como "- [ ] Llamar a Juan" para convertirlas en tareas')
    const parseQuickAdd = await loadParser()
    const created: string[] = []
    for (const line of lines) {
      const { title, projectId, areaId, waitingFor, ...rest } = parseQuickAdd(line, { areas, projects, people })
      const t = await createTask({
        ...rest,
        title: title || line,
        source: { noteId: note.id, line },
        projectId: projectId ?? note.projectId,
        areaId: projectId ? areaId : (areaId ?? note.areaId),
        ...(waitingFor ? { waitingFor, waitingSince: today() } : {}),
      })
      created.push(t.id)
    }
    toast(`${created.length} ${created.length === 1 ? 'tarea creada' : 'tareas creadas'}: al hacerlas se marcan aquí`, { label: 'Deshacer', run: () => void db.tasks.bulkDelete(created) })
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-5 pt-[max(env(safe-area-inset-top),16px)] pb-36 md:pb-10 lg:px-10 lg:pt-10">
      <div className="mb-4 flex items-center gap-1">
        {/* Como en Notas de iOS: vuelve a la lista con su animación */}
        <button type="button" onClick={() => goBack('/notes')} className="mr-1 -ml-1.5 flex items-center rounded-lg py-1.5 pr-2 text-[17px] font-medium text-blue active:opacity-50 md:hidden" aria-label="Volver a Notas">
          <ChevronLeft size={26} strokeWidth={2.4} className="-mr-0.5" /> Notas
        </button>
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
          <IconButton label={mode === 'read' ? 'Escribir' : 'Leer con formato'} onClick={() => (mode === 'read' ? write() : setMode('read'))}>
            {mode === 'read' ? <PenLine size={16} /> : <BookOpen size={16} />}
          </IconButton>
          <IconButton label="Compartir" onClick={() => void share()}>
            <Share size={15} />
          </IconButton>
          <IconButton label="Pasar la lista a tareas" onClick={extractTasks}>
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
      {mode === 'read' ? (
        <>
          {stats.total > 0 && (
            <ChecklistBar
              done={stats.done}
              total={stats.total}
              sortOn={sortOn}
              onSort={(v) => {
                void setSetting('noteSortChecked', v)
                if (v) change(sortChecked(content))
              }}
              onUncheckAll={() => {
                const before = content
                change(setAllChecks(content, false))
                toast('Todo desmarcado', { label: 'Deshacer', run: () => change(before) })
              }}
            />
          )}
          {content.trim() ? (
            <NoteReader content={content} note={note} notes={notes} onToggle={toggleLine} onEdit={write} onTag={onTag} />
          ) : (
            <button type="button" onClick={write} className="min-h-[30vh] text-left text-[17px] text-faint">
              Empieza a escribir…
            </button>
          )}
        </>
      ) : (
        <>
          <FormatBar
            onFormat={format}
            photos={images.length}
            onPhoto={(url) => {
              if (images.length >= MAX_PHOTOS) return toast(`Como mucho ${MAX_PHOTOS} fotos por nota`)
              void updateNote(note.id, { images: [...images, url] })
            }}
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
              if (!suggestions) {
                // Intro en una lista: la siguiente línea sigue la lista (o la acaba si está vacía)
                const el = e.currentTarget
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && el.selectionStart === el.selectionEnd) {
                  const r = continueList(content, el.selectionStart)
                  if (r) {
                    e.preventDefault()
                    applyEdit(r)
                  }
                }
                return
              }
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
        </>
      )}
      <NotePhotos
        images={images}
        editing={mode === 'edit'}
        onRemove={(i) => {
          void updateNote(note.id, { images: images.filter((_, j) => j !== i) })
          toast('Foto quitada', { label: 'Deshacer', run: () => void updateNote(note.id, { images }) })
        }}
      />
      <NoteTasks noteId={note.id} />
      <NoteConnections note={note} title={title} content={content} notes={notes} onTag={onTag} />
    </div>
  )
}

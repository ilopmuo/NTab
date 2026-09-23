import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, ListPlus, Pin, PinOff, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { SectionIcon, section } from '@/app/sections'
import { db } from '@/db/db'
import type { Note } from '@/db/types'
import { createNote, createTask, updateNote } from '@/db/actions'
import { useLookup } from '@/db/hooks'
import { href, navigate } from '@/app/router'
import { toast } from '@/app/store'
import { Empty, IconButton, Select, Textarea, cx } from '@/components/ui'

export function NotesView({ id }: { id?: string }) {
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), [])
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const all = (notes ?? []).filter((n) => !s || n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s))
    return [...all.filter((n) => n.pinned), ...all.filter((n) => !n.pinned)]
  }, [notes, q])
  const current = notes?.find((n) => n.id === id)

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
            <IconButton label="Nueva nota" onClick={newNote} className="!bg-accent !text-white">
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
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-36 lg:pb-4">
          {list.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-faint">{q ? 'Sin resultados' : 'Ninguna nota todavía'}</p>}
          {list.map((n) => (
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
                <span className="font-medium text-fg/70">{formatDistanceToNow(n.updatedAt, { locale: es, addSuffix: false })}</span>
                {n.content && ` · ${n.content.slice(0, 80)}`}
              </p>
            </a>
          ))}
        </div>
      </div>

      <div className={cx('min-w-0 flex-1', !id && 'hidden md:block')}>
        {current ? (
          <NoteEditor key={current.id} note={current} />
        ) : (
          <Empty icon={<StickyNote size={28} strokeWidth={2.2} />} color="var(--c-yellow)" title={id ? 'Nota no encontrada' : 'Selecciona una nota'} hint="Ideas, apuntes de reuniones, listas, contraseñas del wifi…">
            <button type="button" onClick={newNote} className="h-10 rounded-full bg-accent px-5 text-[14px] font-semibold text-white transition-transform active:scale-95">
              Crear nota
            </button>
          </Empty>
        )}
      </div>
    </div>
  )
}

function NoteEditor({ note }: { note: Note }) {
  const { areas, projects } = useLookup()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const titleRef = useRef<HTMLInputElement>(null)
  const dirty = useRef(false)

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

  // Al salir: guardar lo pendiente y borrar la nota si quedó vacía
  useEffect(
    () => () => {
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
        <span className="ml-2 hidden text-[12px] text-faint sm:inline">
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
              const copy = { ...note, title, content }
              await db.notes.delete(note.id)
              navigate('/notes')
              toast('Nota eliminada', { label: 'Deshacer', run: () => void db.notes.add(copy) })
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
        placeholder="Título"
        className="mb-3 w-full bg-transparent text-[30px] font-bold tracking-[-0.02em] placeholder:text-faint"
      />
      <Textarea
        value={content}
        onChange={(e) => {
          dirty.current = true
          setContent(e.target.value)
        }}
        placeholder={'Empieza a escribir…\n\nTruco: escribe "- [ ] algo" y pulsa el botón de lista para convertirlo en tarea.'}
        className="min-h-[50vh] flex-1 text-[17px] leading-[1.65]"
      />
    </div>
  )
}

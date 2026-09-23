import { Command, defaultFilter } from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import {
  Archive,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Inbox,
  Keyboard,
  NotebookPen,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  Star,
  SunMoon,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import { createNote } from '@/db/actions'
import { downloadBackup } from '@/db/backup'
import { dateLabel } from '@/lib/dates'
import { navigate } from '@/app/router'
import { ui, useUI } from '@/app/store'
import { toggleTheme } from '@/app/theme'
import { Icon } from './icons'
import { Kbd, Modal } from './ui'

export const NAV = [
  { path: '/today', label: 'Hoy', icon: Star, key: 'H' },
  { path: '/inbox', label: 'Bandeja de entrada', icon: Inbox, key: 'I' },
  { path: '/upcoming', label: 'Próximo', icon: CalendarRange, key: 'U' },
  { path: '/calendar', label: 'Calendario', icon: CalendarDays, key: 'C' },
  { path: '/habits', label: 'Hábitos', icon: Sparkles, key: 'B' },
  { path: '/notes', label: 'Notas', icon: NotebookPen, key: 'O' },
  { path: '/people', label: 'Personas', icon: Users, key: 'P' },
  { path: '/projects', label: 'Proyectos', icon: Folder, key: 'J' },
  { path: '/review', label: 'Revisión semanal', icon: RefreshCcw, key: 'R' },
  { path: '/logbook', label: 'Completadas', icon: Archive, key: 'L' },
  { path: '/settings', label: 'Ajustes', icon: Settings, key: 'S' },
] as const

function Item({
  onSelect,
  icon,
  children,
  hint,
  value,
  keywords,
}: {
  onSelect: () => void
  icon: React.ReactNode
  children: React.ReactNode
  hint?: React.ReactNode
  value: string
  /** si se indican, la búsqueda usa solo estas palabras (y no el value, que puede ser un id) */
  keywords?: string[]
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[13.5px] text-fg data-[selected=true]:bg-accent-soft"
    >
      <span className="flex w-4 shrink-0 justify-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[12px] text-faint">{hint}</span>}
    </Command.Item>
  )
}

/** Puntuación de cmdk sin las coincidencias difusas demasiado débiles (letras sueltas repartidas) */
function score(text: string, search: string) {
  const s = defaultFilter(text, search)
  return s < 0.05 ? 0 : s
}

const groupCls =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase'

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  return (
    <Modal open={open} onClose={() => ui.palette(false)} className="max-w-xl">
      {open && <Palette />}
    </Modal>
  )
}

function Palette() {
  const [search, setSearch] = useState('')
  const { areas, projects } = useLookup()
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const go = (path: string) => {
    ui.palette(false)
    navigate(path)
  }
  const run = (fn: () => void) => () => {
    ui.palette(false)
    fn()
  }
  const q = search.trim()
  const hasResults = useMemo(() => {
    if (!q) return true
    const values = [
      ...NAV.map((n) => `ir ${n.label}`),
      ...areas.map((a) => `área ${a.name}`),
      ...projects.map((p) => `proyecto ${p.name}`),
      ...tasks.map((t) => [t.title, ...t.tags].join(' ')),
      ...notes.map((n) => `${n.title} ${n.content.slice(0, 200)}`),
      ...people.map((p) => `${p.name} ${p.company}`),
      'nueva tarea añadir crear nota proyecto hábito persona contacto cambiar tema oscuro claro exportar copia de seguridad backup atajos teclado ayuda',
    ]
    return values.some((v) => score(v, q) > 0)
  }, [q, areas, projects, tasks, notes, people])

  return (
    <Command
      loop
      label="Paleta de comandos"
      className="flex max-h-[60vh] flex-col"
      filter={(value, search, keywords) => score(keywords?.length ? keywords.join(' ') : value, search)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && q) {
          e.preventDefault()
          ui.quickAdd(undefined, q)
        }
      }}
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={17} className="shrink-0 text-muted" />
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder="Busca tareas, notas, personas… o escribe un comando"
          className="h-13 w-full bg-transparent text-[15px] placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="overflow-y-auto p-2">
        <Command.Empty className="py-10 text-center text-[13px] text-muted">
          Nada por aquí.
        </Command.Empty>

        <Command.Group heading="Acciones" className={groupCls}>
          <Item value="nueva tarea añadir crear" icon={<Plus size={15} />} onSelect={run(() => ui.quickAdd())} hint={<Kbd>N</Kbd>}>
            Nueva tarea
          </Item>
          <Item
            value="nueva nota crear"
            icon={<FileText size={15} />}
            onSelect={run(async () => {
              const n = await createNote()
              navigate(`/notes/${n.id}`)
            })}
          >
            Nueva nota
          </Item>
          <Item value="nuevo proyecto crear" icon={<FolderPlus size={15} />} onSelect={run(() => (navigate('/projects'), ui.create('project')))}>
            Nuevo proyecto
          </Item>
          <Item value="nuevo hábito crear" icon={<Sparkles size={15} />} onSelect={run(() => (navigate('/habits'), ui.create('habit')))}>
            Nuevo hábito
          </Item>
          <Item value="nueva persona contacto crear" icon={<UserPlus size={15} />} onSelect={run(() => (navigate('/people'), ui.create('person')))}>
            Nueva persona
          </Item>
          <Item value="cambiar tema oscuro claro" icon={<SunMoon size={15} />} onSelect={run(toggleTheme)}>
            Cambiar tema claro / oscuro
          </Item>
          <Item value="exportar copia de seguridad backup" icon={<Download size={15} />} onSelect={run(() => void downloadBackup())}>
            Exportar copia de seguridad
          </Item>
          <Item value="atajos teclado ayuda" icon={<Keyboard size={15} />} onSelect={run(() => ui.help())} hint={<Kbd>?</Kbd>}>
            Atajos de teclado
          </Item>
        </Command.Group>

        <Command.Group heading="Ir a" className={groupCls}>
          {NAV.map((n) => (
            <Item key={n.path} value={`ir ${n.label}`} icon={<n.icon size={15} />} onSelect={() => go(n.path)} hint={<span className="flex gap-1"><Kbd>G</Kbd><Kbd>{n.key}</Kbd></span>}>
              {n.label}
            </Item>
          ))}
          {areas.map((a) => (
            <Item key={a.id} value={`a:${a.id}`} keywords={['área', a.name]} icon={<Icon name={a.icon} size={15} style={{ color: a.color }} />} onSelect={() => go(`/area/${a.id}`)} hint="Área">
              {a.name}
            </Item>
          ))}
          {projects.map((p) => (
            <Item key={p.id} value={`pr:${p.id}`} keywords={['proyecto', p.name]} icon={<Folder size={15} style={{ color: p.color }} />} onSelect={() => go(`/project/${p.id}`)} hint="Proyecto">
              {p.name}
            </Item>
          ))}
        </Command.Group>

        {q && (
          <>
            <Command.Group heading="Tareas" className={groupCls}>
              {tasks.slice(0, 500).map((t) => (
                <Item
                  key={t.id}
                  value={`t:${t.id}`}
                  keywords={[t.title, ...t.tags]}
                  icon={t.done ? <CheckCircle2 size={15} className="text-lime" /> : <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-line-strong" />}
                  onSelect={run(() => ui.openTask(t.id))}
                  hint={t.dueDate ? dateLabel(t.dueDate) : undefined}
                >
                  <span className={t.done ? 'text-muted line-through' : ''}>{t.title}</span>
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Notas" className={groupCls}>
              {notes.map((n) => (
                <Item key={n.id} value={`n:${n.id}`} keywords={[n.title, n.content.slice(0, 200)]} icon={<FileText size={15} />} onSelect={() => go(`/notes/${n.id}`)}>
                  {n.title || 'Sin título'}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Personas" className={groupCls}>
              {people.map((p) => (
                <Item key={p.id} value={`p:${p.id}`} keywords={[p.name, p.company]} icon={<User size={15} />} onSelect={() => go(`/people/${p.id}`)} hint={p.company}>
                  {p.name}
                </Item>
              ))}
            </Command.Group>
            {!hasResults && (
              <Command.Group heading="Sin resultados" className={groupCls}>
                <Item value={`crear nueva tarea ${q}`} icon={<Plus size={15} />} onSelect={run(() => ui.quickAdd(undefined, q))} hint="Tarea">
                  Crear tarea «{q}»
                </Item>
              </Command.Group>
            )}
          </>
        )}
      </Command.List>
      {q && hasResults && (
        <button
          type="button"
          onClick={run(() => ui.quickAdd(undefined, q))}
          className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-left text-[12.5px] text-muted hover:text-fg"
        >
          <Plus size={13} /> <span className="min-w-0 flex-1 truncate">Crear tarea «{q}»</span>
          <span className="flex gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
        </button>
      )}
    </Command>
  )
}

import { Command, defaultFilter } from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  FolderPlus,
  Keyboard,
  Plus,
  Search,
  Sparkles,
  Sun,
  SunMoon,
  Target,
  User,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import { createNote } from '@/db/actions'
import { downloadBackup } from '@/db/backup'
import { dateLabel } from '@/lib/dates'
import { navigate } from '@/app/router'
import { ui, useUI } from '@/app/store'
import { toggleTheme } from '@/app/theme'
import { AreaBadge } from './icons'
import { Kbd, Modal } from './ui'
import { SECTIONS, SectionIcon, tint, type Tint } from '@/app/sections'


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
      className="group flex h-11 cursor-default items-center gap-3 rounded-[12px] px-2.5 text-[15px] text-fg transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-white"
    >
      <span className="flex w-7 shrink-0 justify-center text-muted group-data-[selected=true]:text-white">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[13px] text-faint group-data-[selected=true]:text-white/75">{hint}</span>}
    </Command.Item>
  )
}

/** Icono cuadrado de color para las acciones */
function G({ c, children }: { c: Tint; children: React.ReactNode }) {
  return (
    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-fill text-fg" data-tint={c}>
      {children}
    </span>
  )
}

const fold = (x: string) =>
  x
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/**
 * Como Spotlight: cada palabra buscada debe ser el principio de alguna palabra
 * del texto (sin importar acentos). Así "trab" encuentra "Trabajo" y no
 * letras sueltas repartidas por "exporTaR copia... bAckup".
 */
function score(text: string, search: string) {
  const words = fold(text).split(/[^a-z0-9ñ#]+/).filter(Boolean)
  const terms = fold(search).split(/\s+/).filter(Boolean)
  if (!terms.length) return 1
  if (!terms.every((t) => words.some((w) => w.startsWith(t)))) return 0
  return Math.max(0.1, defaultFilter(fold(text), fold(search)))
}

const groupCls =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-muted'

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
      ...SECTIONS.map((n) => `ir ${n.label}`),
      ...areas.map((a) => `área ${a.name}`),
      ...projects.map((p) => `proyecto ${p.name}`),
      ...tasks.map((t) => [t.title, ...t.tags].join(' ')),
      ...notes.map((n) => `${n.title} ${n.content.slice(0, 200)}`),
      ...people.map((p) => `${p.name} ${p.company}`),
      'plantilla planificar dia nueva tarea añadir crear nota proyecto hábito persona contacto objetivo meta pago suscripción recibo claude conector cambiar tema oscuro claro exportar copia de seguridad backup atajos teclado ayuda',
    ]
    return values.some((v) => score(v, q) > 0)
  }, [q, areas, projects, tasks, notes, people])

  return (
    <Command
      loop
      label="Paleta de comandos"
      className="flex max-h-[64vh] flex-col"
      filter={(value, search, keywords) => score(keywords?.length ? keywords.join(' ') : value, search)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && q) {
          e.preventDefault()
          ui.quickAdd(undefined, q)
        }
      }}
    >
      <div className="flex items-center gap-3 px-5 shadow-[inset_0_-1px_0_var(--c-border)]">
        <Search size={20} strokeWidth={2.3} className="shrink-0 text-muted" />
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder="Busca tareas, notas, personas… o escribe un comando"
          className="h-15 w-full bg-transparent text-[19px] font-medium tracking-tight placeholder:font-normal placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="overflow-y-auto p-2 pb-3">
        <Command.Empty className="py-10 text-center text-[13px] text-muted">
          Nada por aquí.
        </Command.Empty>

        <Command.Group heading="Acciones" className={groupCls}>
          <Item value="nueva tarea añadir crear" icon={<G c="blue"><Plus size={16} strokeWidth={2.8} /></G>} onSelect={run(() => ui.quickAdd())} hint={<Kbd>N</Kbd>}>
            Nueva tarea
          </Item>
          <Item
            value="nueva nota crear"
            icon={<G c="yellow"><FileText size={14} strokeWidth={2.4} /></G>}
            onSelect={run(async () => {
              const n = await createNote()
              navigate(`/notes/${n.id}`)
            })}
          >
            Nueva nota
          </Item>
          <Item value="nuevo proyecto crear" icon={<G c="indigo"><FolderPlus size={14} strokeWidth={2.4} /></G>} onSelect={run(() => (navigate('/projects'), ui.create('project')))}>
            Nuevo proyecto
          </Item>
          <Item value="nuevo hábito crear" icon={<G c="green"><Sparkles size={14} strokeWidth={2.4} /></G>} onSelect={run(() => (navigate('/habits'), ui.create('habit')))}>
            Nuevo hábito
          </Item>
          <Item value="nueva persona contacto crear" icon={<G c="purple"><UserPlus size={14} strokeWidth={2.4} /></G>} onSelect={run(() => (navigate('/people'), ui.create('person')))}>
            Nueva persona
          </Item>
          <Item value="nuevo objetivo meta crear" icon={<G c="blue"><Target size={14} strokeWidth={2.4} /></G>} onSelect={run(() => (navigate('/goals'), ui.create('goal')))}>
            Nuevo objetivo
          </Item>
          <Item value="nuevo pago suscripción recibo gasto crear" icon={<G c="gray"><Wallet size={14} strokeWidth={2.4} /></G>} onSelect={run(() => (navigate('/finance'), ui.create('subscription')))}>
            Nuevo pago o suscripción
          </Item>
          <Item value="nueva plantilla lista checklist crear" icon={<G c="gray"><ClipboardList size={14} strokeWidth={2.4} /></G>} onSelect={run(() => (navigate('/templates'), ui.create('template')))}>
            Nueva plantilla
          </Item>
          <Item value="planificar el dia hoy organizar" icon={<G c="blue"><Sun size={14} strokeWidth={2.4} /></G>} onSelect={run(() => navigate('/plan'))}>
            Planificar el día
          </Item>
          <Item value="conectar claude conector ia asistente" icon={<G c="gray"><Sparkles size={14} strokeWidth={2.4} /></G>} onSelect={run(() => navigate('/settings'))}>
            Conectar NTab con Claude
          </Item>
          <Item value="cambiar tema oscuro claro" icon={<G c="gray"><SunMoon size={14} strokeWidth={2.4} /></G>} onSelect={run(toggleTheme)}>
            Cambiar tema claro / oscuro
          </Item>
          <Item value="exportar copia de seguridad backup" icon={<G c="gray"><Download size={14} strokeWidth={2.4} /></G>} onSelect={run(() => void downloadBackup())}>
            Exportar copia de seguridad
          </Item>
          <Item value="atajos teclado ayuda" icon={<G c="gray"><Keyboard size={14} strokeWidth={2.4} /></G>} onSelect={run(() => ui.help())} hint={<Kbd>?</Kbd>}>
            Atajos de teclado
          </Item>
        </Command.Group>

        <Command.Group heading="Ir a" className={groupCls}>
          {SECTIONS.map((n) => (
            <Item key={n.path} value={`ir ${n.label}`} icon={<SectionIcon def={n} size={26} square />} onSelect={() => go(n.path)} hint={`G ${n.key}`}>
              {n.label}
            </Item>
          ))}
          {areas.map((a) => (
            <Item key={a.id} value={`a:${a.id}`} keywords={['área', a.name]} icon={<AreaBadge icon={a.icon} size={26} />} onSelect={() => go(`/area/${a.id}`)} hint="Área">
              {a.name}
            </Item>
          ))}
          {projects.map((p) => (
            <Item key={p.id} value={`pr:${p.id}`} keywords={['proyecto', p.name]} icon={<span className="h-2.5 w-2.5 rounded-full bg-faint" />} onSelect={() => go(`/project/${p.id}`)} hint="Proyecto">
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
                  icon={t.done ? <CheckCircle2 size={18} style={{ color: tint('green') }} /> : <span className="h-[18px] w-[18px] rounded-full border-[1.6px] border-current opacity-60" />}
                  onSelect={run(() => ui.openTask(t.id))}
                  hint={t.dueDate ? dateLabel(t.dueDate) : undefined}
                >
                  <span className={t.done ? 'text-muted line-through' : ''}>{t.title}</span>
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Notas" className={groupCls}>
              {notes.map((n) => (
                <Item key={n.id} value={`n:${n.id}`} keywords={[n.title, n.content.slice(0, 200)]} icon={<FileText size={17} style={{ color: tint('yellow') }} />} onSelect={() => go(`/notes/${n.id}`)}>
                  {n.title || 'Sin título'}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Personas" className={groupCls}>
              {people.map((p) => (
                <Item key={p.id} value={`p:${p.id}`} keywords={[p.name, p.company]} icon={<User size={17} style={{ color: tint('purple') }} />} onSelect={() => go(`/people/${p.id}`)} hint={p.company}>
                  {p.name}
                </Item>
              ))}
            </Command.Group>
            {!hasResults && (
              <Command.Group heading="Sin resultados" className={groupCls}>
                <Item value={`crear nueva tarea ${q}`} icon={<G c="blue"><Plus size={16} strokeWidth={2.8} /></G>} onSelect={run(() => ui.quickAdd(undefined, q))} hint="Tarea">
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

import { Command } from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { runner } from '@/features/routines/useRoutines'
import { whatNow } from '@/features/whatnow/store'
import { markDone, markSlip } from '@/features/trackers/markDone'
import { cleanDays, sinceLabel } from '@/lib/trackers'
import { useMemo, useState } from 'react'
import { BookOpen, Box, CheckCircle2, ClipboardList, Download, FileText, FolderPlus, Hash, History, Keyboard, LayoutGrid, ListChecks, ListFilter, Moon, PanelLeft, Plus, Receipt, Search, ShoppingCart, Sparkles, Sun, SunMoon, Target, Timer, User, UserPlus, Wallet } from 'lucide-react'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import { createNote } from '@/db/actions'
import { downloadBackup } from '@/db/backup'
import { dateLabel, today } from '@/lib/dates'
import { navigate } from '@/app/router'
import { ui, useUI } from '@/app/store'
import { toggleTheme } from '@/app/theme'
import { AreaBadge } from './icons'
import { Kbd, Modal } from './ui'
import { SECTIONS, SectionIcon, tint, type Tint } from '@/app/sections'
import { useFeatures } from '@/app/features'
import { useSmartLists } from '@/app/smartLists'

function Item({
  onSelect,
  icon,
  children,
  hint,
  value,
}: {
  onSelect: () => void
  icon: React.ReactNode
  children: React.ReactNode
  hint?: React.ReactNode
  value: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="group flex h-11 cursor-default items-center gap-3 rounded-[12px] px-2.5 text-[15px] text-fg transition-colors data-[selected=true]:bg-accent-fill data-[selected=true]:text-white"
    >
      <span className="flex w-7 shrink-0 justify-center text-muted group-data-[selected=true]:text-white">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[13px] text-muted group-data-[selected=true]:text-white">{hint}</span>}
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

const split = (x: string) => fold(x).split(/[^a-z0-9#]+/).filter(Boolean)

/** Palabras de los textos fijos (acciones, secciones), calculadas una vez */
const cache = new Map<string, string[]>()
function words(text: string) {
  let w = cache.get(text)
  if (!w) {
    if (cache.size > 2000) cache.clear()
    cache.set(text, (w = split(text)))
  }
  return w
}

/**
 * Como Spotlight: cada palabra buscada debe ser el principio de alguna palabra
 * del texto (sin importar acentos). Así "trab" encuentra "Trabajo" y no
 * letras sueltas repartidas por "exporTaR copia... bAckup".
 */
const matches = (ws: string[], terms: string[]) => terms.every((t) => ws.some((w) => w.startsWith(t)))

/** Más arriba si el título empieza por lo buscado o lo contiene todo */
const rank = (head: string, title: string[], terms: string[], q: string) => (head.startsWith(q) ? 4 : 0) + (matches(title, terms) ? 2 : 0)

/** Lo buscado, resaltado en el texto (el principio de cada palabra que coincide) */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return text
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(/[\p{L}\p{N}#]+/gu)) {
    const f = fold(m[0])
    const len = Math.max(0, ...terms.filter((t) => f.startsWith(t)).map((t) => t.length))
    if (!len || f.length !== m[0].length) continue
    out.push(text.slice(last, m.index), <mark key={m.index}>{m[0].slice(0, len)}</mark>)
    last = m.index + len
  }
  out.push(text.slice(last))
  return <>{out}</>
}

/** Cuántos resultados de cada tipo se enseñan (el resto, afinando la búsqueda) */
const LIMIT = { tasks: 12, notes: 6, other: 6 }

/** Busca en una lista ya indexada: los que coinciden, mejor puntuados primero, y cuántos hay */
function find<T extends { all: string[]; title: string[]; head: string; recent: number }>(index: T[], terms: string[], q: string, limit: number, first?: (x: T) => number) {
  const hits: { x: T; r: number; i: number }[] = []
  index.forEach((x, i) => matches(x.all, terms) && hits.push({ x, r: rank(x.head, x.title, terms, q), i }))
  // A igualdad, lo más reciente primero (como Spotlight)
  hits.sort((a, b) => (first ? first(a.x) - first(b.x) : 0) || b.r - a.r || b.x.recent - a.x.recent || a.i - b.i)
  return { list: hits.slice(0, limit).map((h) => h.x), total: hits.length }
}

/** Título de un grupo con «12 de 40» cuando hay más de los que se ven */
const heading = (label: string, shown: number, total: number) =>
  total > shown ? (
    <span className="flex justify-between">
      <span>{label}</span>
      <span className="font-num font-medium">
        {shown} de {total}
      </span>
    </span>
  ) : (
    label
  )

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

type Action = { value: string; label: string; icon: React.ReactNode; onSelect: () => void; hint?: React.ReactNode; when?: boolean }

function Palette() {
  const [search, setSearch] = useState('')
  const { on, section } = useFeatures()
  const { areas, projects } = useLookup()
  const allSmart = useSmartLists()
  const smart = on('lists') ? allSmart : []
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const notes = useLiveQuery(() => db.notes.toArray(), [])
  const people = useLiveQuery(() => db.people.toArray(), [])
  const routines = useLiveQuery(() => db.routines.where('archived').equals(0).toArray(), [])
  const things = useLiveQuery(() => db.things.toArray(), [])
  const trackers = useLiveQuery(() => db.trackers.where('archived').equals(0).toArray(), [])
  const go = (path: string) => {
    ui.palette(false)
    navigate(path)
  }
  const run = (fn: () => void) => () => {
    ui.palette(false)
    fn()
  }
  const tagNames = useMemo(() => [...new Set((tasks ?? []).flatMap((t) => (t.done ? [] : t.tags)))].sort((a, b) => a.localeCompare(b, 'es')), [tasks])

  // Índices: el texto de cada cosa, sin acentos y en palabras, se calcula una vez
  // (y no en cada tecla), para que buscar entre miles de tareas sea instantáneo
  const ix = useMemo(() => {
    const entry = <T,>(item: T, title: string, extra = '', recent = 0) => {
      const t = split(title)
      return { item, title: t, all: extra ? [...t, ...split(extra)] : t, head: fold(title), recent }
    }
    return {
      tasks: (tasks ?? []).map((t) => entry(t, t.title, t.tags.map((x) => `${x} #${x}`).join(' '), t.completedAt ?? t.createdAt)),
      notes: (notes ?? []).map((n) => entry(n, n.title || 'Sin título', n.content.slice(0, 600), n.updatedAt)),
      people: (people ?? []).map((p) => entry(p, p.name, p.company)),
      routines: (routines ?? []).map((r) => entry(r, r.name, 'rutina empezar')),
      things: (things ?? []).map((t) => entry(t, t.name, `${t.location ?? ''} ${t.personName ?? ''} donde esta`)),
      trackers: (trackers ?? []).map((t) => entry(t, t.name, 'ultima vez hecho')),
    }
  }, [tasks, notes, people, routines, things, trackers])

  const q = search.trim()
  const fq = fold(q)
  const terms = useMemo(() => split(q), [q])
  const show = (text: string) => !terms.length || matches(words(text), terms)

  const actions: Action[] = [
    { value: 'nueva tarea añadir crear', label: 'Nueva tarea', icon: <G c="blue"><Plus size={16} strokeWidth={2.8} /></G>, onSelect: run(() => ui.quickAdd()), hint: <Kbd>N</Kbd> },
    {
      when: on('notes'),
      value: 'nueva nota crear',
      label: 'Nueva nota',
      icon: <G c="yellow"><FileText size={14} strokeWidth={2.4} /></G>,
      onSelect: run(async () => {
        const n = await createNote()
        navigate(`/notes/${n.id}`)
      }),
    },
    { value: 'nuevo proyecto crear', label: 'Nuevo proyecto', icon: <G c="indigo"><FolderPlus size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/projects'), ui.create('project'))) },
    { when: on('habits'), value: 'nuevo hábito crear', label: 'Nuevo hábito', icon: <G c="green"><Sparkles size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/habits'), ui.create('habit'))) },
    { when: on('things'), value: 'apuntar cosa donde esta guardado prestar prestamo caduca documento', label: 'Apuntar una cosa (dónde está, préstamo, caducidad)', icon: <G c="blue"><Box size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/things'), ui.create('thing'))) },
    { value: 'que hago ahora sugerencia tiempo libre tengo minutos', label: '¿Qué hago ahora?', icon: <G c="blue"><Sparkles size={14} strokeWidth={2.4} /></G>, onSelect: run(whatNow.open) },
    { when: on('expenses'), value: 'gasto apuntar gastos dinero presupuesto', label: 'Apuntar un gasto', icon: <G c="blue"><Receipt size={14} strokeWidth={2.4} /></G>, onSelect: run(() => navigate('/expenses')) },
    { when: on('journal'), value: 'diario escribir como ha ido el dia animo', label: 'Escribir en el diario', icon: <G c="blue"><BookOpen size={14} strokeWidth={2.4} /></G>, onSelect: run(() => navigate('/journal')) },
    { when: on('shopping'), value: 'compra añadir lista de la compra supermercado', label: 'Lista de la compra', icon: <G c="blue"><ShoppingCart size={14} strokeWidth={2.4} /></G>, onSelect: run(() => navigate('/shopping')) },
    { when: on('routines'), value: 'nueva rutina crear checklist lista de pasos', label: 'Nueva rutina', icon: <G c="blue"><ListChecks size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/routines'), ui.create('routine'))) },
    { when: on('focus'), value: 'empezar foco pomodoro concentrarme temporizador concentracion', label: 'Empezar foco', icon: <G c="blue"><Timer size={14} strokeWidth={2.4} /></G>, onSelect: run(() => navigate('/focus')) },
    { when: on('people'), value: 'nueva persona contacto crear', label: 'Nueva persona', icon: <G c="purple"><UserPlus size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/people'), ui.create('person'))) },
    { when: on('goals'), value: 'nuevo objetivo meta crear', label: 'Nuevo objetivo', icon: <G c="blue"><Target size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/goals'), ui.create('goal'))) },
    { when: on('finance'), value: 'nuevo pago suscripción recibo gasto crear', label: 'Nuevo pago o suscripción', icon: <G c="gray"><Wallet size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/finance'), ui.create('subscription'))) },
    { when: on('templates'), value: 'nueva plantilla lista checklist crear', label: 'Nueva plantilla', icon: <G c="gray"><ClipboardList size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/templates'), ui.create('template'))) },
    { when: on('lists'), value: 'nueva lista inteligente filtro busqueda guardada crear', label: 'Nuevo filtro', icon: <G c="blue"><ListFilter size={14} strokeWidth={2.4} /></G>, onSelect: run(() => (navigate('/lists'), ui.create('smartList'))) },
    { value: 'planificar el dia hoy organizar', label: 'Planificar el día', icon: <G c="blue"><Sun size={14} strokeWidth={2.4} /></G>, onSelect: run(() => navigate('/plan')) },
    { value: 'cerrar el dia cierre terminar desconectar noche', label: 'Cerrar el día', icon: <G c="blue"><Moon size={14} strokeWidth={2.4} /></G>, onSelect: run(() => navigate('/shutdown')) },
    { value: 'conectar claude conector ia asistente', label: 'Conectar LUNO con Claude', icon: <G c="gray"><Sparkles size={14} strokeWidth={2.4} /></G>, onSelect: run(() => navigate('/settings')) },
    { value: 'funciones elegir apagar encender modulos simplificar', label: 'Elegir funciones', icon: <G c="gray"><LayoutGrid size={14} strokeWidth={2.4} /></G>, onSelect: () => ui.features() },
    { value: 'personalizar barra lateral secciones ocultar pestañas movil navegacion menu', label: 'Personalizar la barra lateral', icon: <G c="gray"><PanelLeft size={14} strokeWidth={2.4} /></G>, onSelect: () => ui.navEditor('sidebar') },
    { value: 'cambiar tema oscuro claro', label: 'Cambiar tema claro / oscuro', icon: <G c="gray"><SunMoon size={14} strokeWidth={2.4} /></G>, onSelect: run(toggleTheme) },
    { value: 'exportar copia de seguridad backup', label: 'Exportar copia de seguridad', icon: <G c="gray"><Download size={14} strokeWidth={2.4} /></G>, onSelect: run(() => void downloadBackup()) },
    { value: 'atajos teclado ayuda', label: 'Atajos de teclado', icon: <G c="gray"><Keyboard size={14} strokeWidth={2.4} /></G>, onSelect: run(() => ui.help()), hint: <Kbd>?</Kbd> },
  ].filter((a) => a.when !== false && show(`${a.label} ${a.value}`))

  // Planificar y Cerrar el día ya están en las acciones
  const sections = SECTIONS.filter((n) => section(n.id) && n.id !== 'plan' && n.id !== 'shutdown' && show(`ir ${n.label}`))
  const areaHits = areas.filter((a) => show(`área ${a.name}`))
  const projectHits = projects.filter((p) => show(`proyecto ${p.name}`))
  const smartHits = smart.filter((l) => show(`lista filtro ${l.name}`))
  const tagHits = tagNames.filter((t) => show(`etiqueta #${t} ${t}`))
  const places = sections.length + areaHits.length + projectHits.length + smartHits.length + tagHits.length

  // Lo que se busca: solo con algo escrito, y los mejores de cada tipo
  const found = useMemo(() => {
    if (!terms.length) return undefined
    return {
      // Las pendientes antes que las hechas
      tasks: find(ix.tasks, terms, fq, LIMIT.tasks, (x) => x.item.done),
      notes: on('notes') ? find(ix.notes, terms, fq, LIMIT.notes) : undefined,
      things: on('things') ? find(ix.things, terms, fq, LIMIT.other) : undefined,
      trackers: on('trackers') ? find(ix.trackers, terms, fq, LIMIT.other) : undefined,
      routines: on('routines') ? find(ix.routines, terms, fq, LIMIT.other) : undefined,
      people: on('people') ? find(ix.people, terms, fq, LIMIT.other) : undefined,
    }
  }, [ix, terms, fq, on])
  const hasResults = !q || actions.length + places > 0 || (!!found && Object.values(found).some((f) => f?.total))

  return (
    <Command
      loop
      label="Paleta de comandos"
      className="flex max-h-[64vh] flex-col [&_mark]:bg-transparent [&_mark]:font-bold [&_mark]:text-inherit"
      shouldFilter={false}
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
        {found && found.tasks.total > 0 && (
          <Command.Group heading={heading('Tareas', found.tasks.list.length, found.tasks.total)} className={groupCls}>
            {found.tasks.list.map(({ item: t }) => (
              <Item
                key={t.id}
                value={`t:${t.id}`}
                icon={t.done ? <CheckCircle2 size={18} style={{ color: tint('green') }} /> : <span className="h-[18px] w-[18px] rounded-full border-[1.6px] border-current opacity-60" />}
                onSelect={run(() => ui.openTask(t.id))}
                hint={t.dueDate ? dateLabel(t.dueDate) : t.tags.length ? t.tags.map((x) => `#${x}`).join(' ') : undefined}
              >
                <span className={t.done ? 'text-muted line-through' : ''}>
                  <Marked text={t.title} terms={terms} />
                </span>
              </Item>
            ))}
          </Command.Group>
        )}

        {actions.length > 0 && (
          <Command.Group heading="Acciones" className={groupCls}>
            {actions.map((a) => (
              <Item key={a.value} value={a.value} icon={a.icon} onSelect={a.onSelect} hint={a.hint}>
                <Marked text={a.label} terms={terms} />
              </Item>
            ))}
          </Command.Group>
        )}

        {places > 0 && (
          <Command.Group heading="Ir a" className={groupCls}>
            {sections.map((n) => (
              <Item key={n.path} value={`ir ${n.label}`} icon={<SectionIcon def={n} size={26} square />} onSelect={() => go(n.path)} hint={n.key ? `G ${n.key}` : undefined}>
                <Marked text={n.label} terms={terms} />
              </Item>
            ))}
            {areaHits.map((a) => (
              <Item key={a.id} value={`a:${a.id}`} icon={<AreaBadge icon={a.icon} size={26} />} onSelect={() => go(`/area/${a.id}`)} hint="Área">
                <Marked text={a.name} terms={terms} />
              </Item>
            ))}
            {projectHits.map((p) => (
              <Item key={p.id} value={`pr:${p.id}`} icon={<span className="h-2.5 w-2.5 rounded-full bg-faint" />} onSelect={() => go(`/project/${p.id}`)} hint="Proyecto">
                <Marked text={p.name} terms={terms} />
              </Item>
            ))}
            {smartHits.map((l) => (
              <Item key={l.id} value={`sl:${l.id}`} icon={<ListFilter size={17} className="text-muted" />} onSelect={() => go(`/list/${l.id}`)} hint="Lista">
                <Marked text={l.name} terms={terms} />
              </Item>
            ))}
            {tagHits.map((t) => (
              <Item key={t} value={`tag:${t}`} icon={<Hash size={17} className="text-muted" />} onSelect={() => go(`/tag/${encodeURIComponent(t)}`)} hint="Etiqueta">
                <Marked text={t} terms={terms} />
              </Item>
            ))}
          </Command.Group>
        )}

        {found?.notes && found.notes.total > 0 && (
          <Command.Group heading={heading('Notas', found.notes.list.length, found.notes.total)} className={groupCls}>
            {found.notes.list.map(({ item: n }) => (
              <Item key={n.id} value={`n:${n.id}`} icon={<FileText size={17} style={{ color: tint('yellow') }} />} onSelect={() => go(`/notes/${n.id}`)}>
                <Marked text={n.title || 'Sin título'} terms={terms} />
              </Item>
            ))}
          </Command.Group>
        )}
        {found?.things && found.things.total > 0 && (
          <Command.Group heading={heading('Cosas', found.things.list.length, found.things.total)} className={groupCls}>
            {found.things.list.map(({ item: t }) => (
              <Item key={t.id} value={`c:${t.id}`} icon={<Box size={17} />} onSelect={() => go(`/things/${t.id}`)} hint={t.location ?? t.personName}>
                <Marked text={t.name} terms={terms} />
              </Item>
            ))}
          </Command.Group>
        )}
        {found?.trackers && found.trackers.total > 0 && (
          <Command.Group heading={heading('Última vez', found.trackers.list.length, found.trackers.total)} className={groupCls}>
            {found.trackers.list.map(({ item: t }) => (
              <Item
                key={t.id}
                value={`v:${t.id}`}
                icon={<History size={17} />}
                onSelect={run(() => void (t.avoid ? markSlip(t) : markDone(t)))}
                hint={
                  t.avoid
                    ? `${cleanDays(t)} días sin · apuntar recaída`
                    : t.log[0]
                      ? `${sinceLabel(Math.round((Date.parse(today()) - Date.parse(t.log[0])) / 864e5))} · apuntar hoy`
                      : 'Apuntar hoy'
                }
              >
                <Marked text={t.name} terms={terms} />
              </Item>
            ))}
          </Command.Group>
        )}
        {found?.routines && found.routines.total > 0 && (
          <Command.Group heading={heading('Rutinas', found.routines.list.length, found.routines.total)} className={groupCls}>
            {found.routines.list.map(({ item: r }) => (
              <Item key={r.id} value={`r:${r.id}`} icon={<ListChecks size={17} />} onSelect={run(() => runner.open(r.id))} hint="Empezar">
                <Marked text={r.name} terms={terms} />
              </Item>
            ))}
          </Command.Group>
        )}
        {found?.people && found.people.total > 0 && (
          <Command.Group heading={heading('Personas', found.people.list.length, found.people.total)} className={groupCls}>
            {found.people.list.map(({ item: p }) => (
              <Item key={p.id} value={`p:${p.id}`} icon={<User size={17} style={{ color: tint('purple') }} />} onSelect={() => go(`/people/${p.id}`)} hint={p.company}>
                <Marked text={p.name} terms={terms} />
              </Item>
            ))}
          </Command.Group>
        )}
        {!hasResults && (
          <Command.Group heading="Sin resultados" className={groupCls}>
            <Item value={`crear nueva tarea ${q}`} icon={<G c="blue"><Plus size={16} strokeWidth={2.8} /></G>} onSelect={run(() => ui.quickAdd(undefined, q))} hint="Tarea">
              Crear tarea «{q}»
            </Item>
          </Command.Group>
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

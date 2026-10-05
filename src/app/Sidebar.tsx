import { AnimatePresence, m as motion } from 'motion/react'
import { ChevronDown, ChevronRight, Hash, ListFilter, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, SlidersHorizontal, Sun } from 'lucide-react'
import { useLookup } from '@/db/hooks'
import { AreaBadge } from '@/components/icons'
import { LunoLockup } from '@/components/Brand'
import { Kbd, ProgressPie, RollingNumber, cx, spring, useMediaQuery } from '@/components/ui'
import { SyncBadge } from '@/sync/SyncBadge'
import { useNavCounts, useProjectProgress, useSmartListCounts } from './counts'
import { useNav } from './nav'
import { href, navigate, useRoute } from './router'
import { SectionIcon, hub, section, type HubDef } from './sections'
import { hubPath, inHub } from './hubs'
import { FIXED } from '@/lib/nav'
import { setUI, ui, useUI } from './store'
import { toggleTheme, useTheme } from './theme'
import { usePins } from './pins'
import { useCollapsed } from './navGroups'
import { useSmartLists } from './smartLists'
import { useFeatures } from './features'

const FOOT = FIXED.map(section)

/** Lista inteligente en cuadrícula, como en Recordatorios */
function Tile({ def, to, count, active }: { def: HubDef; to: string; count?: number | string; active: boolean }) {
  return (
    <a
      href={href(to)}
      aria-current={active ? 'page' : undefined}
      onClick={() => ui.sidebar(false)}
      className={cx(
        'relative flex flex-col gap-2 overflow-hidden rounded-[14px] p-2.5 transition-[transform,box-shadow] duration-200 active:scale-[0.97]',
        active ? 'text-white shadow-lg' : 'bg-[var(--c-material)] shadow-[var(--c-shadow)] hover:brightness-[1.03]',
      )}
      style={active ? { background: 'var(--c-accent-fill)', boxShadow: '0 6px 18px -10px rgb(0 0 0 / 0.35)' } : undefined}
    >
      <div className="flex items-start justify-between">
        {active ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white" style={{ color: 'var(--c-accent-fill)' }}>
            {def.icon === 'today' ? (
              <span className="font-num text-[13px] font-bold">{new Date().getDate()}</span>
            ) : (
              <def.icon size={16} strokeWidth={2.4} />
            )}
          </span>
        ) : (
          <SectionIcon def={def} size={28} />
        )}
        {count !== undefined && <RollingNumber value={count} className={cx('text-[22px] leading-none font-bold', !active && 'text-fg')} />}
      </div>
      <span className={cx('truncate text-[13px] font-semibold', active ? 'text-white' : 'text-muted')}>{def.short}</span>
    </a>
  )
}

function Row({
  to,
  active,
  icon,
  label,
  count,
  countTone,
  indent,
}: {
  to: string
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  countTone?: string
  indent?: boolean
}) {
  return (
    <a
      href={href(to)}
      aria-current={active ? 'page' : undefined}
      onClick={() => ui.sidebar(false)}
      className={cx(
        'relative flex h-9 items-center gap-2.5 rounded-[10px] px-2 text-[14px] transition-colors',
        indent && 'pl-9',
        active ? 'font-semibold text-fg' : 'text-fg/90 hover:bg-hover',
      )}
    >
      {active && <motion.span layoutId="nav-pill" layoutDependency={active} transition={spring} className="absolute inset-0 rounded-[10px] bg-fill" />}
      <span className="relative flex w-6 shrink-0 justify-center">{icon}</span>
      <span className="relative min-w-0 flex-1 truncate">{label}</span>
      {!!count && (
        <RollingNumber value={count} className="text-[13px] font-medium" style={{ color: countTone ?? 'var(--c-muted)' }} />
      )}
    </a>
  )
}

/**
 * Grupo de la barra lateral con su título, que se pliega y se despliega (se
 * recuerda en este dispositivo). Si lo que estás viendo está dentro, el grupo
 * plegado lo enseña igualmente.
 */
function NavGroup({ id, label, active, action, className, children }: { id: string; label: string; active?: boolean; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const [collapsed, toggle] = useCollapsed(id)
  const bodyId = `nav-group-${id}`
  return (
    <section className={cx('mt-5', className)} aria-label={label}>
      <div className="mb-1 flex items-center px-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="-ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left text-[13px] font-bold text-muted transition-colors hover:text-fg"
        >
          <ChevronRight size={13} strokeWidth={2.8} aria-hidden className={cx('shrink-0 transition-transform duration-200', !collapsed && 'rotate-90')} />
          <span className="truncate">{label}</span>
        </button>
        {action}
      </div>
      <AnimatePresence initial={false}>
        {(!collapsed || active) && (
          <motion.div
            key="body"
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className="space-y-px overflow-hidden"
          >
            {collapsed && active ? <OnlyActive>{children}</OnlyActive> : children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/**
 * Al pie de la lista, los espacios que has ocultado: plegados tras «N más»,
 * salvo el que estás viendo. Así no saturan la barra y siguen a mano en el
 * ordenador, como «Más» en el móvil.
 */
function MoreRows({ group, label, items, isActive, render }: { group: string; label: string; items: HubDef[]; isActive: (d: HubDef) => boolean; render: (d: HubDef) => React.ReactNode }) {
  // useCollapsed recuerda lo que se ha tocado; aquí «tocado» es «abierto»
  const [open, toggle] = useCollapsed(`more:${group}`)
  const shown = open ? items : items.filter(isActive)
  const rest = items.length - shown.length
  return (
    <>
      {shown.map(render)}
      {(rest > 0 || open) && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? `Ocultar las secciones ocultas de ${label}` : `Ver ${rest} más de ${label}`}
          className="flex h-8 w-full items-center gap-2.5 rounded-[10px] px-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <span className="flex w-6 shrink-0 justify-center">
            <ChevronDown size={14} strokeWidth={2.6} aria-hidden className={cx('transition-transform duration-200', open && 'rotate-180')} />
          </span>
          {open ? 'Menos' : `${rest} más`}
        </button>
      )}
    </>
  )
}

/** En un grupo plegado, solo la fila de lo que estás viendo */
function OnlyActive({ children }: { children: React.ReactNode }) {
  return <div className="nav-only-active space-y-px">{children}</div>
}

function SidebarContent() {
  const { path } = useRoute()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const c = useNavCounts()
  const nav = useNav()
  const { areas, projects } = useLookup()
  useTheme()
  const dark = document.documentElement.dataset.theme === 'dark'
  const activeProjects = projects.filter((p) => p.status === 'active')
  const progress = useProjectProgress(activeProjects.map((p) => p.id))
  const pins = usePins()
  const pinProgress = useProjectProgress(pins.filter((p) => p.kind === 'project').map((p) => p.id))
  const allSmart = useSmartLists()
  const features = useFeatures()
  const smart = features.on('lists') ? allSmart : []
  const smartCounts = useSmartListCounts(smart)
  const is = (p: string) => path === p || path.startsWith(p + '/') || (p === '/tags' && path.startsWith('/tag/'))

  const tileCount: Record<string, number | string> = {
    today: c.today,
    inbox: c.inbox,
    calendar: c.calendar,
    habits: c.habitsTotal ? `${c.habitsDone}/${c.habitsTotal}` : 0,
    notes: c.notes,
    home: c.shopping,
    people: c.peopleDue,
  }

  // Los espacios: en cuadrícula, en la lista y los ocultos al pie
  const to = (d: HubDef) => hubPath(d, features.section)
  const hidden = nav.hidden.map(hub)
  const hubRow = (d: HubDef) => (
    <Row
      key={d.id}
      to={to(d)}
      active={inHub(d, path)}
      icon={<SectionIcon def={d} size={24} square />}
      label={d.label}
      count={d.id === 'people' ? c.peopleDue : d.id === 'home' ? c.shopping : undefined}
      countTone={d.id === 'people' ? 'var(--c-purple)' : undefined}
    />
  )
  const pinRows = pins.flatMap((pin) => {
    if (pin.kind === 'project') {
      const p = projects.find((x) => x.id === pin.id)
      if (!p) return []
      const to = `/project/${p.id}`
      return [{ key: `p:${p.id}`, to, active: path === to, label: p.name, count: c.byProject.get(p.id), icon: <ProgressPie value={pinProgress.get(p.id) ?? 0} className="text-muted" /> }]
    }
    if (pin.kind === 'area') {
      const a = areas.find((x) => x.id === pin.id)
      if (!a) return []
      const to = `/area/${a.id}`
      return [{ key: `a:${a.id}`, to, active: path === to, label: a.name, count: c.byArea.get(a.id), icon: <AreaBadge icon={a.icon} /> }]
    }
    const to = `/tag/${encodeURIComponent(pin.id)}`
    return [{ key: `t:${pin.id}`, to, active: path === to, label: pin.id, count: undefined, icon: <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-fill text-fg"><Hash size={13} strokeWidth={2.6} /></span> }]
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-3 pt-[max(env(safe-area-inset-top),14px)]">
        <a
          href={href('/today')}
          onClick={() => ui.sidebar(false)}
          aria-label="LUNO: ir a Hoy"
          className="flex h-9 items-center rounded-[10px] px-1.5 text-fg transition-opacity hover:opacity-80"
        >
          <LunoLockup height={11} />
        </a>
      </div>
      <div className="flex items-center gap-2 px-3 pt-2 pb-3">
        <button
          type="button"
          onClick={() => {
            ui.sidebar(false)
            ui.palette()
          }}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-fill px-2.5 text-[14px] text-muted transition-colors hover:text-fg"
        >
          <Search size={15} strokeWidth={2.2} />
          <span className="flex-1 text-left">Buscar</span>
          <Kbd>⌘K</Kbd>
        </button>
        <button
          type="button"
          aria-label="Nueva tarea"
          title="Nueva tarea (N)"
          onClick={() => {
            ui.sidebar(false)
            ui.quickAdd()
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white transition-transform active:scale-90"
        >
          <Plus size={19} strokeWidth={2.6} />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        <div className="grid grid-cols-2 gap-2">
          {nav.tiles.map(hub).map((d) => (
            <Tile key={d.id} def={d} to={to(d)} count={tileCount[d.id]} active={inHub(d, path)} />
          ))}
        </div>

        {pinRows.length > 0 && (
          <NavGroup id="pins" label="Fijados" active={pinRows.some((r) => r.active)} className={cx(nav.tiles.length > 0 && 'mt-4')}>
            {pinRows.map((r) => (
              <Row key={r.key} to={r.to} active={r.active} icon={r.icon} label={r.label} count={r.count} />
            ))}
          </NavGroup>
        )}

        {smart.length > 0 && (
          <NavGroup
            id="smart"
            label="Mis filtros"
            active={smart.some((l) => path === `/list/${l.id}`)}
            className={cx(nav.tiles.length > 0 && pinRows.length === 0 && 'mt-4')}
            action={
              <button
                type="button"
                aria-label="Nuevo filtro"
                onClick={() => {
                  ui.sidebar(false)
                  navigate('/lists')
                  setUI({ creating: 'smartList' })
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
              >
                <Plus size={15} />
              </button>
            }
          >
            {smart.map((l) => (
              <Row
                key={l.id}
                to={`/list/${l.id}`}
                active={path === `/list/${l.id}`}
                icon={<span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-fill text-fg"><ListFilter size={13} strokeWidth={2.6} /></span>}
                label={l.name}
                count={smartCounts.get(l.id)}
              />
            ))}
          </NavGroup>
        )}

        {nav.list.length + hidden.length > 0 && (
          <div className={cx('space-y-px', (nav.tiles.length > 0 || pinRows.length > 0 || smart.length > 0) && 'mt-4')}>
            {nav.list.map(hub).map(hubRow)}
            {hidden.length > 0 && <MoreRows group="hubs" label="la barra" items={hidden} isActive={(d) => inHub(d, path)} render={hubRow} />}
          </div>
        )}

        <NavGroup
          id="areas"
          label="Mis áreas"
          active={path.startsWith('/area/') || path.startsWith('/project/')}
          action={
            <button
              type="button"
              aria-label="Nueva área"
              onClick={() => {
                ui.sidebar(false)
                window.location.hash = '/settings/areas'
                ui.create('area')
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
            >
              <Plus size={15} />
            </button>
          }
        >
          {areas.map((a) => (
            <div key={a.id}>
              <Row
                to={`/area/${a.id}`}
                active={path === `/area/${a.id}`}
                icon={<AreaBadge icon={a.icon} />}
                label={a.name}
                count={c.byArea.get(a.id)}
              />
              {activeProjects
                .filter((p) => p.areaId === a.id)
                .map((p) => (
                  <Row
                    key={p.id}
                    indent
                    to={`/project/${p.id}`}
                    active={path === `/project/${p.id}`}
                    icon={<ProgressPie value={progress.get(p.id) ?? 0} className="text-muted" />}
                    label={p.name}
                    count={c.byProject.get(p.id)}
                  />
                ))}
            </div>
          ))}
          {activeProjects
            .filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId))
            .map((p) => (
              <Row
                key={p.id}
                to={`/project/${p.id}`}
                active={path === `/project/${p.id}`}
                icon={<ProgressPie value={progress.get(p.id) ?? 0} className="text-muted" />}
                label={p.name}
                count={c.byProject.get(p.id)}
              />
            ))}
        </NavGroup>
      </div>

      <div className="space-y-px px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[inset_0_1px_0_var(--c-border)]">
        {FOOT.map((d) => (
          <Row key={d.id} to={d.path} active={is(d.path)} icon={<SectionIcon def={d} size={24} square />} label={d.label} />
        ))}
        <div className="flex items-center">
          <div className="min-w-0 flex-1">
            <SyncBadge />
          </div>
          {desktop && (
            <button
              type="button"
              onClick={ui.toggleSidebarHidden}
              aria-label="Ocultar la barra lateral"
              title="Ocultar la barra lateral (⌘\)"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => ui.navEditor('sidebar')}
            aria-label="Personalizar la barra lateral"
            title="Personalizar la barra lateral"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <SlidersHorizontal size={15} />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Cambiar tema"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <motion.span key={dark ? 'sun' : 'moon'} initial={{ rotate: -90, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={spring}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </motion.span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  const open = useUI((s) => s.sidebarOpen)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const hidden = useUI((s) => s.sidebarHidden)
  if (desktop) {
    return (
      <>
        <motion.nav
          aria-label="Barra lateral"
          initial={false}
          animate={{ x: hidden ? -280 : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          inert={hidden}
          className="fixed inset-y-0 left-0 z-20 w-[272px] shadow-[inset_-1px_0_0_var(--c-border)] backdrop-blur-[40px] backdrop-saturate-[1.8]"
          style={{ background: 'var(--c-sidebar)', viewTransitionName: 'sidebar' }}
        >
          <SidebarContent />
        </motion.nav>
        {/* Plegada: un botón arriba a la izquierda para volver a abrirla */}
        <AnimatePresence>
          {hidden && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring}
              onClick={ui.toggleSidebarHidden}
              aria-label="Mostrar la barra lateral"
              title="Mostrar la barra lateral (⌘\)"
              className="glass fixed top-3.5 left-3.5 z-30 flex h-9 w-9 items-center justify-center rounded-full text-fg shadow-[var(--c-shadow)] transition-colors hover:bg-hover"
            >
              <PanelLeftOpen size={17} strokeWidth={2.2} />
            </motion.button>
          )}
        </AnimatePresence>
      </>
    )
  }
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => ui.sidebar(false)}
          />
          <motion.nav
            key="drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 42 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.6, right: 0 }}
            onDragEnd={(_, i) => (i.offset.x < -80 || i.velocity.x < -500) && ui.sidebar(false)}
            className="fixed inset-y-0 left-0 z-50 w-[300px] max-w-[85vw] rounded-r-[28px] shadow-[var(--c-shadow-lg)]"
            style={{ background: 'color-mix(in srgb, var(--c-bg) 90%, var(--c-surface))' }}
          >
            <SidebarContent />
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  )
}

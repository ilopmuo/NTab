import { AnimatePresence, motion } from 'motion/react'
import { Moon, Plus, Search, Sun } from 'lucide-react'
import { useLookup } from '@/db/hooks'
import { AreaBadge } from '@/components/icons'
import { Kbd, RollingNumber, cx, spring, useMediaQuery } from '@/components/ui'
import { SyncBadge } from '@/sync/SyncBadge'
import { useNavCounts } from './counts'
import { href, useRoute } from './router'
import { SectionIcon, section, tint, type SectionDef } from './sections'
import { ui, useUI } from './store'
import { toggleTheme, useTheme } from './theme'

const TILES = ['today', 'upcoming', 'inbox', 'calendar', 'habits', 'notes'].map(section)
const MORE = ['shopping', 'routines', 'trackers', 'things', 'journal', 'people', 'projects', 'templates', 'goals', 'expenses', 'finance', 'review'].map(section)
const FOOT = ['logbook', 'trash', 'settings'].map(section)

/** Lista inteligente en cuadrícula, como en Recordatorios */
function Tile({ def, count, active }: { def: SectionDef; count: number | string; active: boolean }) {
  return (
    <a
      href={href(def.path)}
      onClick={() => ui.sidebar(false)}
      className={cx(
        'relative flex flex-col gap-2 overflow-hidden rounded-[14px] p-2.5 transition-[transform,box-shadow] duration-200 active:scale-[0.97]',
        active ? 'text-white shadow-lg' : 'bg-[var(--c-material)] shadow-[var(--c-shadow)] hover:brightness-[1.03]',
      )}
      style={active ? { background: tint(def.tint), boxShadow: `0 8px 24px -8px ${tint(def.tint)}` } : undefined}
    >
      <div className="flex items-start justify-between">
        {active ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white" style={{ color: tint(def.tint) }}>
            {def.icon === 'today' ? (
              <span className="font-num text-[13px] font-bold">{new Date().getDate()}</span>
            ) : (
              <def.icon size={16} strokeWidth={2.4} />
            )}
          </span>
        ) : (
          <SectionIcon def={def} size={28} />
        )}
        <RollingNumber value={count} className={cx('text-[22px] leading-none font-bold', !active && 'text-fg')} />
      </div>
      <span className={cx('truncate text-[13px] font-semibold', active ? 'text-white/90' : 'text-muted')}>{def.short}</span>
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
      onClick={() => ui.sidebar(false)}
      className={cx(
        'relative flex h-9 items-center gap-2.5 rounded-[10px] px-2 text-[14px] transition-colors',
        indent && 'pl-9',
        active ? 'font-semibold text-fg' : 'text-fg/90 hover:bg-hover',
      )}
    >
      {active && <motion.span layoutId="nav-pill" transition={spring} className="absolute inset-0 rounded-[10px] bg-fill" />}
      <span className="relative flex w-6 shrink-0 justify-center">{icon}</span>
      <span className="relative min-w-0 flex-1 truncate">{label}</span>
      {!!count && (
        <RollingNumber value={count} className="text-[13px] font-medium" style={{ color: countTone ?? 'var(--c-muted)' }} />
      )}
    </a>
  )
}

function SidebarContent() {
  const { path } = useRoute()
  const c = useNavCounts()
  const { areas, projects } = useLookup()
  useTheme()
  const dark = document.documentElement.dataset.theme === 'dark'
  const activeProjects = projects.filter((p) => p.status === 'active')
  const is = (p: string) => path === p || path.startsWith(p + '/')

  const tileCount: Record<string, number | string> = {
    today: c.today,
    upcoming: c.upcoming,
    inbox: c.inbox,
    calendar: c.calendar,
    habits: c.habitsTotal ? `${c.habitsDone}/${c.habitsTotal}` : 0,
    notes: c.notes,
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),14px)] pb-3">
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_4px_14px_-4px_var(--c-blue)] transition-transform active:scale-90"
        >
          <Plus size={19} strokeWidth={2.6} />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        <div className="grid grid-cols-2 gap-2">
          {TILES.map((d) => (
            <Tile key={d.id} def={d} count={tileCount[d.id]} active={is(d.path)} />
          ))}
        </div>

        <div className="mt-4 space-y-px">
          {MORE.map((d) => (
            <Row
              key={d.id}
              to={d.path}
              active={is(d.path)}
              icon={<SectionIcon def={d} size={24} square />}
              label={d.label}
              count={d.id === 'people' ? c.peopleDue : d.id === 'shopping' ? c.shopping : undefined}
              countTone={d.id === 'people' ? 'var(--c-purple)' : undefined}
            />
          ))}
        </div>

        <div className="mt-5 mb-1 flex items-center px-2">
          <span className="text-[13px] font-bold text-muted">Mis áreas</span>
          <button
            type="button"
            aria-label="Nueva área"
            onClick={() => {
              ui.sidebar(false)
              window.location.hash = '/settings'
              ui.create('area')
            }}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="space-y-px">
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
                    icon={<span className="h-1.5 w-1.5 rounded-full bg-faint" />}
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
                icon={<span className="h-1.5 w-1.5 rounded-full bg-faint" />}
                label={p.name}
                count={c.byProject.get(p.id)}
              />
            ))}
        </div>
      </div>

      <div className="space-y-px px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[inset_0_1px_0_var(--c-border)]">
        {FOOT.map((d) => (
          <Row key={d.id} to={d.path} active={is(d.path)} icon={<SectionIcon def={d} size={24} square />} label={d.label} />
        ))}
        <div className="flex items-center">
          <div className="min-w-0 flex-1">
            <SyncBadge />
          </div>
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
  if (desktop) {
    return (
      <nav className="fixed inset-y-0 left-0 z-20 w-[272px] shadow-[inset_-1px_0_0_var(--c-border)] backdrop-blur-[40px] backdrop-saturate-[1.8]" style={{ background: 'var(--c-sidebar)' }}>
        <SidebarContent />
      </nav>
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

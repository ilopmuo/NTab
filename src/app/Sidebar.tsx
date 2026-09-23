import { useMemo } from 'react'
import { ChevronRight, Menu, Moon, Plus, Search, Sun } from 'lucide-react'
import { useLookup, useOpenTasks } from '@/db/hooks'
import { today } from '@/lib/dates'
import { isInbox } from '@/lib/tasks'
import { Icon } from '@/components/icons'
import { NAV } from '@/components/CommandPalette'
import { Kbd, cx } from '@/components/ui'
import { href, useRoute } from './router'
import { ui, useUI } from './store'
import { toggleTheme, useTheme } from './theme'

const MAIN = NAV.filter((n) => ['/today', '/inbox', '/upcoming', '/calendar', '/habits', '/notes', '/people'].includes(n.path))
const FOOT = NAV.filter((n) => ['/projects', '/review', '/logbook', '/settings'].includes(n.path))

function NavLink({
  to,
  active,
  icon,
  label,
  count,
  countTone,
}: {
  to: string
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  countTone?: 'danger' | 'accent'
}) {
  return (
    <a
      href={href(to)}
      onClick={() => ui.sidebar(false)}
      className={cx(
        'group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors',
        active ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg',
      )}
    >
      <span className={cx('flex w-4 justify-center', active && 'text-accent')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && (
        <span
          className={cx(
            'text-[12px] tabular-nums',
            countTone === 'danger' ? 'font-semibold text-danger' : countTone === 'accent' ? 'text-accent' : 'text-faint',
          )}
        >
          {count}
        </span>
      )}
    </a>
  )
}

export function Sidebar() {
  const { path } = useRoute()
  const open = useUI((s) => s.sidebarOpen)
  const tasks = useOpenTasks() ?? []
  const { areas, projects } = useLookup()
  useTheme()
  const dark = document.documentElement.dataset.theme === 'dark'

  const counts = useMemo(() => {
    const t = today()
    const overdue = tasks.filter((x) => x.dueDate && x.dueDate < t).length
    const todayCount = tasks.filter((x) => x.dueDate && x.dueDate <= t).length
    const inbox = tasks.filter(isInbox).length
    const byProject = new Map<string, number>()
    for (const x of tasks) if (x.projectId) byProject.set(x.projectId, (byProject.get(x.projectId) ?? 0) + 1)
    return { overdue, todayCount, inbox, byProject }
  }, [tasks])

  const activeProjects = projects.filter((p) => p.status === 'active')

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-scrim animate-fade-in lg:hidden" onClick={() => ui.sidebar(false)} />}
      <nav
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-line bg-surface transition-transform duration-200 lg:z-20 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <img src="./icon.svg" alt="" className="h-7 w-7 rounded-lg" />
          <span className="text-[16px] font-bold tracking-tight">NTab</span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Cambiar tema"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className="space-y-1.5 px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              ui.sidebar(false)
              ui.quickAdd()
            }}
            className="flex h-9 w-full items-center gap-2 rounded-lg bg-accent px-3 text-[13.5px] font-medium text-white transition-all hover:brightness-110"
          >
            <Plus size={16} strokeWidth={2.2} /> Nueva tarea
            <span className="ml-auto rounded bg-white/20 px-1.5 text-[11px]">N</span>
          </button>
          <button
            type="button"
            onClick={() => {
              ui.sidebar(false)
              ui.palette()
            }}
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-line px-3 text-[13.5px] text-muted transition-colors hover:text-fg"
          >
            <Search size={15} /> Buscar
            <span className="ml-auto flex gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="space-y-px">
            {MAIN.map((n) => (
              <NavLink
                key={n.path}
                to={n.path}
                active={path === n.path || path.startsWith(n.path + '/')}
                icon={<n.icon size={16} strokeWidth={1.8} />}
                label={n.label}
                count={n.path === '/today' ? counts.todayCount : n.path === '/inbox' ? counts.inbox : undefined}
                countTone={n.path === '/today' && counts.overdue ? 'danger' : undefined}
              />
            ))}
          </div>

          <div className="mt-6 mb-1 flex items-center px-2.5">
            <span className="text-[11px] font-semibold tracking-wider text-faint uppercase">Áreas</span>
            <button
              type="button"
              aria-label="Nueva área"
              onClick={() => {
                ui.sidebar(false)
                window.location.hash = '/settings'
                ui.create('area')
              }}
              className="ml-auto rounded p-0.5 text-faint hover:text-fg"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-px">
            {areas.map((a) => {
              const areaProjects = activeProjects.filter((p) => p.areaId === a.id)
              const expanded = path === `/area/${a.id}` || areaProjects.some((p) => path === `/project/${p.id}`)
              return (
                <div key={a.id}>
                  <NavLink
                    to={`/area/${a.id}`}
                    active={path === `/area/${a.id}`}
                    icon={<Icon name={a.icon} size={15} style={{ color: a.color }} />}
                    label={a.name}
                  />
                  {(expanded || areaProjects.length <= 3) &&
                    areaProjects.map((p) => (
                      <NavLink
                        key={p.id}
                        to={`/project/${p.id}`}
                        active={path === `/project/${p.id}`}
                        icon={<span className="h-2 w-2 rounded-full" style={{ background: p.color }} />}
                        label={p.name}
                        count={counts.byProject.get(p.id)}
                      />
                    ))}
                  {!expanded && areaProjects.length > 3 && (
                    <a href={href(`/area/${a.id}`)} className="flex h-7 items-center gap-2 pl-9 text-[12.5px] text-faint hover:text-fg">
                      {areaProjects.length} proyectos <ChevronRight size={12} />
                    </a>
                  )}
                </div>
              )
            })}
            {activeProjects
              .filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId))
              .map((p) => (
                <NavLink
                  key={p.id}
                  to={`/project/${p.id}`}
                  active={path === `/project/${p.id}`}
                  icon={<span className="h-2 w-2 rounded-full" style={{ background: p.color }} />}
                  label={p.name}
                  count={counts.byProject.get(p.id)}
                />
              ))}
          </div>
        </div>

        <div className="space-y-px border-t border-line px-3 py-3 safe-bottom">
          {FOOT.map((n) => (
            <NavLink key={n.path} to={n.path} active={path.startsWith(n.path)} icon={<n.icon size={15} strokeWidth={1.8} />} label={n.label} />
          ))}
        </div>
      </nav>
    </>
  )
}

export function MobileBar() {
  const { path } = useRoute()
  const items = NAV.filter((n) => ['/today', '/inbox', '/calendar'].includes(n.path))
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line lg:hidden safe-bottom">
      <div className="flex h-14 items-center justify-around px-2">
        {items.slice(0, 2).map((n) => (
          <a key={n.path} href={href(n.path)} className={cx('flex flex-col items-center gap-0.5 px-3 text-[10.5px]', path === n.path ? 'text-accent' : 'text-muted')}>
            <n.icon size={20} strokeWidth={1.8} />
            {n.label.split(' ')[0]}
          </a>
        ))}
        <button
          type="button"
          aria-label="Nueva tarea"
          onClick={() => ui.quickAdd()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 active:scale-95"
        >
          <Plus size={22} strokeWidth={2.2} />
        </button>
        {items.slice(2).map((n) => (
          <a key={n.path} href={href(n.path)} className={cx('flex flex-col items-center gap-0.5 px-3 text-[10.5px]', path === n.path ? 'text-accent' : 'text-muted')}>
            <n.icon size={20} strokeWidth={1.8} />
            {n.label}
          </a>
        ))}
        <button type="button" onClick={() => ui.sidebar(true)} className="flex flex-col items-center gap-0.5 px-3 text-[10.5px] text-muted">
          <Menu size={20} strokeWidth={1.8} />
          Menú
        </button>
      </div>
    </div>
  )
}

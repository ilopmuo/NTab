import { m as motion } from 'motion/react'
import { BookOpen, ChevronRight, Hash, LayoutGrid, type LucideIcon, PanelBottom, Plus, Receipt, Search, Timer } from 'lucide-react'
import { FEATURE_GROUPS } from '@/lib/features'
import { useLookup } from '@/db/hooks'
import { useNavCounts, useProjectProgress } from '@/app/counts'
import { useNav } from '@/app/nav'
import { usePins } from '@/app/pins'
import { href } from '@/app/router'
import { SECTIONS, SectionIcon, type SectionDef } from '@/app/sections'
import { ui } from '@/app/store'
import { useFeatures } from '@/app/features'
import { AreaBadge } from '@/components/icons'
import { Group, IconButton, PageHeader, ProgressPie, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'

const FOOT = ['logbook', 'trash', 'settings']

/**
 * «Más» (la pestaña del móvil): todo lo que no está en las pestañas, por
 * grupos, con lo fijado arriba y tus áreas y proyectos al final.
 */
export function MoreView() {
  const nav = useNav()
  const features = useFeatures()
  const c = useNavCounts()
  const pins = usePins()
  const { areas, projects } = useLookup()
  const active = projects.filter((p) => p.status === 'active')
  const progress = useProjectProgress([...new Set([...active.map((p) => p.id), ...pins.filter((p) => p.kind === 'project').map((p) => p.id)])])

  const shown = SECTIONS.filter((s) => features.section(s.id) && !nav.tabs.includes(s.id) && !FOOT.includes(s.id))
  const core = shown.filter((s) => !s.group)
  const groups = FEATURE_GROUPS.map((g) => ({ ...g, items: shown.filter((s) => s.group === g.id) })).filter((g) => g.items.length)
  const count: Record<string, number | undefined> = {
    today: c.today,
    upcoming: c.upcoming,
    inbox: c.inbox,
    calendar: c.calendar,
    habits: c.habitsLeft,
    notes: c.notes,
    shopping: c.shopping,
    people: c.peopleDue,
  }

  const pinned = pins.flatMap((pin) => {
    if (pin.kind === 'project') {
      const p = projects.find((x) => x.id === pin.id)
      return p ? [{ key: `p:${p.id}`, to: `/project/${p.id}`, label: p.name, icon: <ProgressPie value={progress.get(p.id) ?? 0} size={18} className="text-muted" /> }] : []
    }
    if (pin.kind === 'area') {
      const a = areas.find((x) => x.id === pin.id)
      return a ? [{ key: `a:${a.id}`, to: `/area/${a.id}`, label: a.name, icon: <AreaBadge icon={a.icon} /> }] : []
    }
    return [{ key: `t:${pin.id}`, to: `/tag/${encodeURIComponent(pin.id)}`, label: pin.id, icon: <Hash size={16} strokeWidth={2.6} className="text-muted" /> }]
  })

  return (
    <Page>
      <PageHeader
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill">
            <LayoutGrid size={20} strokeWidth={2.2} />
          </span>
        }
        title="Más"
        subtitle="Todo lo que no está en las pestañas."
        actions={
          <IconButton label="Buscar" filled onClick={() => ui.palette()}>
            <Search size={17} strokeWidth={2.4} />
          </IconButton>
        }
      />

      <QuickActions />

      {pinned.length > 0 && (
        <Block title="Fijados">
          <Group>
            {pinned.map((p) => (
              <LinkRow key={p.key} to={p.to} icon={p.icon} label={p.label} />
            ))}
          </Group>
        </Block>
      )}

      {core.length > 0 && <Tiles title="Esenciales" items={core} count={count} />}
      {groups.map((g, i) => (
        <Tiles key={g.id} title={g.label} items={g.items} count={count} index={i + 1} />
      ))}

      {(areas.length > 0 || active.length > 0) && (
        <Block title="Mis áreas y proyectos">
          <Group>
            {areas.map((a) => (
              <div key={a.id}>
                <LinkRow to={`/area/${a.id}`} icon={<AreaBadge icon={a.icon} />} label={a.name} count={c.byArea.get(a.id)} />
                {active
                  .filter((p) => p.areaId === a.id)
                  .map((p) => (
                    <LinkRow key={p.id} indent to={`/project/${p.id}`} icon={<ProgressPie value={progress.get(p.id) ?? 0} size={16} className="text-muted" />} label={p.name} count={c.byProject.get(p.id)} />
                  ))}
              </div>
            ))}
            {active
              .filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId))
              .map((p) => (
                <LinkRow key={p.id} to={`/project/${p.id}`} icon={<ProgressPie value={progress.get(p.id) ?? 0} size={16} className="text-muted" />} label={p.name} count={c.byProject.get(p.id)} />
              ))}
          </Group>
        </Block>
      )}

      <Block title="Ajustes">
        <Group>
          {SECTIONS.filter((s) => FOOT.includes(s.id)).map((s) => (
            <LinkRow key={s.id} to={s.path} icon={<SectionIcon def={s} size={28} square />} label={s.label} />
          ))}
          <ButtonRow icon={<LayoutGrid size={16} strokeWidth={2.4} />} label="Elegir funciones" onClick={() => ui.features()} />
          <ButtonRow icon={<PanelBottom size={16} strokeWidth={2.4} />} label="Elegir las pestañas" onClick={() => ui.navEditor('tabs')} />
        </Group>
      </Block>
    </Page>
  )
}

/**
 * Acciones rápidas como las baldosas de Atajos: glifo arriba y nombre abajo.
 * La principal (nueva tarea) en el acento; el resto, de cristal.
 */
function QuickActions() {
  const features = useFeatures()
  const actions: { id: string; label: string; icon: LucideIcon; to?: string; run?: () => void }[] = [
    { id: 'task', label: 'Nueva tarea', icon: Plus, run: () => ui.quickAdd() },
    { id: 'focus', label: 'Empezar foco', icon: Timer, to: '/focus' },
    { id: 'expenses', label: 'Apuntar gasto', icon: Receipt, to: '/expenses' },
    { id: 'journal', label: 'Escribir el diario', icon: BookOpen, to: '/journal' },
  ]
  const shown = actions.filter((a) => a.id === 'task' || features.section(a.id))
  return (
    <Block title="Acciones rápidas">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {shown.map((a, i) => {
          const main = i === 0
          const body = (
            <>
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-full', main ? 'bg-white/20' : 'bg-fill')}>
                <a.icon size={18} strokeWidth={2.4} aria-hidden />
              </span>
              <span className="text-[15px] leading-tight font-semibold">{a.label}</span>
            </>
          )
          const cls = cx(
            'flex h-[92px] w-full flex-col justify-between rounded-[18px] p-3.5 text-left transition-transform active:scale-95',
            main ? 'bg-accent-fill text-white shadow-[0_10px_24px_-14px_rgb(0_0_0/0.55)]' : 'glass',
          )
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: i * 0.03 }}>
              {a.to ? (
                <a href={href(a.to)} className={cls}>
                  {body}
                </a>
              ) : (
                <button type="button" onClick={a.run} className={cls}>
                  {body}
                </button>
              )}
            </motion.div>
          )
        })}
      </div>
    </Block>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7" aria-label={title}>
      <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  )
}

/** Un grupo de secciones en cuadrícula, como los iconos de una pantalla de inicio */
function Tiles({ title, items, count, index = 0 }: { title: string; items: SectionDef[]; count: Record<string, number | undefined>; index?: number }) {
  return (
    <Block title={title}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((s, i) => (
          <motion.a
            key={s.id}
            href={href(s.path)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: index * 0.04 + i * 0.02 }}
            className="glass relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[18px] px-2 py-3 text-center transition-transform active:scale-95"
          >
            <SectionIcon def={s} size={36} />
            <span className="text-[13px] leading-tight font-medium">{s.short}</span>
            {!!count[s.id] && (
              <span className="font-num absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white" style={{ background: 'var(--c-accent-fill)' }}>
                {count[s.id]}
                <span className="sr-only"> pendientes</span>
              </span>
            )}
          </motion.a>
        ))}
      </div>
    </Block>
  )
}

const rowCls =
  "relative flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] transition-colors hover:bg-hover after:absolute after:right-0 after:bottom-0 after:left-[56px] after:h-px after:bg-line after:content-[''] last:after:hidden"

function LinkRow({ to, icon, label, count, indent }: { to: string; icon: React.ReactNode; label: string; count?: number; indent?: boolean }) {
  return (
    <a href={href(to)} className={cx(rowCls, indent && 'pl-10')}>
      <span className="flex w-7 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && <span className="font-num text-[14px] text-muted">{count}</span>}
      <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
    </a>
  )
}

function ButtonRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={rowCls}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-fill">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
    </button>
  )
}

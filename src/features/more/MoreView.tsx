import { m as motion } from 'motion/react'
import { BookOpen, ChevronRight, Hash, LayoutGrid, ListFilter, type LucideIcon, PanelBottom, Receipt, Search, Timer } from 'lucide-react'
import { useLookup } from '@/db/hooks'
import { useNavCounts, useProjectProgress, useSmartListCounts } from '@/app/counts'
import { useSmartLists } from '@/app/smartLists'
import { useNav } from '@/app/nav'
import { usePins } from '@/app/pins'
import { href } from '@/app/router'
import { HUBS, SECTIONS, type HubDef } from '@/app/sections'
import { hubPath, hubTabs } from '@/app/hubs'
import { ui } from '@/app/store'
import { useFeatures } from '@/app/features'
import { Icon } from '@/components/icons'
import { Group, PageHeader, ProgressPie, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'

const FOOT = ['trash', 'settings']

/**
 * «Más» (la pestaña del móvil), como la barra lateral en lista: buscar, unos
 * atajos, los lugares que no están en las pestañas (con lo pendiente), lo
 * fijado, tus áreas y proyectos, tus filtros y los ajustes.
 */
export function MoreView() {
  const nav = useNav()
  const features = useFeatures()
  const c = useNavCounts()
  const pins = usePins()
  const { areas, projects } = useLookup()
  const active = projects.filter((p) => p.status === 'active')
  const progress = useProjectProgress([...new Set([...active.map((p) => p.id), ...pins.filter((p) => p.kind === 'project').map((p) => p.id)])])

  // En el orden de la barra lateral, sin los que ya son pestañas
  const shown = nav.order.map((id) => HUBS.find((h) => h.id === id)).filter((h): h is HubDef => !!h && hubTabs(h, features.section).length > 0 && !nav.tabs.includes(h.id))
  const count: Record<string, number | undefined> = {
    today: c.today,
    inbox: c.inbox,
    habits: c.habitsLeft,
    home: c.shopping,
    people: c.peopleDue,
  }
  const smart = useSmartLists()
  const smartOn = features.on('lists') ? smart : []
  const smartCounts = useSmartListCounts(smartOn)

  const pinned = pins.flatMap((pin) => {
    if (pin.kind === 'project') {
      const p = projects.find((x) => x.id === pin.id)
      return p ? [{ key: `p:${p.id}`, to: `/project/${p.id}`, label: p.name, icon: <ProgressPie value={progress.get(p.id) ?? 0} size={18} className="text-muted" /> }] : []
    }
    if (pin.kind === 'area') {
      const a = areas.find((x) => x.id === pin.id)
      return a ? [{ key: `a:${a.id}`, to: `/area/${a.id}`, label: a.name, icon: <Icon name={a.icon} size={18} strokeWidth={2.1} className="text-muted" /> }] : []
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
      />

      {/* Como el campo de búsqueda de Ajustes del iPhone: abre ⌘K */}
      <button
        type="button"
        onClick={() => ui.palette()}
        className="mb-5 flex h-11 w-full items-center gap-2 rounded-[12px] bg-fill px-3 text-[16px] text-muted transition-colors active:bg-hover"
      >
        <Search size={17} strokeWidth={2.3} aria-hidden /> Buscar en LUNO
      </button>

      <QuickActions />

      {shown.length > 0 && (
        <Block title="Lugares">
          <Group>
            {shown.map((h) => (
              <LinkRow key={h.id} to={hubPath(h, features.section)} icon={<HubGlyph def={h} />} label={h.label} count={count[h.id]} />
            ))}
          </Group>
        </Block>
      )}

      {pinned.length > 0 && (
        <Block title="Fijados">
          <Group>
            {pinned.map((p) => (
              <LinkRow key={p.key} to={p.to} icon={p.icon} label={p.label} />
            ))}
          </Group>
        </Block>
      )}

      {(areas.length > 0 || active.length > 0) && (
        <Block title="Mis áreas y proyectos">
          <Group>
            {areas.map((a) => (
              <div key={a.id}>
                <LinkRow to={`/area/${a.id}`} icon={<Icon name={a.icon} size={18} strokeWidth={2.1} className="text-muted" />} label={a.name} count={c.byArea.get(a.id)} />
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

      {smartOn.length > 0 && (
        <Block title="Mis filtros">
          <Group>
            {smartOn.map((l) => (
              <LinkRow key={l.id} to={`/list/${l.id}`} icon={<ListFilter size={18} strokeWidth={2.1} className="text-muted" />} label={l.name} count={smartCounts.get(l.id)} />
            ))}
          </Group>
        </Block>
      )}

      <Block title="Ajustes">
        <Group>
          {SECTIONS.filter((s) => FOOT.includes(s.id)).map((s) => (
            <LinkRow key={s.id} to={s.path} icon={<HubGlyph def={s} />} label={s.label} />
          ))}
          <ButtonRow icon={<LayoutGrid size={16} strokeWidth={2.4} />} label="Elegir funciones" onClick={() => ui.features()} />
          <ButtonRow icon={<PanelBottom size={16} strokeWidth={2.4} />} label="Elegir las pestañas" onClick={() => ui.navEditor('tabs')} />
        </Group>
      </Block>
    </Page>
  )
}

/** Atajos a lo que se hace a menudo, en una fila (crear una tarea ya está en el «+») */
function QuickActions() {
  const features = useFeatures()
  const actions: { id: string; label: string; icon: LucideIcon; to: string }[] = [
    { id: 'focus', label: 'Empezar foco', icon: Timer, to: '/focus' },
    { id: 'expenses', label: 'Apuntar gasto', icon: Receipt, to: '/expenses' },
    { id: 'journal', label: 'Escribir el diario', icon: BookOpen, to: '/journal' },
  ]
  const shown = actions.filter((a) => features.section(a.id))
  if (!shown.length) return null
  return (
    <div className="no-scrollbar -mx-4 mb-7 flex gap-2 overflow-x-auto px-4" aria-label="Atajos" role="group">
      {shown.map((a, i) => (
        <motion.a
          key={a.id}
          href={href(a.to)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...softSpring, delay: i * 0.03 }}
          className="glass flex h-10 shrink-0 items-center gap-2 rounded-full pr-4 pl-3 text-[14.5px] font-semibold transition-transform active:scale-95"
        >
          <a.icon size={16} strokeWidth={2.4} aria-hidden /> {a.label}
        </motion.a>
      ))}
    </div>
  )
}

/** El glifo de un lugar, como en la barra lateral */
function HubGlyph({ def }: { def: Pick<HubDef, 'icon'> }) {
  if (def.icon === 'today')
    return (
      <span className="font-num flex h-[19px] w-[19px] items-center justify-center rounded-[5px] border-[1.6px] border-current text-[10px] leading-none font-bold text-muted">
        {new Date().getDate()}
      </span>
    )
  return <def.icon size={19} strokeWidth={2.1} className="text-muted" />
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7" aria-label={title}>
      <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  )
}

const rowCls =
  "relative flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-[16px] transition-colors hover:bg-hover active:bg-press after:absolute after:right-0 after:bottom-0 after:left-[56px] after:h-px after:bg-line after:content-[''] last:after:hidden"

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

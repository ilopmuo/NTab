import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { m as motion } from 'motion/react'
import { Check, History, Plus, RotateCcw, Trophy } from 'lucide-react'
import type { Tracker } from '@/db/types'
import { db } from '@/db/db'
import { createTracker } from '@/db/actions'
import { markDone, markSlip } from './markDone'
import { today } from '@/lib/dates'
import { AVOID_PRESETS, CLEANING_PRESETS, TRACKER_PRESETS, byRoom, dirtiness, dirtinessLabel, cleanDays, cleanRecord, everyLabel, inLabel, milestoneLabel, nextMilestone, savedSince, sinceLabel, sortTrackers, trackerState } from '@/lib/trackers'
import { money } from '@/lib/finance'
import { setUI, toast, useUI } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Icon } from '@/components/icons'
import { Button, Empty, Group, PageHeader, Section, Segmented, cx, spring } from '@/components/ui'
import { Page } from '../Page'
import { TrackerForm } from './TrackerForm'


/** «Días sin…»: cuántos días llevas, tu récord, lo ahorrado y la siguiente meta */
function AvoidCard({ tracker, onEdit, index = 0 }: { tracker: Tracker; onEdit: () => void; index?: number }) {
  const t = today()
  const days = cleanDays(tracker, t)
  const record = cleanRecord(tracker, t)
  const saved = savedSince(tracker, t)
  const next = nextMilestone(days)
  const slipToday = tracker.log[0] === t
  const what = tracker.name.charAt(0).toLowerCase() + tracker.name.slice(1)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index, 8) * 0.04 }}
      className="glass flex flex-col rounded-[20px] p-4"
    >
      <button type="button" onClick={onEdit} className="flex items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
          <Icon name={tracker.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{tracker.name}</span>
          <span className="flex items-center gap-1 text-[13px] text-muted">
            {record > 0 ? (
              <>
                <Trophy size={12} strokeWidth={2.4} aria-hidden /> Récord: {milestoneLabel(record)}
              </>
            ) : (
              'Lo quieres dejar'
            )}
          </span>
        </span>
      </button>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-num text-[34px] leading-none font-bold tracking-tight">{days}</span>{' '}
        <span className="text-[15px] font-semibold">
          {days === 1 ? 'día' : 'días'} sin {what}
        </span>
      </p>
      <p className="mt-1 text-[12.5px] text-muted">
        {[saved > 0 && `${money(saved)} ahorrados`, next && `Próxima meta: ${milestoneLabel(next.at)} (${next.left === 1 ? 'mañana' : `faltan ${next.left} días`})`].filter(Boolean).join(' · ') || '¡Lo has conseguido!'}
      </p>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={slipToday}
        onClick={() => void markSlip(tracker)}
        className="mt-4 flex h-11 items-center justify-center gap-2 rounded-[14px] bg-fill text-[15px] font-semibold text-fg transition-colors hover:bg-press disabled:text-muted"
      >
        <RotateCcw size={16} strokeWidth={2.6} aria-hidden /> {slipToday ? 'Apuntado hoy' : 'He vuelto a caer'}
      </motion.button>
    </motion.div>
  )
}

/** Una tarjeta: cuánto hace, si toca y el botón de «Hecho hoy» */
export function TrackerCard({ tracker, onEdit, index = 0 }: { tracker: Tracker; onEdit: () => void; index?: number }) {
  if (tracker.avoid) return <AvoidCard tracker={tracker} onEdit={onEdit} index={index} />
  const t = today()
  const s = trackerState(tracker, t)
  const doneToday = tracker.log[0] === t
  const due = s.kind === 'due'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index, 8) * 0.04 }}
      className={cx('glass flex flex-col rounded-[20px] p-4', due && 'ring-[1.5px] ring-blue')}
    >
      <button type="button" onClick={onEdit} className="flex items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
          <Icon name={tracker.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{tracker.name}</span>
          <span className={cx('block text-[13px]', due ? 'font-semibold text-blue' : 'text-muted')}>
            {s.kind === 'due'
              ? s.late === 0
                ? 'Toca hoy'
                : `Toca desde hace ${s.late} ${s.late === 1 ? 'día' : 'días'}`
              : s.kind === 'ok' && s.nextIn !== undefined
                ? `Toca ${inLabel(s.nextIn)}`
                : tracker.every
                  ? everyLabel(tracker.every)
                  : 'Sin fecha fija'}
          </span>
        </span>
      </button>
      <p className="font-num mt-4 text-[28px] leading-none font-bold tracking-tight">{s.kind === 'never' ? 'Nunca' : sinceLabel(s.since)}</p>
      <p className="mt-1 text-[12.5px] text-muted">{s.kind === 'never' ? 'Aún no lo has apuntado' : `Última vez · ${tracker.log.length} ${tracker.log.length === 1 ? 'vez' : 'veces'}`}</p>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={doneToday}
        onClick={() => void markDone(tracker)}
        className={cx(
          'mt-4 flex h-11 items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold transition-colors',
          doneToday ? 'bg-green text-on-green' : due ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-press',
        )}
      >
        <Check size={17} strokeWidth={2.8} /> {doneToday ? 'Hecho hoy' : 'Lo he hecho hoy'}
      </motion.button>
    </motion.div>
  )
}

/** Barra de suciedad (como en Tody): se llena con los días y se marca con el acento cuando toca */
function DirtBar({ level, label }: { level: number; label: string }) {
  const due = level >= 1
  return (
    <span className="flex items-center gap-2" role="img" aria-label={`${label}: ${dirtinessLabel(level).toLowerCase()}`}>
      <span className="relative h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-fill">
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (level / 1.5) * 100)}%`, background: due ? 'var(--c-blue)' : 'var(--c-muted)' }} />
      </span>
      <span className={cx('w-[84px] shrink-0 text-right text-[12.5px] font-semibold', due ? 'text-blue' : 'text-muted')}>{dirtinessLabel(level)}</span>
    </span>
  )
}

/** Limpieza por estancias (como Tody): cada estancia con lo suyo, de lo más sucio a lo más limpio */
function Rooms({ list, onEdit, onAdd }: { list: Tracker[]; onEdit: (t: Tracker) => void; onAdd: (room: string) => void }) {
  const t = today()
  const rooms = byRoom(list, t)
  const presetRooms = [...new Set(CLEANING_PRESETS.map((p) => p.room))]
  return (
    <>
      {rooms.length === 0 && (
        <p className="mb-4 px-1 text-[14px] text-muted">Pon una estancia a lo que haces en casa (al editarlo) o empieza con lo típico de cada estancia:</p>
      )}
      {rooms.map((r) => (
        <Section key={r.room} title={r.room} count={r.items.length} action={<span className="w-40"><DirtBar level={r.level} label={r.room} /></span>}>
          <Group>
            {r.items.map((x) => {
              const level = dirtiness(x, t)
              const doneToday = x.log[0] === t
              return (
                <div key={x.id} className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                  <button type="button" onClick={() => onEdit(x)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[15px] font-medium">{x.name}</span>
                    {level !== undefined ? <DirtBar level={level} label={x.name} /> : <span className="text-[12.5px] text-muted">Sin frecuencia</span>}
                  </button>
                  <button
                    type="button"
                    disabled={doneToday}
                    onClick={() => void markDone(x)}
                    aria-label={doneToday ? `${x.name}: hecho hoy` : `${x.name}: lo he hecho hoy`}
                    className={cx('flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-transform active:scale-95', doneToday ? 'bg-green text-on-green' : 'bg-fill text-fg hover:bg-press')}
                  >
                    <Check size={14} strokeWidth={2.8} /> {doneToday ? 'Hecho' : 'Hecho hoy'}
                  </button>
                </div>
              )
            })}
          </Group>
        </Section>
      ))}
      <div className="mb-8 flex flex-wrap gap-2">
        {presetRooms
          .filter((room) => CLEANING_PRESETS.some((p) => p.room === room && !list.some((x) => x.name === p.name)))
          .map((room) => (
            <button key={room} type="button" onClick={() => onAdd(room)} className="glass flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-transform active:scale-95">
              <Plus size={14} strokeWidth={2.6} aria-hidden /> Lo típico de {room.toLowerCase()}
            </button>
          ))}
      </div>
    </>
  )
}

/** «Última vez»: cosas que se hacen de vez en cuando y cuánto hace de la última */
export function TrackersView() {
  const trackers = useLiveQuery(() => db.trackers.where('archived').equals(0).toArray(), [])
  const creating = useUI((s) => s.creating === 'tracker')
  const [editing, setEditing] = useState<Tracker | undefined>()
  const [view, setView] = useState<'all' | 'rooms'>(() => {
    try {
      return localStorage.getItem('ntab-trackers-view') === 'rooms' ? 'rooms' : 'all'
    } catch {
      return 'all'
    }
  })
  const chooseView = (v: 'all' | 'rooms') => {
    setView(v)
    try {
      localStorage.setItem('ntab-trackers-view', v)
    } catch {
      /* solo en memoria */
    }
  }
  if (!trackers) return null
  const addRoomPresets = async (room: string) => {
    const missing = CLEANING_PRESETS.filter((p) => p.room === room && !trackers.some((x) => x.name === p.name))
    for (const p of missing) await createTracker({ name: p.name, icon: p.icon, every: p.every, room: p.room })
    toast(`${missing.length} ${missing.length === 1 ? 'tarea' : 'tareas'} de ${room.toLowerCase()}. Toca «Hecho hoy» en lo que hayas hecho hace poco.`)
  }
  const list = sortTrackers(trackers)
  const due = list.filter((t) => trackerState(t).kind === 'due').length
  const ideas = [...TRACKER_PRESETS, ...AVOID_PRESETS].filter((p) => !trackers.some((t) => t.name === p.name))
  const presets = (
    <div className="flex flex-wrap justify-center gap-2">
      {ideas.map((p, i) => (
        <motion.button
          key={p.name}
          type="button"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: i * 0.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => createTracker(p)}
          className="glass flex h-10 items-center gap-2 rounded-full pr-4 pl-1.5 text-[14px] font-medium"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-fg">
            <Icon name={p.icon} size={14} strokeWidth={2.4} />
          </span>
          {'avoid' in p ? `Dejar: ${p.name.toLowerCase()}` : p.name}
        </motion.button>
      ))}
    </div>
  )
  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('trackers')} size={40} />}
        title="Última vez"
        subtitle={due ? `Toca hacer ${due} ${due === 1 ? 'cosa' : 'cosas'}.` : '¿Cuándo fue la última vez que…? Apúntalo con un toque y LUNO te avisa cuando toque. También cuenta los días sin lo que quieres dejar.'}
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'tracker' })}>
            <Plus size={16} strokeWidth={2.6} /> Nuevo
          </Button>
        }
      />
      <Segmented
        value={view}
        onChange={chooseView}
        className="mb-5"
        options={[
          { value: 'all', label: 'Todo' },
          { value: 'rooms', label: 'Por estancia' },
        ]}
      />
      {view === 'rooms' ? (
        <Rooms list={list} onEdit={setEditing} onAdd={(room) => void addRoomPresets(room)} />
      ) : list.length === 0 ? (
        <Group>
          <Empty icon={<History size={28} strokeWidth={2.2} />} color="var(--c-blue)" title="¿Hace cuánto que…?" hint="Para lo que haces de vez en cuando y nunca recuerdas cuándo fue la última vez. Toca una idea:">
            {presets}
          </Empty>
        </Group>
      ) : (
        <div className="grid gap-4 @[640px]:grid-cols-2 @[980px]:grid-cols-3">
          {list.map((t, i) => (
            <TrackerCard key={t.id} tracker={t} index={i} onEdit={() => setEditing(t)} />
          ))}
        </div>
      )}
      {view === 'all' && list.length > 0 && ideas.length > 0 && list.length < 8 && (
        <div className="mt-8">
          <p className="mb-3 px-1 text-[17px] font-bold text-muted">Ideas</p>
          <div className="[&>div]:justify-start">{presets}</div>
        </div>
      )}
      <TrackerForm open={creating} onClose={() => setUI({ creating: null })} />
      <TrackerForm tracker={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

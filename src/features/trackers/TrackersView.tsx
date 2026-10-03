import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { m as motion } from 'motion/react'
import { Check, ChevronRight, History, Plus, RotateCcw, SprayCan, Trophy } from 'lucide-react'
import type { Tracker } from '@/db/types'
import { db } from '@/db/db'
import { createTracker } from '@/db/actions'
import { markDone, markSlip } from './markDone'
import { today } from '@/lib/dates'
import { AVOID_PRESETS, TRACKER_PRESETS, cleanDays, cleanRecord, everyLabel, inLabel, milestoneLabel, nextMilestone, savedSince, sinceLabel, sortTrackers, trackerState } from '@/lib/trackers'
import { money } from '@/lib/finance'
import { setUI, useUI } from '@/app/store'
import { href } from '@/app/router'
import { SectionIcon, section } from '@/app/sections'
import { Icon } from '@/components/icons'
import { Button, Empty, Group, PageHeader, cx, spring } from '@/components/ui'
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

/** «Última vez»: cosas que se hacen de vez en cuando y cuánto hace de la última */
export function TrackersView() {
  const trackers = useLiveQuery(() => db.trackers.where('archived').equals(0).toArray(), [])
  const creating = useUI((s) => s.creating === 'tracker')
  const [editing, setEditing] = useState<Tracker | undefined>()
  if (!trackers) return null
  // La limpieza por estancias está en Casa → Tareas
  const cleaning = trackers.filter((t) => t.room && !t.avoid).length
  const list = sortTrackers(trackers.filter((t) => !t.room || t.avoid))
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
      {cleaning > 0 && (
        <a href={href('/house')} className="glass mb-5 flex items-center gap-3 rounded-[16px] px-4 py-3 text-[14.5px]">
          <SprayCan size={17} className="shrink-0" />
          <span className="min-w-0 flex-1">
            La limpieza por estancias ({cleaning}) está en <b className="font-semibold">Casa → Tareas</b>
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </a>
      )}
      {list.length === 0 ? (
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
      {list.length > 0 && ideas.length > 0 && list.length < 8 && (
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

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus } from 'lucide-react'
import type { Tracker } from '@/db/types'
import { db } from '@/db/db'
import { createTracker } from '@/db/moreActions'
import { today } from '@/lib/dates'
import { CLEANING_PRESETS, byRoom, dirtiness, dirtinessLabel } from '@/lib/trackers'
import { toast } from '@/app/store'
import { Group, Section, cx } from '@/components/ui'
import { markDone } from '../trackers/markDone'
import { TrackerForm } from '../trackers/TrackerForm'

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

/**
 * Limpieza por estancias (como Tody): cada estancia con lo suyo, de lo más
 * sucio a lo más limpio. Es tuya (no del piso): lo de «Última vez» que tiene
 * estancia. `starters`: enseñar «Lo típico de…» para empezar.
 */
export function Cleaning({ title = 'Limpieza por estancias', starters = true }: { title?: string; starters?: boolean }) {
  const all = useLiveQuery(() => db.trackers.where('archived').equals(0).toArray(), [])
  const [editing, setEditing] = useState<Tracker | undefined>()
  if (!all) return null
  const t = today()
  const list = all.filter((x) => x.room && !x.avoid)
  if (!list.length && !starters) return null
  const rooms = byRoom(list, t)
  const due = list.filter((x) => (dirtiness(x, t) ?? 0) >= 1).length
  const missing = [...new Set(CLEANING_PRESETS.map((p) => p.room))].filter((room) => CLEANING_PRESETS.some((p) => p.room === room && !all.some((x) => x.name === p.name)))
  const addRoom = async (room: string) => {
    const add = CLEANING_PRESETS.filter((p) => p.room === room && !all.some((x) => x.name === p.name))
    for (const p of add) await createTracker({ name: p.name, icon: p.icon, every: p.every, room: p.room })
    toast(`${add.length} ${add.length === 1 ? 'tarea' : 'tareas'} de ${room.toLowerCase()}. Toca «Hecho hoy» en lo que hayas hecho hace poco.`)
  }
  return (
    <Section title={title} count={due || undefined}>
      {rooms.length === 0 && <p className="mb-3 px-1 text-[14px] text-muted">Lo que limpias tú, por estancias, con una barra que se va llenando hasta que toca. Empieza con lo típico de cada una:</p>}
      {rooms.map((r) => (
        <div key={r.room} className="mb-4">
          <div className="mb-1.5 flex items-center gap-3 px-1">
            <h3 className="flex-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{r.room}</h3>
            <span className="w-40">
              <DirtBar level={r.level} label={r.room} />
            </span>
          </div>
          <Group>
            {r.items.map((x) => {
              const level = dirtiness(x, t)
              const doneToday = x.log[0] === t
              return (
                <div key={x.id} className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                  <button type="button" onClick={() => setEditing(x)} className="min-w-0 flex-1 text-left">
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
        </div>
      ))}
      {starters && missing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {missing.map((room) => (
            <button key={room} type="button" onClick={() => void addRoom(room)} className="glass flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-transform active:scale-95">
              <Plus size={14} strokeWidth={2.6} aria-hidden /> Lo típico de {room.toLowerCase()}
            </button>
          ))}
        </div>
      )}
      <TrackerForm tracker={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Section>
  )
}

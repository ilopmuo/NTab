import { useLiveQuery } from 'dexie-react-hooks'
import { Check, History } from 'lucide-react'
import { db } from '@/db/db'
import { sinceLabel, sortTrackers, trackerState } from '@/lib/trackers'
import { href } from '@/app/router'
import { Icon } from '@/components/icons'
import { Card } from '@/components/ui'
import { markDone } from './markDone'

/** En Hoy: lo de «Última vez» que ya toca */
export function TrackersDue() {
  const trackers = useLiveQuery(() => db.trackers.where('archived').equals(0).toArray(), []) ?? []
  const due = sortTrackers(trackers).filter((t) => trackerState(t).kind === 'due').slice(0, 4)
  if (!due.length) return null
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <History size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Toca hacer</h3>
        <a href={href('/trackers')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Ver todo
        </a>
      </div>
      <div className="space-y-0.5">
        {due.map((t) => {
          const s = trackerState(t)
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
                <Icon name={t.icon} size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{t.name}</span>
                <span className="block text-[12.5px] text-muted">{s.kind === 'due' ? `Última vez: ${sinceLabel(s.since).toLowerCase()}` : ''}</span>
              </span>
              <button type="button" aria-label={`${t.name}: hecho hoy`} onClick={() => void markDone(t)} className="flex h-8 items-center gap-1 rounded-full bg-fill px-3 text-[13px] font-semibold active:scale-95">
                <Check size={14} strokeWidth={2.8} /> Hecho
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

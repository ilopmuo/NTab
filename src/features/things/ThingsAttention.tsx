import { useLiveQuery } from 'dexie-react-hooks'
import { Box, ChevronRight } from 'lucide-react'
import { db } from '@/db/db'
import { needsAttention } from '@/lib/things'
import { href } from '@/app/router'
import { Card, cx } from '@/components/ui'
import { thingLine } from './ThingRow'

/** En Hoy: lo que caduca pronto y los préstamos que conviene reclamar o devolver */
export function ThingsAttention() {
  const things = useLiveQuery(() => db.things.toArray(), []) ?? []
  const list = things.filter((t) => needsAttention(t)).slice(0, 4)
  if (!list.length) return null
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Box size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Cosas</h3>
        <a href={href('/things')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Ver todas
        </a>
      </div>
      <div className="space-y-0.5">
        {list.map((t) => {
          const line = thingLine(t)
          return (
            <a key={t.id} href={href(`/things/${t.id}`)} className="flex items-center gap-3 rounded-xl px-1 py-1.5 transition-colors hover:bg-hover">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{t.name}</span>
                <span className={cx('block truncate text-[12.5px]', line.strong ? 'font-semibold text-fg' : 'text-muted')}>{line.text}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-faint" />
            </a>
          )
        })}
      </div>
    </Card>
  )
}

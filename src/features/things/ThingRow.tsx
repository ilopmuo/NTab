import { motion } from 'motion/react'
import { ArrowDownLeft, ArrowUpRight, Box, FileClock, MapPin } from 'lucide-react'
import type { Thing } from '@/db/types'
import { updateThing } from '@/db/actions'
import { daysUntil, expiryStatus, relativeLabel } from '@/lib/things'
import { toast } from '@/app/store'
import { haptic } from '@/lib/haptics'
import { cx, softSpring } from '@/components/ui'

const ICON = { stored: Box, lent: ArrowUpRight, borrowed: ArrowDownLeft, document: FileClock }

export function thingLine(t: Thing): { text: string; strong?: boolean } {
  if (t.kind === 'document' && t.expires) {
    const s = expiryStatus(t)!
    return { text: s.level === 'expired' ? `Caducó ${relativeLabel(s.days)}` : `Caduca ${relativeLabel(s.days)}`, strong: s.level !== 'ok' }
  }
  if (t.kind === 'lent') {
    const who = t.personName ?? 'alguien'
    if (t.returned) return { text: `Devuelto por ${who}` }
    if (t.returnBy && daysUntil(t.returnBy) <= 0) return { text: `Lo tiene ${who} · tocaba devolverlo ${relativeLabel(daysUntil(t.returnBy))}`, strong: true }
    return { text: `Lo tiene ${who}${t.since ? ` desde ${relativeLabel(daysUntil(t.since))}` : ''}` }
  }
  if (t.kind === 'borrowed') {
    const who = t.personName ?? 'alguien'
    if (t.returned) return { text: `Devuelto a ${who}` }
    if (t.returnBy) return { text: `De ${who} · devolver ${relativeLabel(daysUntil(t.returnBy))}`, strong: daysUntil(t.returnBy) <= 2 }
    return { text: `De ${who}` }
  }
  return { text: t.location ? '' : 'Sin sitio apuntado' }
}

export function ThingRow({ thing, onOpen, index = 0 }: { thing: Thing; onOpen: () => void; index?: number }) {
  const Icon = ICON[thing.kind]
  const line = thingLine(thing)
  const loan = (thing.kind === 'lent' || thing.kind === 'borrowed') && !thing.returned
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { ...softSpring, delay: Math.min(index, 10) * 0.03 } }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
      className="relative after:absolute after:right-0 after:bottom-0 after:left-[64px] after:h-px after:bg-line last:after:hidden"
    >
      <div className={cx('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover', thing.returned && 'opacity-55')}>
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {thing.photo ? (
            <img src={thing.photo} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-fill text-fg">
              <Icon size={18} strokeWidth={2.2} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{thing.name}</span>
            {thing.location && (
              <span className="flex items-center gap-1 truncate text-[13px] text-muted">
                <MapPin size={12} strokeWidth={2.4} className="shrink-0" />
                <span className="truncate">{thing.location}</span>
              </span>
            )}
            {line.text && <span className={cx('block truncate text-[13px]', line.strong ? 'font-semibold text-fg' : 'text-muted')}>{line.text}</span>}
          </span>
        </button>
        {loan && (
          <button
            type="button"
            onClick={() => {
              haptic('success')
              void updateThing(thing.id, { returned: 1 })
              toast(thing.kind === 'lent' ? `${thing.name}: devuelto` : `${thing.name}: ya lo devolviste`, {
                label: 'Deshacer',
                run: () => void updateThing(thing.id, { returned: 0 }),
              })
            }}
            className="shrink-0 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold transition-transform active:scale-95"
          >
            {thing.kind === 'lent' ? 'Me lo devolvió' : 'Ya lo devolví'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

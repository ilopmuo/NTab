import { Check, SprayCan } from 'lucide-react'
import { dateLabel, today } from '@/lib/dates'
import { haptic } from '@/lib/haptics'
import { completeChore, members, myChores, whoseTurn } from '@/lib/house'
import { href } from '@/app/router'
import { toast } from '@/app/store'
import { Card } from '@/components/ui'
import { act, useHouse, useMyHouse } from '../house/store'

/** En Hoy: lo que te toca hacer en casa hoy (o lleva retraso), con «Hecho» a mano */
export default function HouseCard() {
  const mine = useMyHouse()
  const snap = useHouse(mine?.token)
  if (!mine || !snap?.ready || snap.gone) return null
  const t = today()
  const due = myChores(snap.items, mine.me, t).slice(0, 4)
  if (!due.length) return null
  const ids = members(snap.items).map((m) => m.id)
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <SprayCan size={16} className="text-fg" strokeWidth={2.4} />
        <h2 className="text-[15px] font-bold">Te toca en casa</h2>
        <a href={href('/house')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Ver todo
        </a>
      </div>
      <div className="space-y-0.5">
        {due.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{c.data.title}</span>
              <span className="block text-[12.5px] text-muted">{c.data.due && c.data.due < t ? `Desde el ${dateLabel(c.data.due).toLowerCase()}` : 'Hoy'}</span>
            </span>
            <button
              type="button"
              aria-label={`${c.data.title}: hecho`}
              onClick={() => {
                const at = Date.now()
                act(mine.token, [{ op: 'done', id: c.id, by: mine.me, day: t, at }])
                haptic('success')
                const next = completeChore(c.data, mine.me, t, at)
                const who = next.every ? whoseTurn(next, ids) : undefined
                const name = members(snap.items).find((m) => m.id === who)?.data.name
                toast(who && who !== mine.me && name ? `Hecho. La próxima le toca a ${name}` : `Hecho: ${c.data.title}`)
              }}
              className="flex h-8 items-center gap-1 rounded-full bg-fill px-3 text-[13px] font-semibold active:scale-95"
            >
              <Check size={14} strokeWidth={2.8} /> Hecho
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

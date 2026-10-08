import { useLiveQuery } from 'dexie-react-hooks'
import { Receipt } from 'lucide-react'
import { db } from '@/db/db'
import { href } from '@/app/router'
import { Card } from '@/components/ui'
import { ClassifyList } from '../expenses/Classify'

/** En Hoy: los gastos que LUNO no supo clasificar, para responder en un toque */
export default function ClassifyCard() {
  const data = useLiveQuery(async () => {
    const all = await db.expenses.orderBy('date').reverse().toArray()
    return { pending: all.filter((e) => e.unclassified), all }
  }, [])
  if (!data?.pending.length) return null
  const n = data.pending.length
  return (
    <Card className="p-4">
      <a href={href('/expenses')} className="mb-3 flex items-center gap-2">
        <Receipt size={16} className="text-fg" strokeWidth={2.4} />
        <h2 className="text-[15px] font-bold">{n === 1 ? '¿De qué es este gasto?' : '¿De qué son estos gastos?'}</h2>
        {n > 2 && <span className="font-num ml-auto text-[13px] font-semibold text-muted">{n}</span>}
      </a>
      <ClassifyList items={data.pending} history={data.all} max={2} />
      {n > 2 && (
        <a href={href('/expenses')} className="mt-3 block text-[13px] font-semibold text-blue">
          Ver los {n}
        </a>
      )}
    </Card>
  )
}

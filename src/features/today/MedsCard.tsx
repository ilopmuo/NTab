import { useLiveQuery } from 'dexie-react-hooks'
import { Pill } from 'lucide-react'
import { db } from '@/db/db'
import { today } from '@/lib/dates'
import { dosesOn, needsRefill } from '@/lib/meds'
import { href } from '@/app/router'
import { Card } from '@/components/ui'
import { DoseRow, useNow } from '../meds/parts'

/** En Hoy: las tomas de hoy con «Tomada» a mano (y lo que hay que reponer) */
export default function MedsCard() {
  const t = today()
  const meds = useLiveQuery(() => db.meds.where('archived').equals(0).toArray(), [])
  const logs = useLiveQuery(() => db.medLogs.where('date').equals(t).toArray(), [t])
  const now = useNow()
  if (!meds?.length || !logs) return null
  const doses = dosesOn(meds, logs, t, t, now)
  const refill = meds.filter((m) => needsRefill(m, t))
  if (!doses.length && !refill.length) return null
  const taken = doses.filter((d) => d.state === 'taken').length
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Pill size={16} className="text-fg" strokeWidth={2.4} />
        <h2 className="text-[15px] font-bold">Medicación</h2>
        {doses.length > 0 && (
          <span className="font-num text-[13px] font-semibold text-muted">
            {taken}/{doses.length}
          </span>
        )}
        <a href={href('/meds')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Ver todo
        </a>
      </div>
      <div className="space-y-0.5">
        {doses.map((d) => (
          <DoseRow key={`${d.med.id}:${d.time}`} dose={d} compact />
        ))}
      </div>
      {refill.length > 0 && (
        <a href={href('/meds')} className="mt-2 block rounded-xl bg-fill px-3 py-2 text-[13px] font-semibold">
          Toca reponer: {refill.map((m) => m.name).join(', ')}
        </a>
      )}
    </Card>
  )
}

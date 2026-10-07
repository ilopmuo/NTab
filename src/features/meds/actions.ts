import { db } from '@/db/db'
import type { Med, MedLog } from '@/db/types'
import { uid } from '@/lib/id'
import { today } from '@/lib/dates'
import { cleanTimes, doseToTake, nowHHMM, perDoseOf, stockAfter, takeLog } from '@/lib/meds'
import { putInTrash } from '@/db/trash'
import { addShoppingItems } from '@/db/moreActions'

export async function createMed(data: Partial<Med> & { name: string }): Promise<Med> {
  const med: Med = {
    id: uid(),
    color: '#F2F2F7',
    times: [],
    from: today(),
    archived: 0,
    order: Date.now(),
    createdAt: Date.now(),
    ...(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as typeof data),
  }
  med.times = cleanTimes(med.times)
  await db.meds.add(med)
  return med
}

export async function updateMed(id: string, changes: Partial<Med>) {
  await db.meds.update(id, { ...changes, ...(changes.times ? { times: cleanTimes(changes.times) } : {}) })
}

/** A la papelera, con su historial de tomas */
export async function deleteMed(id: string) {
  await db.transaction('rw', db.meds, db.medLogs, db.trash, async () => {
    const m = await db.meds.get(id)
    if (!m) return
    const logs = await db.medLogs.where('medId').equals(id).toArray()
    await putInTrash('meds', m, { related: logs.map((l) => ({ tbl: 'medLogs', data: l as unknown as Record<string, unknown> })) })
    await db.medLogs.bulkDelete(logs.map((l) => l.id))
    await db.meds.delete(id)
  })
}

/**
 * Marca una toma (tomada o saltada) y descuenta de la caja. Sin hora: la
 * pendiente más cercana a ahora, o una toma suelta. Devuelve cómo deshacerlo.
 */
export async function markDose(med: Med, opts: { time?: string; status?: MedLog['status']; date?: string } = {}) {
  const date = opts.date ?? today()
  const status = opts.status ?? 'taken'
  return db.transaction('rw', db.meds, db.medLogs, async () => {
    const fresh = (await db.meds.get(med.id)) ?? med
    const logs = await db.medLogs.where('medId').equals(med.id).toArray()
    const time = opts.time ?? (date === today() ? doseToTake(fresh, logs, date, nowHHMM()).time : undefined)
    const log = takeLog(fresh, date, time, Date.now(), status) as MedLog
    const prev = await db.medLogs.get(log.id)
    // Ya estaba tomada: no se descuenta otra vez
    const stock = prev?.status === 'taken' ? fresh.stock : stockAfter(fresh, status)
    await db.medLogs.put(log)
    if (stock !== fresh.stock) await db.meds.update(med.id, { stock })
    return { log, undo: () => undoDose(log, prev, fresh.stock) }
  })
}

export async function undoDose(log: MedLog, prev: MedLog | undefined, stock: number | undefined) {
  await db.transaction('rw', db.meds, db.medLogs, async () => {
    if (prev) await db.medLogs.put(prev)
    else await db.medLogs.delete(log.id)
    await db.meds.update(log.medId, { stock })
  })
}

/** Una caja nueva: suma unidades */
export async function refillMed(med: Med, units: number) {
  const fresh = (await db.meds.get(med.id)) ?? med
  await db.meds.update(med.id, { stock: Math.max(0, (fresh.stock ?? 0) + units) })
}

/** A la lista de la compra: la de la farmacia si la hay */
export async function medToShopping(med: Med) {
  const lists = ((await db.settings.get('shoppingLists'))?.value as { id: string; name: string }[] | undefined) ?? []
  const pharmacy = lists.find((l) => /farmacia|botiqu/i.test(l.name))
  const added = await addShoppingItems([{ name: med.name }], pharmacy?.id)
  return { added: added.length > 0, list: pharmacy?.name }
}

export { perDoseOf }

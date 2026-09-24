import { db } from './db'
import type { TrashItem } from './types'

/** Días que se guarda lo borrado */
export const TRASH_DAYS = 30

type Tbl = TrashItem['tbl']
const TITLE_FIELD: Record<Tbl, string> = {
  tasks: 'title',
  notes: 'title',
  projects: 'name',
  people: 'name',
  habits: 'name',
  subscriptions: 'name',
  goals: 'title',
  routines: 'name',
  things: 'name',
  trackers: 'name',
  recipes: 'name',
}

export const trashKey = (tbl: Tbl, id: string) => `${tbl}:${id}`

/**
 * Guarda una copia en la papelera. Se llama dentro de la transacción que borra
 * (que debe incluir db.trash).
 */
export async function putInTrash(tbl: Tbl, data: object, extra: Pick<TrashItem, 'related' | 'unlinked'> = {}) {
  const rec = data as Record<string, unknown>
  const id = String(rec.id)
  const title = String(rec[TITLE_FIELD[tbl]] ?? '').trim() || (tbl === 'notes' ? 'Nota sin título' : 'Sin título')
  await db.trash.put({ id: trashKey(tbl, id), tbl, itemId: id, title, data: rec, deletedAt: Date.now(), ...extra })
}

/** Devuelve algo de la papelera a su sitio, con lo que se borró con él */
export async function restoreFromTrash(key: string): Promise<TrashItem | undefined> {
  const tables = [db.trash, db.tasks, db.notes, db.projects, db.people, db.habits, db.subscriptions, db.goals, db.interactions, db.habitLogs, db.routines, db.routineRuns, db.things, db.trackers, db.recipes]
  return db.transaction('rw', tables, async () => {
    const item = await db.trash.get(key)
    if (!item) return undefined
    await db.table(item.tbl).put(item.data)
    for (const r of item.related ?? []) await db.table(r.tbl).put(r.data)
    for (const u of item.unlinked ?? []) {
      await db.table(u.tbl).where('id').equals(u.id).modify((x: Record<string, unknown>) => {
        if (!x[u.field]) x[u.field] = item.itemId
      })
    }
    await db.trash.delete(key)
    return item
  })
}

export async function deleteForever(key: string) {
  await db.trash.delete(key)
}

export async function emptyTrash() {
  await db.trash.clear()
}

/** Lo que lleva más de 30 días en la papelera se borra del todo */
export async function purgeTrash(now = Date.now()) {
  await db.trash.where('deletedAt').below(now - TRASH_DAYS * 864e5).delete()
}

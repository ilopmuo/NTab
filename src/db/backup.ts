import { db, TABLES } from './db'

export interface Backup {
  app: 'ntab'
  version: 1
  exportedAt: string
  data: Record<string, unknown[]>
}

export async function exportData(): Promise<Backup> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  return { app: 'ntab', version: 1, exportedAt: new Date().toISOString(), data }
}

export async function downloadBackup() {
  const backup = await exportData()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ntab-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function isBackup(x: unknown): x is Backup {
  return !!x && typeof x === 'object' && (x as Backup).app === 'ntab' && typeof (x as Backup).data === 'object'
}

/** Sustituye todos los datos por los de la copia. */
export async function importData(backup: Backup) {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      const rows = backup.data[t]
      if (Array.isArray(rows)) await db.table(t).bulkAdd(rows)
    }
  })
}

export async function wipeData() {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear()
  })
}

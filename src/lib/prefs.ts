import { liveQuery } from 'dexie'
import type { NTabDB } from '@/db/db'

/** Preferencias que se leen en caliente (p. ej. desde los hooks de la base de datos) */
export const prefs = {
  /** Avisar automáticamente a la hora de las tareas que tienen hora */
  autoRemind: true,
}

export function watchPrefs(db: NTabDB) {
  return liveQuery(() => db.settings.get('autoRemind')).subscribe({
    next: (row) => (prefs.autoRemind = row?.value !== false),
    error: () => {},
  })
}

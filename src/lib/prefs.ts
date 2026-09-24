import { liveQuery } from 'dexie'
import type { NTabDB } from '@/db/db'

/** Preferencias que se leen en caliente (p. ej. desde los hooks de la base de datos) */
export const prefs = {
  /** Avisar automáticamente a la hora de las tareas que tienen hora */
  autoRemind: true,
  /** Sonar al saltar un aviso con la app abierta */
  reminderSound: true,
}

export function watchPrefs(db: NTabDB) {
  return liveQuery(() => db.settings.bulkGet(['autoRemind', 'reminderSound'])).subscribe({
    next: ([auto, sound]) => {
      prefs.autoRemind = auto?.value !== false
      prefs.reminderSound = sound?.value !== false
    },
    error: () => {},
  })
}

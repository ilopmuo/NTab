import { db } from './db'
import { createArea, createTask, setSetting } from './actions'
import { today } from '@/lib/dates'

export const DEFAULT_AREAS = [
  { name: 'Trabajo', icon: 'briefcase', color: '#0A84FF' },
  { name: 'Personal', icon: 'user', color: '#BF5AF2' },
  { name: 'Salud', icon: 'heart', color: '#FF453A' },
  { name: 'Finanzas', icon: 'wallet', color: '#30D158' },
  { name: 'Hogar', icon: 'home', color: '#FF9F0A' },
  { name: 'Aprendizaje', icon: 'book', color: '#40C8E0' },
]

/** Primera vez que se abre la app: áreas por defecto y unas tareas de bienvenida. */
export async function seedIfEmpty() {
  const seeded = await db.settings.get('seeded')
  if (seeded) return
  await db.transaction('rw', [db.areas, db.tasks, db.settings, db._local], async () => {
    // Se apuntan para saber luego si el usuario ha creado algo propio (ver SyncEngine.isPristine)
    const seedIds: string[] = []
    for (const [i, a] of DEFAULT_AREAS.entries()) seedIds.push((await createArea({ ...a, order: i })).id)
    const t = today()
    const welcome = [
      { title: 'Pulsa N en cualquier sitio para capturar una tarea', priority: 3 as const, dueDate: t },
      { title: 'Prueba a escribir: "Llamar a mamá mañana a las 19 #familia"', priority: 2 as const, dueDate: t },
      { title: 'Abre la paleta con ⌘K (o Ctrl K) y busca lo que quieras', priority: 0 as const, dueDate: t },
      { title: 'Todo lo que no tenga fecha ni proyecto acaba aquí, en la Bandeja', priority: 0 as const },
      { title: 'Haz clic en una tarea para ver sus detalles, subtareas y notas', priority: 0 as const },
    ]
    for (const [i, w] of welcome.entries()) seedIds.push((await createTask({ ...w, order: i })).id)
    await db._local.put({ key: 'seedIds', value: seedIds })
    await setSetting('seeded', true)
  })
}

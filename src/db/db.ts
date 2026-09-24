import Dexie, { type EntityTable } from 'dexie'
import type { Area, FocusLog, Goal, Habit, HabitLog, Interaction, Note, Person, Project, Routine, RoutineRun, Setting, Subscription, Task, Template, Thing, TrashItem } from './types'
import { createTracking, type OutboxEntry } from '@/sync/tracking'
import { computeRemindAt, withDefaultReminder } from '@/lib/reminders'
import { computeSubRemindAt } from '@/lib/finance'
import { prefs } from '@/lib/prefs'

/** Estado interno de la sincronización (solo de este dispositivo, nunca se sube) */
export interface LocalMeta {
  key: string
  value: unknown
}

export class NTabDB extends Dexie {
  areas!: EntityTable<Area, 'id'>
  projects!: EntityTable<Project, 'id'>
  tasks!: EntityTable<Task, 'id'>
  notes!: EntityTable<Note, 'id'>
  habits!: EntityTable<Habit, 'id'>
  habitLogs!: EntityTable<HabitLog, 'id'>
  people!: EntityTable<Person, 'id'>
  interactions!: EntityTable<Interaction, 'id'>
  goals!: EntityTable<Goal, 'id'>
  subscriptions!: EntityTable<Subscription, 'id'>
  trash!: EntityTable<TrashItem, 'id'>
  templates!: EntityTable<Template, 'id'>
  focusLogs!: EntityTable<FocusLog, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routineRuns!: EntityTable<RoutineRun, 'id'>
  things!: EntityTable<Thing, 'id'>
  settings!: EntityTable<Setting, 'key'>
  /** cambios locales pendientes de subir */
  _outbox!: EntityTable<OutboxEntry, 'key'>
  _local!: EntityTable<LocalMeta, 'key'>

  constructor(name = 'ntab') {
    super(name)
    this.version(1).stores({
      areas: 'id, order',
      projects: 'id, areaId, status, order',
      tasks: 'id, done, dueDate, projectId, areaId, *tags, order, completedAt',
      notes: 'id, areaId, projectId, pinned, updatedAt',
      habits: 'id, archived, order',
      habitLogs: 'id, habitId, date, [habitId+date]',
      people: 'id, name, lastContact',
      interactions: 'id, personId, date',
      settings: 'key',
    })
    this.version(2).stores({
      _outbox: 'key, ts',
      _local: 'key',
    })
    this.version(3).stores({
      projects: 'id, areaId, status, order, goalId',
      goals: 'id, status, areaId, order',
      subscriptions: 'id, nextDate, active',
    })
    this.version(5).stores({
      tasks: 'id, done, dueDate, projectId, areaId, *tags, order, completedAt, *people',
    })
    this.version(4).stores({
      trash: 'id, deletedAt',
      templates: 'id, order',
      focusLogs: 'id, date, taskId',
    })
    this.version(6).stores({
      routines: 'id, archived, order',
      routineRuns: 'id, routineId, date, [routineId+date]',
      things: 'id, kind, personId, expires, updatedAt',
    })
  }
}

/** Tablas con datos del usuario: se exportan en las copias y se sincronizan */
export const TABLES = [
  'areas',
  'projects',
  'tasks',
  'notes',
  'habits',
  'habitLogs',
  'people',
  'interactions',
  'goals',
  'subscriptions',
  'trash',
  'templates',
  'focusLogs',
  'routines',
  'routineRuns',
  'things',
  'settings',
] as const
export type TableName = (typeof TABLES)[number]

/**
 * Crea la pareja de conexiones a una misma base de datos:
 * - `db`: la que usa la app; registra cada cambio en el outbox para subirlo.
 * - `raw`: la que usa la sincronización para aplicar lo que llega de la nube
 *   sin volver a marcarlo como cambio local.
 */
export function openDatabase(name = 'ntab') {
  const db = new NTabDB(name)
  const raw = new NTabDB(name)
  db.use(createTracking(db, TABLES))
  return { db, raw }
}

/** Colores de la primera versión → colores de sistema de Apple (se traducen al leer) */
const LEGACY_COLORS: Record<string, string> = {
  '#2f7bff': '#0A84FF',
  '#c5f82a': '#30D158',
  '#64d2ff': '#40C8E0',
}
function modernColor<T extends { color: string }>(obj: T): T {
  const c = LEGACY_COLORS[obj?.color?.toLowerCase()]
  return c ? { ...obj, color: c } : obj
}

const opened = openDatabase()
export const db = opened.db
export const rawDb = opened.raw
db.areas.hook('reading', modernColor)
db.projects.hook('reading', modernColor)
db.habits.hook('reading', modernColor)

/**
 * Avisos de tareas: al crear o modificar una tarea se aplica el aviso automático
 * (si tiene hora y no se ha elegido otro) y se recalcula `remindAt`, que es lo
 * que mira el servidor para enviar la notificación.
 */
export function installReminderHooks(target: NTabDB) {
  target.tasks.hook('creating', (_pk, obj) => {
    const t = withDefaultReminder(obj, prefs.autoRemind)
    if (t.reminder !== obj.reminder) obj.reminder = t.reminder
    const at = computeRemindAt(obj)
    if (at === undefined) delete obj.remindAt
    else obj.remindAt = at
  })
  target.tasks.hook('updating', (mods, _pk, obj) => {
    // Dexie da los cambios por ruta ("reminder.at"), y undefined = se borra
    const m = mods as Record<string, unknown>
    const touches = (k: string) => Object.keys(m).some((p) => p === k || p.startsWith(`${k}.`))
    if (!['reminder', 'dueDate', 'dueTime'].some(touches)) return
    const next = Dexie.deepClone(obj) as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(m)) Dexie.setByKeyPath(next, k, v)
    const merged = withDefaultReminder(next as unknown as Task, prefs.autoRemind)
    const changes: Partial<Task> = {}
    if (merged.reminder !== next.reminder) changes.reminder = merged.reminder
    const at = computeRemindAt(merged)
    if (at !== obj.remindAt) changes.remindAt = at
    return Object.keys(changes).length ? changes : undefined
  })

  // Pagos: avisar `notifyDays` antes del próximo cargo
  target.subscriptions.hook('creating', (_pk, obj) => {
    const at = computeSubRemindAt(obj)
    if (at === undefined) delete obj.remindAt
    else obj.remindAt = at
  })
  target.subscriptions.hook('updating', (mods, _pk, obj) => {
    const m = mods as Record<string, unknown>
    if (!['nextDate', 'notifyDays', 'active'].some((k) => k in m)) return
    const at = computeSubRemindAt({ ...obj, ...m } as Subscription)
    return at !== obj.remindAt ? { remindAt: at } : undefined
  })
}
installReminderHooks(db)

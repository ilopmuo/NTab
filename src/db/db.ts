import Dexie, { type EntityTable } from 'dexie'
import type { Area, Habit, HabitLog, Interaction, Note, Person, Project, Setting, Task } from './types'
import { createTracking, type OutboxEntry } from '@/sync/tracking'

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

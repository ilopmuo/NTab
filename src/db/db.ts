import Dexie, { type EntityTable } from 'dexie'
import type { Area, Habit, HabitLog, Interaction, Note, Person, Project, Setting, Task } from './types'

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
  }
}

export const db = new NTabDB()

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

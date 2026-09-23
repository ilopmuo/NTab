export type ID = string

export type Priority = 0 | 1 | 2 | 3 // 0 ninguna, 1 baja, 2 media, 3 alta

export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year'

export interface Recurrence {
  freq: RecurrenceFreq
  interval: number
  /** 0 = domingo … 6 = sábado (solo para freq 'week') */
  weekdays?: number[]
}

export interface Subtask {
  id: ID
  title: string
  done: boolean
}

export interface Area {
  id: ID
  name: string
  icon: string
  color: string
  order: number
}

export type ProjectStatus = 'active' | 'paused' | 'done'

export interface Project {
  id: ID
  name: string
  areaId?: ID
  description: string
  status: ProjectStatus
  deadline?: string
  color: string
  order: number
  createdAt: number
}

export interface Task {
  id: ID
  title: string
  notes: string
  /** 0 | 1 — número para poder indexarlo en IndexedDB */
  done: 0 | 1
  priority: Priority
  /** YYYY-MM-DD */
  dueDate?: string
  /** HH:mm */
  dueTime?: string
  projectId?: ID
  areaId?: ID
  tags: string[]
  subtasks: Subtask[]
  recurrence?: Recurrence
  order: number
  createdAt: number
  completedAt?: number
}

export interface Note {
  id: ID
  title: string
  content: string
  areaId?: ID
  projectId?: ID
  pinned: 0 | 1
  createdAt: number
  updatedAt: number
}

export interface Habit {
  id: ID
  name: string
  icon: string
  color: string
  /** días de la semana en que toca (0 = domingo) */
  days: number[]
  archived: 0 | 1
  order: number
  createdAt: number
}

export interface HabitLog {
  id: ID
  habitId: ID
  /** YYYY-MM-DD */
  date: string
}

export interface Person {
  id: ID
  name: string
  email: string
  phone: string
  company: string
  role: string
  notes: string
  tags: string[]
  /** MM-DD o YYYY-MM-DD */
  birthday?: string
  /** YYYY-MM-DD */
  lastContact?: string
  /** cada cuántos días quiero hablar con esta persona */
  contactEvery?: number
  createdAt: number
}

export interface Interaction {
  id: ID
  personId: ID
  date: string
  kind: 'call' | 'message' | 'meeting' | 'email' | 'other'
  summary: string
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

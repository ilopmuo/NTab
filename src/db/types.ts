export type ID = string

export type Priority = 0 | 1 | 2 | 3 // 0 ninguna, 1 baja, 2 media, 3 alta

export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year'

export interface Recurrence {
  freq: RecurrenceFreq
  interval: number
  /** 0 = domingo … 6 = sábado (solo para freq 'week') */
  weekdays?: number[]
  /** la siguiente se cuenta desde el día en que se completa (no desde la fecha prevista) */
  afterDone?: boolean
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
  /** objetivo al que contribuye */
  goalId?: ID
  order: number
  createdAt: number
}

export type GoalStatus = 'active' | 'done' | 'dropped'

/**
 * Objetivo: algo que quiero conseguir. El progreso sale de
 * - `projects`: los proyectos vinculados (proyecto terminado = 100 %, si no, sus tareas);
 * - `number`: una cifra que actualizo a mano (`current` de `target`, p. ej. 3 de 12 libros).
 */
export interface Goal {
  id: ID
  title: string
  /** por qué me importa */
  why: string
  areaId?: ID
  kind: 'projects' | 'number'
  target?: number
  current?: number
  /** "libros", "kg", "€"… */
  unit?: string
  /** YYYY-MM-DD */
  deadline?: string
  status: GoalStatus
  order: number
  createdAt: number
  completedAt?: number
}

export type BillingCycle = 'week' | 'month' | 'quarter' | 'year'

/**
 * Pago que se repite: una suscripción (se cobra sola; la fecha avanza sola)
 * o un recibo (hay que pagarlo; avanza al marcarlo como pagado).
 */
export interface Subscription {
  id: ID
  name: string
  kind: 'sub' | 'bill'
  amount: number
  currency: string
  cycle: BillingCycle
  /** próximo cargo, YYYY-MM-DD */
  nextDate: string
  /** día del mes del cargo (para no ir perdiendo días con los meses cortos) */
  anchorDay?: number
  active: boolean
  category: string
  /** días antes del cargo para avisar (null = sin aviso) */
  notifyDays: number | null
  /** momento del aviso ya calculado (ms), como en las tareas */
  remindAt?: number
  notes: string
  createdAt: number
}

/**
 * Aviso de una tarea:
 * - `before`: minutos antes de la fecha/hora de la tarea (0 = a la hora).
 *   Sin hora, se toma como referencia la hora por defecto (09:00).
 * - `at`: momento concreto (ms desde epoch).
 * `null` = "sin aviso" elegido a propósito (no aplicar el aviso automático).
 */
export type Reminder = { before: number } | { at: number }

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
  /** personas relacionadas (@Ana): aparecen en su ficha como pendientes */
  people?: ID[]
  subtasks: Subtask[]
  recurrence?: Recurrence
  /** duración estimada en minutos */
  estimate?: number
  reminder?: Reminder | null
  /** insistir: repetir el aviso cada N minutos hasta que se complete o se posponga */
  nag?: number
  /** momento del aviso ya calculado (ms); lo usa el servidor para enviar la notificación */
  remindAt?: number
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
  /** HH:MM: avisar a esta hora si aún no está hecho */
  remindTime?: string
  archived: 0 | 1
  order: number
  createdAt: number
}

/** Rutina: pasos que se repiten a una hora («Antes de salir de casa») */
export interface RoutineStep {
  id: ID
  title: string
}

export interface Routine {
  id: ID
  name: string
  icon: string
  steps: RoutineStep[]
  /** días de la semana en que toca (0 = domingo) */
  days: number[]
  /** HH:MM: aviso para empezarla */
  time?: string
  archived: 0 | 1
  order: number
  createdAt: number
}

/** Lo hecho de una rutina un día concreto (se reinicia cada día) */
export interface RoutineRun {
  id: ID
  routineId: ID
  /** YYYY-MM-DD */
  date: string
  /** pasos marcados */
  done: ID[]
  /** cuando se marcaron todos */
  completedAt?: number
}

/**
 * Cosas y papeles: dónde está algo, qué se ha prestado y lo que caduca.
 * - stored: guardado en un sitio («Pasaporte → cajón del escritorio»)
 * - lent: prestado a alguien; borrowed: me lo han prestado
 * - document: documento o garantía que caduca
 */
export type ThingKind = 'stored' | 'lent' | 'borrowed' | 'document'

export interface Thing {
  id: ID
  name: string
  kind: ThingKind
  /** dónde está guardado */
  location?: string
  notes?: string
  /** foto pequeña (JPEG en data URL) */
  photo?: string
  /** persona del préstamo (de Personas) */
  personId?: ID
  /** nombre, si la persona no está en Personas */
  personName?: string
  /** YYYY-MM-DD: desde cuándo (préstamos) */
  since?: string
  /** YYYY-MM-DD: cuándo debería volver (préstamos) */
  returnBy?: string
  /** YYYY-MM-DD: caducidad (documentos, garantías) */
  expires?: string
  /** días antes de caducar para avisar */
  notifyDays?: number
  /** préstamo ya devuelto (se guarda como historial) */
  returned?: 0 | 1
  /** momento del aviso ya calculado (ms): caducidad o devolución */
  remindAt?: number
  createdAt: number
  updatedAt: number
}

/** «Última vez»: algo que se hace de vez en cuando («cambiar las sábanas») */
export interface Tracker {
  id: ID
  name: string
  icon: string
  /** fechas en que se hizo (YYYY-MM-DD), de la más reciente a la más antigua */
  log: string[]
  /** cada cuántos días toca (opcional): avisa cuando se pasa */
  every?: number
  /** momento del aviso ya calculado (ms) */
  remindAt?: number
  archived: 0 | 1
  order: number
  createdAt: number
}

/** Lista de la compra */
export interface ShoppingItem {
  id: ID
  name: string
  /** cantidad tal cual («2», «1 kg», «una docena») */
  qty?: string
  /** pasillo: fruta, lacteos, limpieza… (ver src/lib/shopping.ts) */
  aisle: string
  /** 1 = ya en el carro */
  checked: 0 | 1
  order: number
  createdAt: number
}

/** Lo que se suele comprar (para «lo de siempre»). id = nombre normalizado */
export interface PantryItem {
  id: ID
  name: string
  aisle: string
  count: number
  lastAt: number
}

/** Diario: una entrada por día (id = fecha) */
export interface JournalEntry {
  /** YYYY-MM-DD */
  id: string
  /** 1 (muy mal) … 5 (muy bien) */
  mood?: number
  text: string
  /** hasta 3 cosas buenas del día */
  good: string[]
  updatedAt: number
}

/** Un gasto («12,50 café») */
export interface Expense {
  id: ID
  /** en euros */
  amount: number
  note: string
  /** ver src/lib/expenses.ts */
  category: string
  /** YYYY-MM-DD */
  date: string
  createdAt: number
}

/** Receta: ingredientes tal cual se escriben («2 huevos», «200 g de harina») */
export interface Recipe {
  id: ID
  name: string
  ingredients: string[]
  notes?: string
  createdAt: number
}

/** Una comida del menú semanal. id = `${fecha}:${comida}` */
export interface MenuSlot {
  id: string
  /** YYYY-MM-DD */
  date: string
  meal: 'comida' | 'cena'
  recipeId?: ID
  /** si no es una receta guardada («sobras», «fuera») */
  text?: string
}

/** Cuenta atrás para algo que esperas */
export interface Countdown {
  id: ID
  name: string
  /** YYYY-MM-DD */
  date: string
  icon: string
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

/** Algo borrado: se puede recuperar durante 30 días */
export interface TrashItem {
  /** `${tbl}:${itemId}` */
  id: string
  tbl: 'tasks' | 'notes' | 'projects' | 'people' | 'habits' | 'subscriptions' | 'goals' | 'routines' | 'things' | 'trackers' | 'recipes'
  itemId: ID
  title: string
  data: Record<string, unknown>
  /** registros que se borraron con él (tareas de un proyecto, historial de una persona…) */
  related?: { tbl: string; data: Record<string, unknown> }[]
  /** registros que perdieron el enlace (p. ej. tareas de un proyecto): se vuelven a enlazar al recuperarlo */
  unlinked?: { tbl: 'tasks' | 'notes' | 'projects'; id: ID; field: 'projectId' | 'goalId' }[]
  deletedAt: number
}

export interface TemplateItem {
  title: string
  /** días desde el inicio (0 = el día de inicio); sin valor = sin fecha */
  offset?: number
  time?: string
  priority?: Priority
  subtasks?: string[]
}

/** Lista reutilizable: maleta de viaje, cierre de mes… */
export interface Template {
  id: ID
  name: string
  icon: string
  items: TemplateItem[]
  order: number
  createdAt: number
}

/** Sesión de foco terminada (para las estadísticas) */
export interface FocusLog {
  id: ID
  taskId: ID
  title: string
  /** YYYY-MM-DD */
  date: string
  minutes: number
  endedAt: number
}

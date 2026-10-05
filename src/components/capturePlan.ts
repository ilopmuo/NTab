import type { ExpenseRules } from '@/lib/expenses'
import type { Intent } from '@/lib/intent'
import type { Habit, HabitLog, Note, Task, Thing } from '@/db/types'
import { db } from '@/db/db'
import { addExpense, addHabitCount, addShoppingItems, completeHabit, completeTasks, createNote, createThing, createTracker, logTracker, restoreTasks, setTrackerLog, updateNote, updateThing } from '@/db/actions'
import { closest } from '@/lib/intent'
import { money, parseExpense } from '@/lib/expenses'
import { parseItems } from '@/lib/shopping'
import { appendToNote, checklistStats } from '@/lib/noteFormat'
import { normalize } from '@/lib/text'
import { addDaysYmd, today } from '@/lib/dates'

/** Qué se ve antes de guardar y qué pasa al darle: lo que la captura entiende que no es una tarea */
export interface CapturePlan {
  icon: 'cart' | 'wallet' | 'note' | 'habit' | 'check' | 'clock' | 'box'
  /** «A la compra: Leche y Pan», «Gasto: 12,50 € · Café»… */
  label: string
  /** Guarda y devuelve el aviso (y cómo deshacerlo) */
  run: () => Promise<{ message: string; undo?: () => Promise<unknown> }>
}

const fold = (s: string) => normalize(s).trim()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)
/** Por nombre, sin mayúsculas ni acentos: el exacto primero, luego el que lo contiene */
function byName<T>(items: T[], name: string, key: (x: T) => string) {
  const n = fold(name)
  return items.find((x) => fold(key(x)) === n) ?? items.find((x) => fold(key(x)).includes(n))
}

/** Los registros de un hábito un día (para deshacer) */
async function habitDay(habitId: string, date: string) {
  return db.habitLogs.where('[habitId+date]').equals([habitId, date]).toArray()
}
async function restoreHabitDay(habitId: string, date: string, before: HabitLog[]) {
  await db.transaction('rw', db.habitLogs, async () => {
    await db.habitLogs.bulkDelete((await habitDay(habitId, date)).map((l) => l.id))
    await db.habitLogs.bulkPut(before)
  })
}

function habitPlan(habit: Habit, qty?: number): CapturePlan {
  const counted = (habit.target ?? 1) > 1
  const add = counted ? (qty ?? 1) : undefined
  return {
    icon: 'habit',
    label: `Hábito: ${habit.name}${add ? ` +${add}` : ''}`,
    run: async () => {
      const t = today()
      const before = await habitDay(habit.id, t)
      const undo = () => restoreHabitDay(habit.id, t, before)
      if (add) {
        const now = await addHabitCount(habit.id, t, add)
        return { message: `${habit.name}: ${now}/${habit.target}${habit.unit ? ` ${habit.unit}` : ''}`, undo }
      }
      await completeHabit(habit, t)
      return { message: `${habit.name}: hecho hoy`, undo }
    },
  }
}

/**
 * Lo que hay que hacer con lo escrito si no es una tarea (o `null`: entonces
 * es una tarea). Mira tus datos: qué hábito, qué nota, qué tarea completar…
 */
export async function planCapture(intent: Intent): Promise<CapturePlan | null> {
  switch (intent.kind) {
    case 'shopping': {
      const items = parseItems(intent.items)
      if (!items.length) return null
      const lists = ((await db.settings.get('shoppingLists'))?.value as { id: string; name: string }[] | undefined) ?? []
      const target = intent.list ? byName(lists, intent.list, (l) => l.name) : undefined
      return {
        icon: 'cart',
        label: `A la compra${target ? ` (${target.name})` : ''}: ${list(items.map((i) => i.name))}`,
        run: async () => {
          const added = await addShoppingItems(items, target?.id)
          return {
            message: added.length ? `A la compra: ${list(added.map((i) => i.name))}` : 'Ya estaba en la compra',
            undo: added.length ? () => db.shopping.bulkDelete(added.map((i) => i.id)) : undefined,
          }
        },
      }
    }
    case 'bought': {
      // Tachar de la compra lo que ya está en ella
      const open = await db.shopping.where('checked').equals(0).toArray()
      const hits = parseItems(intent.items.replace(/^(?:el|la|los|las)\s+/i, ''))
        .map((i) => open.find((x) => fold(x.name) === fold(i.name)) ?? open.find((x) => fold(x.name).includes(fold(i.name)) || fold(i.name).includes(fold(x.name))))
        .filter((x, i, all): x is NonNullable<typeof x> => !!x && all.indexOf(x) === i)
      if (!hits.length) return { icon: 'cart', label: 'No está en la compra', run: async () => ({ message: 'Eso no está en la compra' }) }
      return {
        icon: 'cart',
        label: `Tachar de la compra: ${list(hits.map((x) => x.name))}`,
        run: async () => {
          await db.shopping.bulkUpdate(hits.map((x) => ({ key: x.id, changes: { checked: 1 as const } })))
          return { message: `Tachado: ${list(hits.map((x) => x.name))}`, undo: () => db.shopping.bulkUpdate(hits.map((x) => ({ key: x.id, changes: { checked: 0 as const } }))) }
        },
      }
    }
    case 'expense': {
      const rules = ((await db.settings.get('expenseRules'))?.value as ExpenseRules | undefined) ?? {}
      const p = parseExpense(intent.text, rules)
      if (!p) return { icon: 'wallet', label: 'Gasto: falta el importe («12,50 café»)', run: async () => ({ message: '¿Cuánto has gastado? Escríbelo con el importe' }) }
      return {
        icon: 'wallet',
        label: `Gasto: ${money(p.amount)} · ${p.note}${p.daysAgo ? (p.daysAgo === 1 ? ' · ayer' : ` · hace ${p.daysAgo} días`) : ''}`,
        run: async () => {
          const e = await addExpense({ amount: p.amount, note: p.note, category: p.category, date: addDaysYmd(today(), -p.daysAgo), ...(p.tags?.length ? { tags: p.tags } : {}) })
          return { message: `${money(p.amount)} · ${p.note}`, undo: () => db.expenses.delete(e.id) }
        },
      }
    }
    case 'note':
      return {
        icon: 'note',
        label: `Nota nueva: ${intent.title}`,
        run: async () => {
          const n = await createNote({ title: intent.title, content: intent.body })
          return { message: 'Nota guardada', undo: () => db.notes.delete(n.id) }
        },
      }
    case 'noteAppend': {
      if (!intent.text) return null
      const notes = await db.notes.toArray()
      const note = byName(notes, intent.note, (n) => n.title)
      return {
        icon: 'note',
        label: note ? `A la nota «${note.title}»` : `Nota nueva: ${cap(intent.note)}`,
        run: async () => {
          if (!note) {
            const n = await createNote({ title: cap(intent.note), content: appendToNote('', intent.text) })
            return { message: `Nota «${n.title}» creada`, undo: () => db.notes.delete(n.id) }
          }
          const fresh = (await db.notes.get(note.id)) as Note
          const asList = checklistStats(fresh.content).total > 0
          await updateNote(note.id, { content: appendToNote(fresh.content, intent.text, asList) })
          return { message: `Añadido a «${note.title}»`, undo: () => updateNote(note.id, { content: fresh.content }) }
        },
      }
    }
    case 'habit': {
      const habits = (await db.habits.toArray()).filter((h) => !h.archived)
      const habit = byName(habits, intent.name, (h) => h.name)
      return habit ? habitPlan(habit, intent.qty) : null
    }
    case 'done': {
      // Una tarea pendiente (primero lo de hoy y lo atrasado); si no, un hábito o «Última vez»
      const t = today()
      const open = (await db.tasks.where('done').equals(0).toArray()) as Task[]
      const task = closest(open, intent.what, (x) => x.title, (x) => (x.dueDate && x.dueDate <= t ? 2 : x.dueDate ? 1 : 0))
      if (task.tie) return { icon: 'check', label: `¿Cuál? ${list(task.tie.slice(0, 3).map((x) => `«${x.title}»`))}`, run: async () => ({ message: 'Escribe un poco más para saber cuál' }) }
      if (task.hit) {
        const hit = task.hit
        return {
          icon: 'check',
          label: `Hecha: ${hit.title}`,
          run: async () => {
            const { before, created } = await completeTasks([hit.id])
            return { message: `Hecha: ${hit.title}`, undo: () => restoreTasks(before, created) }
          },
        }
      }
      const habits = (await db.habits.toArray()).filter((h) => !h.archived)
      const habit = closest(habits, intent.what, (h) => h.name).hit
      if (habit) return habitPlan(habit)
      const trackers = (await db.trackers.toArray()).filter((x) => !x.archived)
      const tracker = closest(trackers, intent.what, (x) => x.name).hit
      const name = tracker?.name ?? cap(intent.what)
      return {
        icon: 'clock',
        label: `Última vez: ${name}, hoy`,
        run: async () => {
          if (tracker) {
            const prev = (await logTracker(tracker.id)) ?? tracker.log
            return { message: `Última vez: ${name}, hoy`, undo: () => setTrackerLog(tracker.id, prev) }
          }
          const made = await createTracker({ name, log: [t] })
          return { message: `Última vez: ${name}, hoy`, undo: () => db.trackers.delete(made.id) }
        },
      }
    }
    case 'thing':
    case 'lent': {
      const things = (await db.things.toArray()).filter((x) => !x.returned)
      const existing = things.find((x) => fold(x.name) === fold(intent.name))
      const changes: Partial<Thing> = intent.kind === 'lent' ? { kind: 'lent', personName: intent.person, since: today() } : { location: intent.where }
      return {
        icon: 'box',
        label: intent.kind === 'lent' ? `Cosas: ${intent.name}, lo tiene ${intent.person}` : `Cosas: ${intent.name}, ${/^(?:debajo|encima|detr[aá]s|dentro|junto|al\s+lado)\b/i.test(intent.where) ? '' : 'en '}${intent.where}`,
        run: async () => {
          if (existing) {
            await updateThing(existing.id, changes)
            return { message: `Apuntado: ${intent.name}`, undo: () => db.things.put(existing) }
          }
          const made = await createThing({ name: intent.name, kind: 'stored', ...changes })
          return { message: `Apuntado: ${intent.name}`, undo: () => db.things.delete(made.id) }
        },
      }
    }
    default:
      return null
  }
}

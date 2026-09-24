import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { addDaysYmd, fmt, today, weekStart } from '@/lib/dates'
import { isScheduled } from '@/lib/habits'
import { goalProgress } from '@/lib/goals'
import { dueForContact, upcomingBirthdays } from '@/lib/people'
import { money } from '@/lib/finance'

const MAX_TASKS = 250
const PRIO = ['', ' !baja', ' !media', ' !alta']

/**
 * Resumen en texto de los datos de NTab para el asistente: lo que necesita para
 * responder "¿qué tengo esta semana?" o planificar el día, sin mandar todo.
 */
export async function buildAssistantContext(): Promise<string> {
  const t = today()
  const now = new Date()
  const [tasks, projects, areas, goals, habits, logs, subs, people] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
    db.areas.toArray(),
    db.goals.toArray(),
    db.habits.where('archived').equals(0).toArray(),
    db.habitLogs.where('date').equals(t).toArray(),
    db.subscriptions.toArray(),
    db.people.toArray(),
  ])
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const areaName = new Map(areas.map((a) => [a.id, a.name]))

  const line = (x: Task) => {
    const where = [x.projectId && projectName.get(x.projectId), !x.projectId && x.areaId && areaName.get(x.areaId)].filter(Boolean)
    return [
      `- [${x.id}] ${x.title}`,
      x.dueDate ? ` · ${x.dueDate}${x.dueTime ? ` ${x.dueTime}` : ''}` : ' · sin fecha',
      PRIO[x.priority] ?? '',
      where.length ? ` · ${where.join(', ')}` : '',
      x.tags.length ? ` · ${x.tags.map((g) => `#${g}`).join(' ')}` : '',
      x.recurrence ? ' · se repite' : '',
      x.subtasks.length ? ` · subtareas ${x.subtasks.filter((s) => s.done).length}/${x.subtasks.length}` : '',
    ].join('')
  }

  const open = tasks.filter((x) => !x.done)
  const byDate = (a: Task, b: Task) =>
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || b.priority - a.priority
  const overdue = open.filter((x) => x.dueDate && x.dueDate < t).sort(byDate)
  const dated = open.filter((x) => x.dueDate && x.dueDate >= t).sort(byDate)
  const undated = open.filter((x) => !x.dueDate).sort((a, b) => b.priority - a.priority || a.order - b.order)
  const since = Date.now() - 7 * 864e5
  const doneRecent = tasks.filter((x) => x.done && (x.completedAt ?? 0) >= since)

  let budget = MAX_TASKS
  const take = (list: Task[]) => {
    const out = list.slice(0, Math.max(0, budget))
    budget -= out.length
    return out
  }

  const s: string[] = []
  s.push(`AHORA: ${fmt(t, "EEEE d 'de' MMMM 'de' yyyy")} (${t}), ${now.toTimeString().slice(0, 5)}, zona ${Intl.DateTimeFormat().resolvedOptions().timeZone}`)
  s.push(`Semana actual: del ${weekStart(t)} al ${addDaysYmd(weekStart(t), 6)}`)

  s.push(`\nTAREAS ATRASADAS (${overdue.length}):`, ...take(overdue).map(line))
  s.push(`\nTAREAS CON FECHA (${dated.length}):`, ...take(dated).map(line))
  s.push(`\nTAREAS SIN FECHA (${undated.length}):`, ...take(undated).map(line))
  if (budget <= 0) s.push('(hay más tareas que no caben aquí)')
  s.push(`\nCOMPLETADAS EN LOS ÚLTIMOS 7 DÍAS: ${doneRecent.length}${doneRecent.length ? ` (${doneRecent.slice(0, 15).map((x) => x.title).join('; ')})` : ''}`)

  const active = projects.filter((p) => p.status === 'active')
  s.push(`\nPROYECTOS ACTIVOS (${active.length}):`)
  for (const p of active) {
    const pt = tasks.filter((x) => x.projectId === p.id)
    s.push(`- ${p.name}: ${pt.filter((x) => !x.done).length} pendientes de ${pt.length}${p.deadline ? ` · límite ${p.deadline}` : ''}${p.areaId ? ` · ${areaName.get(p.areaId) ?? ''}` : ''}`)
  }

  const liveGoals = goals.filter((g) => g.status === 'active')
  if (liveGoals.length) {
    s.push(`\nOBJETIVOS:`)
    for (const g of liveGoals) {
      const p = goalProgress(g, projects, tasks)
      s.push(`- ${g.title}: ${Math.round(p.value * 100)} % (${p.label})${g.deadline ? ` · para ${g.deadline}` : ''}${g.why ? ` · por qué: ${g.why}` : ''}`)
    }
  }

  const todayHabits = habits.filter((h) => isScheduled(h, t))
  if (todayHabits.length) {
    const done = new Set(logs.map((l) => l.habitId))
    s.push(`\nHÁBITOS DE HOY: ${todayHabits.map((h) => `${h.name} (${done.has(h.id) ? 'hecho' : 'pendiente'})`).join('; ')}`)
  }

  const soon = subs.filter((x) => x.active && x.nextDate <= addDaysYmd(t, 30)).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  if (soon.length) {
    s.push(`\nPAGOS PRÓXIMOS 30 DÍAS:`, ...soon.map((x) => `- ${x.nextDate} ${x.name} ${money(x.amount, x.currency)}${x.kind === 'bill' ? ' (recibo, hay que pagarlo)' : ''}`))
  }

  const birthdays = upcomingBirthdays(people, t, 14)
  const contact = dueForContact(people, t)
  if (birthdays.length || contact.length) {
    s.push(`\nPERSONAS:`)
    for (const b of birthdays) s.push(`- Cumpleaños de ${b.person.name}: ${b.date}${b.age ? ` (${b.age} años)` : ''}`)
    for (const c of contact.slice(0, 8)) s.push(`- Toca hablar con ${c.person.name}${c.days === Infinity ? ' (nunca registrado)' : ` (hace ${c.days} días)`}`)
  }

  if (projects.length) s.push(`\nNOMBRES DE PROYECTOS: ${projects.map((p) => p.name).join('; ')}`)
  return s.join('\n')
}

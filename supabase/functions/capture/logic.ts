/**
 * Captura desde fuera de la app (Siri, Atajos de iOS, la hoja de compartir…):
 * texto → tareas, con el mismo lenguaje natural que la app. Sin dependencias
 * de Deno (se prueba en src/lib/capture.test.ts).
 */
import { parseQuickAdd } from '../_shared/parse.ts'
import { ymdIn } from '../_shared/time.ts'
import { relDay, withReminder, type Env, type Row, type Task } from '../mcp/ntab.ts'

export const MAX_LINES = 20
export const MAX_CHARS = 5000

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Un enlace suelto se convierte en "Revisar <sitio>" con el enlace en las notas */
function fromUrl(line: string): { title: string; notes: string } | null {
  if (!/^https?:\/\/\S+$/i.test(line)) return null
  try {
    return { title: `Revisar ${new URL(line).hostname.replace(/^www\./, '')}`, notes: line }
  } catch {
    return null
  }
}

export function captureTasks(rows: Row[], text: string, env: Env): { writes: Row[]; reply: string } {
  const today = ymdIn(env.now, env.tz)
  const projects = rows.filter((r) => r.tbl === 'projects' && r.data.status !== 'done').map((r) => ({ id: r.id, name: str(r.data.name), areaId: str(r.data.areaId) || undefined }))
  const areas = rows.filter((r) => r.tbl === 'areas').map((r) => ({ id: r.id, name: str(r.data.name) }))
  const lines = text
    .slice(0, MAX_CHARS)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?\])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)

  const writes: Row[] = []
  const said: string[] = []
  lines.forEach((line, i) => {
    const link = fromUrl(line)
    const p = link ? null : parseQuickAdd(line, { projects, areas, today })
    const title = link?.title ?? p?.title ?? ''
    if (!title) return
    let task: Task = {
      id: env.newId(),
      title,
      notes: link?.notes ?? '',
      done: 0,
      priority: p?.priority ?? 0,
      tags: p?.tags ?? [],
      subtasks: [],
      order: env.now + i,
      createdAt: env.now,
    }
    if (p?.dueDate) task.dueDate = p.dueDate
    if (p?.dueTime) task.dueTime = p.dueTime
    if (p?.projectId) task.projectId = p.projectId
    if (p?.areaId) task.areaId = p.areaId
    if (p?.recurrence) task.recurrence = p.recurrence
    if (p?.reminder) task.reminder = p.reminder
    task = withReminder(task, env)
    writes.push({ tbl: 'tasks', id: task.id, data: task as unknown as Record<string, unknown> })
    const where = p?.projectId ? projects.find((x) => x.id === p.projectId)?.name : p?.areaId ? areas.find((x) => x.id === p.areaId)?.name : ''
    said.push(
      [title, task.dueDate ? `${relDay(task.dueDate, today)}${task.dueTime ? ` a las ${task.dueTime}` : ''}` : '', where ? `en ${where}` : '']
        .filter(Boolean)
        .join(', '),
    )
  })

  if (!writes.length) return { writes, reply: 'No he entendido qué apuntar.' }
  if (writes.length === 1) return { writes, reply: `Apuntado: ${said[0]}.` }
  return { writes, reply: `Apuntadas ${writes.length} tareas: ${said.join('; ')}.` }
}

import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { dateLabel, today } from '@/lib/dates'
import { confirmReply, discardReply, reopenWait, undoDecision } from '@/lib/waitReplies'
import { toast } from '@/app/store'

/**
 * Lo que decide el usuario sobre una posible respuesta que ha visto un
 * asistente (ver supabase/functions/_shared/waitReplies.ts): con la tarea tal y
 * como está ahora, para no aplicar una propuesta de una espera que ya ha
 * cambiado, y con «Deshacer» que solo devuelve lo que cambió esta decisión (lo
 * que hayas cambiado después, como el título, las notas o la fecha, se queda).
 */
async function decide(id: string, replyId: string, fn: (t: Task) => { task?: Task; error?: string; kept?: string }, done: (kept?: string) => string) {
  const r = await db.transaction('rw', db.tasks, async () => {
    const before = await db.tasks.get(id)
    if (!before) return { error: 'la tarea ya no existe' }
    const next = fn(before)
    if (!next.task) return { error: next.error }
    await db.tasks.put(next.task)
    return { before: structuredClone(before), after: structuredClone(next.task), kept: next.kept }
  })
  if (!r.before || !r.after) {
    toast(`No se ha cambiado: ${r.error}`)
    return false
  }
  const { before, after } = r
  toast(done(r.kept), { label: 'Deshacer', run: () => void undo(id, replyId, before, after) })
  return true
}

async function undo(id: string, replyId: string, before: Task, after: Task) {
  const r = await db.transaction('rw', db.tasks, async () => {
    const u = undoDecision(await db.tasks.get(id), before, after, replyId)
    if (u.task) await db.tasks.put(u.task)
    return u
  })
  if (!r.task) toast(`No lo deshago: ${r.error}`)
  else if (r.kept) toast(`Deshecho. Se queda la fecha que pusiste después (${dateLabel(r.kept).toLowerCase()})`)
}

/** «Sí, ha llegado»: cierra la espera y la tarea vuelve a hoy */
export const confirmWaitReply = (task: Task, replyId: string) =>
  decide(task.id, replyId, (t) => confirmReply(t, replyId, { now: Date.now(), today: today() }), () => `Ya no esperas a ${task.waitingFor}`)

/** «No es eso»: la espera sigue y ese mensaje no se vuelve a proponer */
export const discardWaitReply = (task: Task, replyId: string) => decide(task.id, replyId, (t) => discardReply(t, replyId, Date.now()), () => 'Descartada: sigues a la espera')

/** «Volver a esperar»: deshace el cierre si nadie ha vuelto a tocar la espera (la fecha que hayas puesto después se queda) */
export const reopenWaitReply = (task: Task, replyId: string) =>
  decide(
    task.id,
    replyId,
    (t) => reopenWait(t, replyId),
    (kept) => (kept ? `Vuelves a estar a la espera; se queda tu fecha (${dateLabel(kept).toLowerCase()})` : 'Vuelves a estar a la espera'),
  )

/** «Volver a preguntar el …»: la fecha que propone el asistente, solo si dices que sí */
export const askAgainOn = (task: Task, replyId: string, day: string) =>
  decide(
    task.id,
    replyId,
    (t) => (t.waitingFor && !t.done ? { task: { ...t, dueDate: day } } : { error: 'ya no está a la espera' }),
    () => `Volverás a preguntar ${dateLabel(day).toLowerCase()}`,
  )

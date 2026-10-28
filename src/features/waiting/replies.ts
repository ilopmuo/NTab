import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { today } from '@/lib/dates'
import { confirmReply, discardReply, reopenWait } from '@/lib/waitReplies'
import { toast } from '@/app/store'

/**
 * Lo que decide el usuario sobre una posible respuesta que ha visto un
 * asistente (ver supabase/functions/_shared/waitReplies.ts): con la tarea tal y
 * como está ahora, para no aplicar una propuesta de una espera que ya ha
 * cambiado, y con «Deshacer».
 */
async function decide(id: string, fn: (t: Task) => { task?: Task; error?: string }, done: string) {
  const r = await db.transaction('rw', db.tasks, async () => {
    const before = await db.tasks.get(id)
    if (!before) return { error: 'la tarea ya no existe' }
    const next = fn(before)
    if (!next.task) return { error: next.error }
    await db.tasks.put(next.task)
    return { before: structuredClone(before) }
  })
  if (!r.before) {
    toast(`No se ha cambiado: ${r.error}`)
    return false
  }
  const before = r.before
  toast(done, { label: 'Deshacer', run: () => void db.tasks.put(before) })
  return true
}

/** «Sí, ha llegado»: cierra la espera y la tarea vuelve a hoy */
export const confirmWaitReply = (task: Task, replyId: string) =>
  decide(task.id, (t) => confirmReply(t, replyId, { now: Date.now(), today: today() }), `Ya no esperas a ${task.waitingFor}`)

/** «No es eso»: la espera sigue y ese mensaje no se vuelve a proponer */
export const discardWaitReply = (task: Task, replyId: string) => decide(task.id, (t) => discardReply(t, replyId, Date.now()), 'Descartada: sigues a la espera')

/** «Volver a esperar»: deshace el cierre si nadie ha vuelto a tocar la espera */
export const reopenWaitReply = (task: Task, replyId: string) => decide(task.id, (t) => reopenWait(t, replyId), 'Vuelves a estar a la espera')

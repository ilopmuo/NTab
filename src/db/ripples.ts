import { db } from './db'
import type { Task } from './types'
import { uid } from '@/lib/id'
import { today } from '@/lib/dates'
import { withDate } from '@/lib/remindAt'
import { checkNoteLine, contactKind, sameLine, trackerFor } from '@/lib/ripples'
import { toggleTask } from './actions'

/** Las tablas que tocan (para meterlas en la misma transacción que la tarea) */
export const RIPPLE_TABLES = [db.interactions, db.people, db.trackers, db.notes]

/**
 * Lo que una tarea hecha cambia en el resto de LUNO (ver _shared/ripples.ts):
 * - con @personas: se apunta el contacto (la «última vez que hablaste»);
 * - si es una «Última vez» (cambiar las sábanas), se registra;
 * - si salió de una casilla de una nota, se marca allí.
 * Se llama al completarla desde cualquier sitio (toggleTask).
 */
export async function rippleDone(task: Task) {
  const t = today()
  await db.transaction('rw', RIPPLE_TABLES, async () => {
    for (const personId of task.people ?? []) {
      // Una vez por tarea y día
      const already = await db.interactions.where('personId').equals(personId).filter((i) => i.taskId === task.id && i.date === t).count()
      if (!already) await db.interactions.add({ id: uid(), personId, date: t, kind: contactKind(task.title), summary: task.title, taskId: task.id, createdAt: Date.now() })
      const person = await db.people.get(personId)
      if (person && (!person.lastContact || person.lastContact < t)) await db.people.update(personId, { lastContact: t })
    }
    const tracker = trackerFor(task.title, await db.trackers.toArray())
    if (tracker && tracker.log[0] !== t) await db.trackers.update(tracker.id, { log: withDate(tracker.log, t) })
    // Si se repite, la casilla sigue abierta para la próxima vez
    if (task.source && !task.recurrence) {
      const note = await db.notes.get(task.source.noteId)
      const content = note && checkNoteLine(note.content, task.source.line, true)
      if (note && content !== undefined) await db.notes.update(note.id, { content, updatedAt: Date.now() })
    }
  })
}

/** Al volver a pendiente (o deshacer), lo mismo al revés: el contacto apuntado solo, la «última vez» de hoy y la casilla */
export async function rippleUndone(task: Task) {
  const t = today()
  await db.transaction('rw', RIPPLE_TABLES, async () => {
    const auto = await db.interactions.where('date').equals(t).filter((i) => i.taskId === task.id).toArray()
    if (auto.length) await db.interactions.bulkDelete(auto.map((i) => i.id))
    // El último contacto vuelve a ser el de antes
    for (const personId of new Set(auto.map((i) => i.personId))) {
      const left = await db.interactions.where('personId').equals(personId).toArray()
      const last = left.reduce<string | undefined>((m, i) => (!m || i.date > m ? i.date : m), undefined)
      await db.people.update(personId, { lastContact: last })
    }
    const tracker = trackerFor(task.title, await db.trackers.toArray())
    if (tracker && tracker.log[0] === t) await db.trackers.update(tracker.id, { log: tracker.log.slice(1) })
    if (task.source) {
      const note = await db.notes.get(task.source.noteId)
      const content = note && checkNoteLine(note.content, task.source.line, false)
      if (note && content !== undefined) await db.notes.update(note.id, { content, updatedAt: Date.now() })
    }
  })
}

/**
 * Al marcar (o desmarcar) en una nota la casilla de la que salió una tarea, la
 * tarea también: así da igual dónde se haga.
 */
export async function setNoteLineTask(noteId: string, line: string, done: boolean) {
  const task = await db.tasks.filter((t) => t.source?.noteId === noteId && sameLine(t.source.line, line) && !!t.done !== done).first()
  if (task) await toggleTask(task)
}

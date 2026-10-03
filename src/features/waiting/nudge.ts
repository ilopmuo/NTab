import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { mutateTask } from '@/db/actions'
import { addDaysYmd, dateLabel, today } from '@/lib/dates'
import { toast } from '@/app/store'

/** Días hasta volver a preguntar (como WAIT_DAYS del analizador) */
export const WAIT_DAYS = 3

/** «Hola Ana, ¿cómo va lo del presupuesto del fontanero?» */
export function nudgeText(t: Pick<Task, 'title' | 'waitingFor'>) {
  const first = (t.waitingFor ?? '').trim().split(/\s+/)[0]
  return `Hola${first ? ` ${first}` : ''}, ¿cómo va lo de «${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}»?`
}

/** «el viernes», «mañana», «el 12 oct» */
export function onDay(ymd: string) {
  const l = dateLabel(ymd).toLowerCase()
  return /^(hoy|mañana|ayer)$/.test(l) ? l : `el ${l}`
}

/** Vuelve a mirarlo dentro de unos días (sin contar como pospuesta) */
export async function waitMore(task: Task, days = WAIT_DAYS) {
  const next = addDaysYmd(today(), days)
  await mutateTask(task.id, (x) => void (x.dueDate = next))
  return next
}

/** Empezar a esperar algo de alguien: hoy, y se vuelve a mirar en unos días */
export async function startWaiting(task: Task, who: string) {
  const t = today()
  await mutateTask(task.id, (x) => {
    x.waitingFor = who.trim()
    x.waitingSince = t
    x.someday = undefined
    if (!x.dueDate || x.dueDate <= t) x.dueDate = addDaysYmd(t, WAIT_DAYS)
  })
}

export async function stopWaiting(task: Task) {
  await mutateTask(task.id, (x) => {
    x.waitingFor = undefined
    x.waitingSince = undefined
  })
}

/** Todo lo que esperas de alguien, en un mensaje */
export function nudgeAllText(tasks: Pick<Task, 'title' | 'waitingFor'>[]) {
  if (tasks.length === 1) return nudgeText(tasks[0])
  const first = (tasks[0]?.waitingFor ?? '').trim().split(/\s+/)[0]
  const items = tasks.map((t) => `«${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}»`)
  return `Hola${first ? ` ${first}` : ''}, ¿cómo va lo de ${items.slice(0, -1).join(', ')} y lo de ${items.at(-1)}?`
}

/**
 * «Recordárselo»: el mensaje por WhatsApp si tiene su móvil en Personas, si no
 * con el menú de compartir del sistema (o copiado), y se vuelve a mirar en 3 días.
 */
export async function nudge(task: Task) {
  return nudgeAll([task])
}

export async function nudgeAll(tasks: Task[]) {
  const task = tasks[0]
  if (!task) return
  const text = nudgeAllText(tasks)
  const who = (task.waitingFor ?? '').toLowerCase()
  const person = (await db.people.toArray()).find((p) => p.name.toLowerCase() === who || p.name.toLowerCase().split(/\s+/)[0] === who.split(/\s+/)[0])
  const phone = person?.phone?.replace(/[^\d+]/g, '').replace(/^\+/, '')
  let copied = false
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    copied = true
  }
  try {
    if (phone) window.open(`https://wa.me/${phone.length === 9 ? `34${phone}` : phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    // En el móvil, el menú de compartir; en el ordenador, copiado
    else if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text })
    else await copy()
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return // compartir cancelado
    try {
      await copy()
    } catch {
      return void toast('No se ha podido copiar el mensaje')
    }
  }
  let next = ''
  for (const t of tasks) next = await waitMore(t)
  toast(`${copied ? 'Mensaje copiado: pégalo donde le escribas. ' : ''}Te lo vuelvo a recordar ${onDay(next)}`)
}

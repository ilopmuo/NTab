import { db } from '@/db/db'
import { completeHabit, rollSubscriptions, toggleTask, updateTask } from '@/db/actions'
import { addDaysYmd, today, weekStart } from '@/lib/dates'
import { DEADLINE_ALERT_TIME, deadlineAlert, deadlineMessage, type DeadlineAlertPrefs } from '@/lib/deadlines'
import { doneDays, groupLogs, isDue } from '@/lib/habits'
import { chargeWhen, inTrial, money } from '@/lib/finance'
import { toast, ui } from '@/app/store'
import { navigate } from '@/app/router'
import { prefs } from '@/lib/prefs'
import { nagSlot } from '@/lib/reminders'
import { routineProgress, routineToday } from '@/lib/routines'
import { runner } from '@/features/routines/useRoutines'
import { chime, primeSound } from './sound'
import { askPermission } from './push'

/**
 * Avisos con la app abierta (o en segundo plano en el ordenador): aviso dentro
 * de la app, sonido y notificación del sistema. La notificación usa la misma
 * etiqueta que la del servidor y cada aviso (elemento + momento) se apunta en la
 * caché "ntab-alerted": cuando llega el push del mismo aviso, el service worker
 * ve que ya se avisó y no vuelve a sonar (ver public/push-sw.js).
 */
const SEEN_KEY = 'ntab-reminded'
const CHECK_MS = 15_000

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)))
  } catch {
    /* sin almacenamiento */
  }
}

export function openTaskFromNotification(id: string) {
  navigate('/today')
  ui.openTask(id)
}

export const SNOOZE_MINUTES = 15
export type ReminderAction = 'snooze' | 'done' | 'habit-done' | 'med-taken'

/** minutos de a a b (HH:MM del mismo día) */
function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return bh * 60 + bm - (ah * 60 + am)
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** Posponer o completar desde un aviso (dentro de la app o desde la notificación) */
export async function applyReminderAction(action: ReminderAction, id: string) {
  if (action === 'med-taken') {
    // id: `${medId}|${fecha}|${hora}`
    const [medId, date, time] = id.split('|')
    const med = await db.meds.get(medId)
    if (!med) return
    const { markDose } = await import('@/features/meds/actions')
    const { log, undo } = await markDose(med, { time, date })
    toast(`${med.name}: tomada a las ${hhmm(log.at)}`, { label: 'Deshacer', run: () => void undo() })
    return
  }
  if (action === 'habit-done') {
    const habit = await db.habits.get(id)
    if (!habit) return
    const t = today()
    // Con cantidad, «Hecho» lo lleva al objetivo del día
    await completeHabit(habit, t)
    toast(`Hábito hecho: ${habit.name} 🔥`)
    return
  }
  const task = await db.tasks.get(id)
  if (!task) return
  if (action === 'done') {
    if (!task.done) await toggleTask(task)
    toast(`Hecho: ${task.title}`)
  } else {
    const at = Date.now() + SNOOZE_MINUTES * 60_000
    await updateTask(id, { reminder: { at } })
    toast(`Te lo recuerdo a las ${hhmm(at)}`, undefined, 4000, { icon: 'bell' })
  }
}

/** Mensajes del service worker: botones de la notificación con la app abierta */
function listenToWorker() {
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; action?: ReminderAction; id?: string } | null
    if (d?.type === 'reminder-action' && d.id && (d.action === 'snooze' || d.action === 'done' || d.action === 'habit-done' || d.action === 'med-taken')) void applyReminderAction(d.action, d.id)
  })
}

const ALERTED_CACHE = 'ntab-alerted'

/** Apunta que este aviso ya se ha dado en este dispositivo */
async function markAlerted(tag: string) {
  try {
    const cache = await caches.open(ALERTED_CACHE)
    await cache.put(new Request(`./__alerted/${tag}`), new Response(String(Date.now())))
  } catch {
    /* sin Cache API */
  }
}

/** Botones de las notificaciones de tareas (en iPhone no se muestran) */
export const TASK_ACTIONS = [
  { action: 'done', title: 'Hecho' },
  { action: 'snooze', title: `Posponer ${SNOOZE_MINUTES} min` },
]

export async function showSystemNotification(tag: string, title: string, body: string, url: string, key?: string, habitId?: string, medDose?: string) {
  if (key) await markAlerted(key)
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options: NotificationOptions & { actions?: typeof TASK_ACTIONS } = {
    body,
    tag,
    icon: './icon-192.png',
    badge: './badge-96.png',
    data: { url, habitId, medDose },
    requireInteraction: true,
    ...(tag.startsWith('tasks-') ? { actions: TASK_ACTIONS } : habitId ? { actions: [{ action: 'habit-done', title: 'Hecho' }] } : medDose ? { actions: [{ action: 'med-taken', title: 'Tomada' }] } : {}),
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return void (await reg.showNotification(title, options))
    new Notification(title, options)
  } catch {
    /* sin permiso o sin soporte */
  }
}

export function startLocalReminders() {
  primeSound()
  listenToWorker()
  let last = Date.now() - 60_000
  const seen = loadSeen()
  const check = async () => {
    const now = Date.now()
    const last0 = last
    const due = (await db.tasks.where('done').equals(0).toArray()).filter(
      (t) => t.remindAt !== undefined && t.remindAt > last && t.remindAt <= now && !seen.has(`${t.id}:${t.remindAt}`),
    )
    last = now
    for (const t of due) {
      seen.add(`${t.id}:${t.remindAt}`)
      const when = t.dueTime ? `A las ${t.dueTime}` : 'Hoy'
      toast(
        t.title,
        [
          { label: 'Hecho', run: () => void applyReminderAction('done', t.id) },
          { label: `${SNOOZE_MINUTES} min`, run: () => void applyReminderAction('snooze', t.id) },
        ],
        20_000,
        { icon: 'bell', onClick: () => openTaskFromNotification(t.id) },
      )
      void showSystemNotification(`tasks-${t.id}`, t.title, when, `./#/task/${t.id}`, `tasks-${t.id}-${t.remindAt}`)
    }
    // Avisos insistentes: se repiten hasta que la tarea se hace o se pospone
    const nags = (await db.tasks.where('done').equals(0).toArray())
      .filter((t) => t.nag && t.remindAt !== undefined)
      .map((t) => ({ t, slot: nagSlot(t.remindAt!, t.nag!, now) }))
      .filter(({ t, slot }) => slot && slot.at > last0 && !seen.has(`${t.id}:${slot.at}`))
    for (const { t, slot } of nags) {
      seen.add(`${t.id}:${slot!.at}`)
      toast(
        `Sigue pendiente: ${t.title}`,
        [
          { label: 'Hecho', run: () => void applyReminderAction('done', t.id) },
          { label: `${SNOOZE_MINUTES} min`, run: () => void applyReminderAction('snooze', t.id) },
        ],
        20_000,
        { icon: 'bell', onClick: () => openTaskFromNotification(t.id) },
      )
      void showSystemNotification(`tasks-${t.id}`, t.title, 'Sigue pendiente', `./#/task/${t.id}`, `tasks-${t.id}-${slot!.at}`)
    }
    // Pagos: aviso días antes del cargo
    const subs = (await db.subscriptions.toArray()).filter(
      (x) => x.active && x.remindAt !== undefined && x.remindAt > last0 && x.remindAt <= now && !seen.has(`${x.id}:${x.remindAt}`),
    )
    for (const x of subs) {
      seen.add(`${x.id}:${x.remindAt}`)
      const when = chargeWhen(x.nextDate).toLowerCase()
      // Prueba gratis: lo importante es decidir antes de que empiece a cobrar
      const body = inTrial(x) ? `La prueba gratis acaba ${/^\d/.test(when) ? `el ${when}` : when}: si no la cancelas, te cobrarán ${money(x.amount, x.currency)}` : `${money(x.amount, x.currency)} · ${when}`
      toast(`${x.name}: ${body}`, { label: 'Ver', run: () => navigate('/finance') }, 15_000, { icon: 'bell' })
      void showSystemNotification(`subscriptions-${x.id}`, x.name, inTrial(x) ? body : `Cargo de ${body}`, './#/finance', `subscriptions-${x.id}-${x.remindAt}`)
    }
    // Cosas: caducidades y préstamos
    const things = (await db.things.toArray()).filter((x) => !x.returned && x.remindAt !== undefined && x.remindAt > last0 && x.remindAt <= now && !seen.has(`${x.id}:${x.remindAt}`))
    for (const x of things) {
      seen.add(`${x.id}:${x.remindAt}`)
      const warrantyOnly = x.warranty && !x.expires && !x.returnBy
      const body = warrantyOnly
        ? 'La garantía acaba pronto. Si falla algo, reclámalo antes.'
        : x.kind === 'lent'
          ? `Se lo prestaste a ${x.personName ?? 'alguien'}. ¿Te lo ha devuelto?`
          : x.kind === 'borrowed'
            ? `Tienes que devolvérselo a ${x.personName ?? 'alguien'}.`
            : 'Caduca pronto. Toca renovarlo.'
      toast(`${x.name}: ${body}`, { label: 'Ver', run: () => navigate(`/things/${x.id}`) }, 15_000, { icon: 'bell' })
      void showSystemNotification(`things-${x.id}`, x.name, body, './#/things', `things-${x.id}-${x.remindAt}`)
    }
    // «Última vez»: toca volver a hacerlo
    const trackers = (await db.trackers.where('archived').equals(0).toArray()).filter((x) => x.remindAt !== undefined && x.remindAt > last0 && x.remindAt <= now && !seen.has(`${x.id}:${x.remindAt}`))
    for (const x of trackers) {
      seen.add(`${x.id}:${x.remindAt}`)
      const days = x.log[0] ? Math.round((Date.parse(today()) - Date.parse(x.log[0])) / 864e5) : 0
      const body = `La última vez fue hace ${days} ${days === 1 ? 'día' : 'días'}. ¿Toca ya?`
      toast(`${x.name}: ${body}`, { label: 'Ver', run: () => navigate('/trackers') }, 15_000, { icon: 'bell' })
      void showSystemNotification(`trackers-${x.id}`, x.name, body, './#/trackers', `trackers-${x.id}-${x.remindAt}`)
    }
    // Hábitos con hora de aviso que aún no están hechos hoy
    const day = today()
    const nowHm = new Date(now).toTimeString().slice(0, 5)
    const habits = (await db.habits.where('archived').equals(0).toArray()).filter(
      (h) => h.remindTime && nowHm >= h.remindTime && minutesBetween(h.remindTime, nowHm) < 15 && !seen.has(`habit:${h.id}:${day}`),
    )
    const pending: typeof habits = []
    for (const h of habits) {
      seen.add(`habit:${h.id}:${day}`)
      // Hecho hoy, o «N veces por semana» ya cumplido: no se avisa
      const logs = await db.habitLogs.where('habitId').equals(h.id).and((l) => l.date >= weekStart(day)).toArray()
      const done = doneDays(h, groupLogs(logs).get(h.id))
      if (done.has(day) || !isDue(h, done, day)) continue
      pending.push(h)
      toast(`${h.name}: aún no lo has marcado hoy`, { label: 'Hecho', run: () => void applyReminderAction('habit-done', h.id) }, 20_000, {
        icon: 'bell',
        onClick: () => navigate('/habits'),
      })
      void showSystemNotification(`habits-${h.id}`, h.name, 'Aún no lo has marcado hoy. ¿Lo haces ahora?', './#/habits', `habits-${h.id}-${day}`, h.id)
    }
    // Medicación: a la hora y, si no se marca, a los 15 y a los 30 minutos (las mismas claves que el push)
    const medsDue: string[] = []
    const meds = await db.meds.where('archived').equals(0).toArray()
    if (meds.length) {
      const { dosesOn, medReminder, nagIndex } = await import('@/lib/meds')
      const logs = await db.medLogs.where('date').equals(day).toArray()
      for (const d of dosesOn(meds, logs, day, day, nowHm)) {
        const n = d.log ? undefined : nagIndex(d.time, nowHm)
        const key = `meds-${d.med.id}-${day}-${d.time}-${n}`
        if (n === undefined || seen.has(key)) continue
        seen.add(key)
        medsDue.push(key)
        const msg = medReminder(d.med, d.time, n)
        const dose = `${d.med.id}|${day}|${d.time}`
        toast(msg.title, { label: 'Tomada', run: () => void applyReminderAction('med-taken', dose) }, 30_000, { icon: 'bell', onClick: () => navigate('/meds') })
        void showSystemNotification(`meds-${d.med.id}-${d.time}`, msg.title, msg.body, './#/meds', key, undefined, dose)
      }
    }
    // Rutinas con hora que aún no están completas
    const routines = (await db.routines.where('archived').equals(0).toArray()).filter(
      (r) => r.time && r.steps.length && routineToday(r, day) && nowHm >= r.time && minutesBetween(r.time, nowHm) < 15 && !seen.has(`routine:${r.id}:${day}`),
    )
    const startNow: typeof routines = []
    for (const r of routines) {
      seen.add(`routine:${r.id}:${day}`)
      const run = await db.routineRuns.where('[routineId+date]').equals([r.id, day]).first()
      if (routineProgress(r, run).complete) continue
      startNow.push(r)
      toast(`Es la hora: ${r.name}`, { label: 'Empezar', run: () => runner.open(r.id) }, 20_000, { icon: 'bell', onClick: () => runner.open(r.id) })
      void showSystemNotification(`routines-${r.id}`, r.name, `Es la hora: ${r.steps.length} pasos. Toca para hacerla paso a paso.`, `./#/routine/${r.id}`, `routines-${r.id}-${day}`)
    }
    // Fechas límite: la víspera y el mismo día, a la hora elegida (la misma clave que el push)
    const dl = (await db.settings.get('deadlineAlerts'))?.value as DeadlineAlertPrefs | undefined
    const dlTime = dl?.time || DEADLINE_ALERT_TIME
    const deadlines: { id: string; title: string; kind: 'today' | 'tomorrow' }[] = []
    if (dl?.enabled !== false && nowHm >= dlTime && minutesBetween(dlTime, nowHm) < 15) {
      const tomorrow = addDaysYmd(day, 1)
      for (const t of await db.tasks.where('done').equals(0).toArray()) {
        const kind = deadlineAlert(t.deadline, day, tomorrow)
        if (!kind || seen.has(`deadline:${t.id}:${day}`)) continue
        seen.add(`deadline:${t.id}:${day}`)
        deadlines.push({ id: t.id, title: t.title, kind })
      }
    }
    for (const t of deadlines) {
      const body = deadlineMessage(t.kind)
      toast(
        `${t.title}: ${body.charAt(0).toLowerCase()}${body.slice(1)}`,
        [
          { label: 'Hecho', run: () => void applyReminderAction('done', t.id) },
          { label: 'Ver', run: () => openTaskFromNotification(t.id) },
        ],
        20_000,
        { icon: 'bell', onClick: () => openTaskFromNotification(t.id) },
      )
      void showSystemNotification(`tasks-${t.id}`, t.title, body, `./#/task/${t.id}`, `deadline-${t.id}-${day}`)
    }
    // Diario: por la noche, si hoy aún no se ha escrito
    const jr = (await db.settings.get('journalReminder'))?.value as { enabled?: boolean; time?: string } | undefined
    let journalDue = false
    if (jr?.enabled && jr.time && nowHm >= jr.time && minutesBetween(jr.time, nowHm) < 15 && !seen.has(`journal:${day}`)) {
      seen.add(`journal:${day}`)
      const entry = await db.journal.get(day)
      if (!(entry && (entry.mood || entry.text.trim()))) {
        journalDue = true
        toast('¿Qué tal el día? Apúntalo en un minuto', { label: 'Escribir', run: () => navigate('/journal') }, 20_000, { icon: 'bell' })
        void showSystemNotification('journal', '¿Qué tal el día?', 'Apunta cómo te ha ido en un minuto.', './#/journal', `journal-${day}`)
      }
    }
    if (habits.length || routines.length || journalDue || deadlines.length || medsDue.length) saveSeen(seen)
    if (due.length || nags.length || subs.length || things.length || trackers.length || pending.length || startNow.length || journalDue || deadlines.length || medsDue.length) {
      saveSeen(seen)
      if (prefs.reminderSound) chime()
    }
  }
  void check()
  const timer = setInterval(() => void check(), CHECK_MS)
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    void rollSubscriptions()
    void check()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/**
 * Prueba en este dispositivo, sin servidor: sonido y notificación del sistema
 * al momento. Sirve para ver si el sistema operativo deja mostrar avisos.
 */
export async function testHere(): Promise<'shown' | 'denied' | 'unsupported'> {
  chime()
  if (!('Notification' in window)) return 'unsupported'
  const permission = Notification.permission === 'default' ? await askPermission() : Notification.permission
  if (permission !== 'granted') return 'denied'
  await showSystemNotification('ntab-test-local', 'LUNO', 'Así te avisaré de tus tareas ⏰', './#/settings')
  return 'shown'
}

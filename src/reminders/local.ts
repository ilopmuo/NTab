import { db } from '@/db/db'
import { rollSubscriptions, toggleHabit, toggleTask, updateTask } from '@/db/actions'
import { today } from '@/lib/dates'
import { isScheduled } from '@/lib/habits'
import { chargeWhen, money } from '@/lib/finance'
import { toast, ui } from '@/app/store'
import { navigate } from '@/app/router'
import { prefs } from '@/lib/prefs'
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
export type ReminderAction = 'snooze' | 'done' | 'habit-done'

/** minutos de a a b (HH:MM del mismo día) */
function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return bh * 60 + bm - (ah * 60 + am)
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** Posponer o completar desde un aviso (dentro de la app o desde la notificación) */
export async function applyReminderAction(action: ReminderAction, id: string) {
  if (action === 'habit-done') {
    const habit = await db.habits.get(id)
    if (!habit) return
    const t = today()
    const done = await db.habitLogs.where('[habitId+date]').equals([id, t]).count()
    if (!done) await toggleHabit(id, t)
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
    if (d?.type === 'reminder-action' && d.id && (d.action === 'snooze' || d.action === 'done' || d.action === 'habit-done')) void applyReminderAction(d.action, d.id)
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

export async function showSystemNotification(tag: string, title: string, body: string, url: string, key?: string, habitId?: string) {
  if (key) await markAlerted(key)
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options: NotificationOptions & { actions?: typeof TASK_ACTIONS } = {
    body,
    tag,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url, habitId },
    requireInteraction: true,
    ...(tag.startsWith('tasks-') ? { actions: TASK_ACTIONS } : habitId ? { actions: [{ action: 'habit-done', title: 'Hecho' }] } : {}),
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
    // Pagos: aviso días antes del cargo
    const subs = (await db.subscriptions.toArray()).filter(
      (x) => x.active && x.remindAt !== undefined && x.remindAt > last0 && x.remindAt <= now && !seen.has(`${x.id}:${x.remindAt}`),
    )
    for (const x of subs) {
      seen.add(`${x.id}:${x.remindAt}`)
      const body = `${money(x.amount, x.currency)} · ${chargeWhen(x.nextDate).toLowerCase()}`
      toast(`${x.name}: ${body}`, { label: 'Ver', run: () => navigate('/finance') }, 15_000, { icon: 'bell' })
      void showSystemNotification(`subscriptions-${x.id}`, x.name, `Cargo de ${body}`, './#/finance', `subscriptions-${x.id}-${x.remindAt}`)
    }
    // Hábitos con hora de aviso que aún no están hechos hoy
    const day = today()
    const nowHm = new Date(now).toTimeString().slice(0, 5)
    const habits = (await db.habits.where('archived').equals(0).toArray()).filter(
      (h) => h.remindTime && isScheduled(h, day) && nowHm >= h.remindTime && minutesBetween(h.remindTime, nowHm) < 15 && !seen.has(`habit:${h.id}:${day}`),
    )
    const pending: typeof habits = []
    for (const h of habits) {
      seen.add(`habit:${h.id}:${day}`)
      if (await db.habitLogs.where('[habitId+date]').equals([h.id, day]).count()) continue
      pending.push(h)
      toast(`${h.name}: aún no lo has marcado hoy`, { label: 'Hecho', run: () => void applyReminderAction('habit-done', h.id) }, 20_000, {
        icon: 'bell',
        onClick: () => navigate('/habits'),
      })
      void showSystemNotification(`habits-${h.id}`, h.name, 'Aún no lo has marcado hoy. ¿Lo haces ahora?', './#/habits', `habits-${h.id}-${day}`, h.id)
    }
    if (habits.length) saveSeen(seen)
    if (due.length || subs.length || pending.length) {
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
  await showSystemNotification('ntab-test-local', 'NTab', 'Así te avisaré de tus tareas ⏰', './#/settings')
  return 'shown'
}

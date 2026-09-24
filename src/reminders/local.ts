import { db } from '@/db/db'
import { rollSubscriptions } from '@/db/actions'
import { chargeWhen, money } from '@/lib/finance'
import { toast, ui } from '@/app/store'
import { navigate } from '@/app/router'
import { isPushEnabledHere } from './push'

/**
 * Avisos con la app abierta (o en segundo plano en el ordenador). Cuando el
 * dispositivo tiene activadas las notificaciones push, el servidor se encarga
 * de avisar con la app cerrada y aquí solo se muestra el aviso dentro de la app.
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

async function showSystemNotification(tag: string, title: string, body: string, url: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, tag, icon: './icon-192.png', badge: './icon-192.png', data: { url } }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return void (await reg.showNotification(title, options))
    new Notification(title, options)
  } catch {
    /* sin permiso o sin soporte */
  }
}

export function startLocalReminders() {
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
      toast(`⏰ ${t.title}`, { label: 'Ver', run: () => openTaskFromNotification(t.id) }, 15_000)
      // Con push activo el aviso del sistema ya lo manda el servidor
      if (!isPushEnabledHere() && document.visibilityState !== 'visible') void showSystemNotification(`task-${t.id}`, t.title, when, `./#/task/${t.id}`)
    }
    // Pagos: aviso días antes del cargo
    const subs = (await db.subscriptions.toArray()).filter(
      (x) => x.active && x.remindAt !== undefined && x.remindAt > last0 && x.remindAt <= now && !seen.has(`${x.id}:${x.remindAt}`),
    )
    for (const x of subs) {
      seen.add(`${x.id}:${x.remindAt}`)
      const body = `${money(x.amount, x.currency)} · ${chargeWhen(x.nextDate).toLowerCase()}`
      toast(`💳 ${x.name}: ${body}`, { label: 'Ver', run: () => navigate('/finance') }, 15_000)
      if (!isPushEnabledHere() && document.visibilityState !== 'visible') void showSystemNotification(`sub-${x.id}`, x.name, `Cargo de ${body}`, './#/finance')
    }
    if (due.length || subs.length) saveSeen(seen)
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

import { db } from '@/db/db'
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

async function showSystemNotification(id: string, title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, tag: `task-${id}`, icon: './icon-192.png', badge: './icon-192.png', data: { url: `./#/task/${id}` } }
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
    const due = (await db.tasks.where('done').equals(0).toArray()).filter(
      (t) => t.remindAt !== undefined && t.remindAt > last && t.remindAt <= now && !seen.has(`${t.id}:${t.remindAt}`),
    )
    last = now
    for (const t of due) {
      seen.add(`${t.id}:${t.remindAt}`)
      const when = t.dueTime ? `A las ${t.dueTime}` : 'Hoy'
      toast(`⏰ ${t.title}`, { label: 'Ver', run: () => openTaskFromNotification(t.id) }, 15_000)
      // Con push activo el aviso del sistema ya lo manda el servidor
      if (!isPushEnabledHere() && document.visibilityState !== 'visible') void showSystemNotification(t.id, t.title, when)
    }
    if (due.length) saveSeen(seen)
  }
  void check()
  const timer = setInterval(() => void check(), CHECK_MS)
  const onVisible = () => document.visibilityState === 'visible' && void check()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

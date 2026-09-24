import { db } from '@/db/db'
import { rollSubscriptions } from '@/db/actions'
import { chargeWhen, money } from '@/lib/finance'
import { toast, ui } from '@/app/store'
import { navigate } from '@/app/router'
import { prefs } from '@/lib/prefs'
import { chime, primeSound } from './sound'
import { askPermission } from './push'

/**
 * Avisos con la app abierta (o en segundo plano en el ordenador): aviso dentro
 * de la app, sonido y notificación del sistema. La notificación usa la misma
 * etiqueta que la del servidor y se apunta en la caché "ntab-alerted": cuando
 * llega el push del mismo aviso, el service worker ve que ya se avisó y no
 * vuelve a sonar (ver public/push-sw.js).
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

async function showSystemNotification(tag: string, title: string, body: string, url: string, mark = true) {
  if (mark) await markAlerted(tag)
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, tag, icon: './icon-192.png', badge: './icon-192.png', data: { url }, requireInteraction: true }
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
      void showSystemNotification(`tasks-${t.id}`, t.title, when, `./#/task/${t.id}`)
    }
    // Pagos: aviso días antes del cargo
    const subs = (await db.subscriptions.toArray()).filter(
      (x) => x.active && x.remindAt !== undefined && x.remindAt > last0 && x.remindAt <= now && !seen.has(`${x.id}:${x.remindAt}`),
    )
    for (const x of subs) {
      seen.add(`${x.id}:${x.remindAt}`)
      const body = `${money(x.amount, x.currency)} · ${chargeWhen(x.nextDate).toLowerCase()}`
      toast(`💳 ${x.name}: ${body}`, { label: 'Ver', run: () => navigate('/finance') }, 15_000)
      void showSystemNotification(`subscriptions-${x.id}`, x.name, `Cargo de ${body}`, './#/finance')
    }
    if (due.length || subs.length) {
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
  await showSystemNotification('ntab-test-local', 'NTab', 'Así te avisaré de tus tareas ⏰', './#/settings', false)
  return 'shown'
}

import { supabase } from '@/sync/supabase'

/**
 * Notificaciones push (con la app cerrada). El dispositivo se suscribe con la
 * clave pública VAPID y guarda la suscripción en Supabase; una función del
 * servidor (supabase/functions/send-reminders) la usa a la hora de cada aviso.
 */
export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BITtwUVzfRk6yMCn5x36uN9n3nRV7fpCXOyk_bf1RwMYryFTJ54C6HbJFCzdNVPNVMBuTzlT3OEOYbwM6eH3CJM'

const FLAG = 'ntab-push'

export type PushState =
  | 'unsupported' // el navegador no lo permite
  | 'needs-install' // iPhone/iPad: hay que añadir la app a la pantalla de inicio
  | 'denied' // el usuario lo bloqueó
  | 'off'
  | 'on'

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function isPushEnabledHere() {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

/** Error con un mensaje pensado para el usuario (dice en qué paso falló) */
export class PushError extends Error {}

/** Rechaza si la promesa no termina a tiempo: en iOS algunas llamadas se quedan colgadas */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PushError(message)), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })
}

export async function getPushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000, '')
    const sub = await withTimeout(reg?.pushManager.getSubscription() ?? Promise.resolve(null), 3000, '')
    return sub && isPushEnabledHere() ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

function keyToBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/**
 * Pide permiso. En algunas versiones de iOS la promesa no se resuelve nunca,
 * así que también se escucha la versión con callback y se vigila el permiso.
 */
function askPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    let done = false
    const finish = (p: NotificationPermission) => {
      if (done) return
      done = true
      clearInterval(poll)
      resolve(p)
    }
    const poll = setInterval(() => Notification.permission !== 'default' && finish(Notification.permission), 400)
    try {
      const r = Notification.requestPermission(finish)
      if (r && typeof r.then === 'function') r.then(finish, () => finish(Notification.permission))
    } catch {
      finish(Notification.permission)
    }
  })
}

/** El service worker activo (lo registra si hace falta) */
async function activeWorker(): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration()
  if (!reg) reg = await navigator.serviceWorker.register('./sw.js', { scope: './' })
  if (reg.active) return reg
  const worker = reg.installing ?? reg.waiting
  if (worker) {
    await new Promise<void>((resolve) => {
      worker.addEventListener('statechange', () => worker.state === 'activated' && resolve())
    })
  }
  return reg
}

/** Pide permiso, suscribe este dispositivo y lo guarda en tu cuenta */
export async function enablePush(userId: string): Promise<PushState> {
  // Primero, sin esperar a nada más: iOS solo muestra la petición si viene directa del toque
  const permission = await withTimeout(
    askPermission(),
    120_000,
    'El iPhone no respondió al pedir permiso. Cierra NTab del todo (desliza hacia arriba) y vuelve a abrirla.',
  )
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const reg = await withTimeout(
    activeWorker(),
    15_000,
    'La app aún no está lista en segundo plano. Cierra NTab del todo, ábrela otra vez y espera unos segundos.',
  )
  let sub = await withTimeout(reg.pushManager.getSubscription(), 10_000, 'No se pudo consultar la suscripción de este dispositivo.')
  if (!sub) {
    sub = await withTimeout(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }),
      20_000,
      'El servicio de notificaciones de Apple no respondió. Revisa la conexión y vuelve a probar.',
    ).catch((e: unknown) => {
      if (e instanceof PushError) throw e
      throw new PushError(`No se pudo suscribir este dispositivo: ${e instanceof Error ? e.message : String(e)}`)
    })
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await withTimeout(
    Promise.resolve(
      supabase.from('push_subscriptions').upsert(
        {
          endpoint: json.endpoint,
          user_id: userId,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent.slice(0, 200),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        { onConflict: 'endpoint' },
      ),
    ),
    15_000,
    'No se pudo guardar el dispositivo en tu cuenta (sin respuesta del servidor).',
  )
  if (error) throw new PushError(`No se pudo guardar el dispositivo en tu cuenta: ${error.message}`)
  localStorage.setItem(FLAG, '1')
  return 'on'
}

/** Da de baja este dispositivo */
export async function disablePush(): Promise<PushState> {
  localStorage.removeItem(FLAG)
  const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 5000, 'No se pudo desactivar (sin respuesta).')
  const sub = await withTimeout(reg?.pushManager.getSubscription() ?? Promise.resolve(null), 5000, 'No se pudo desactivar (sin respuesta).')
  if (sub) {
    await withTimeout(Promise.resolve(supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)), 10_000, 'Sin respuesta del servidor.').catch(() => {})
    await sub.unsubscribe().catch(() => false)
  }
  return 'off'
}

/**
 * Aviso de prueba de verdad: lo manda el servidor por push a todos tus
 * dispositivos con los avisos activados, igual que un aviso real.
 * Devuelve a cuántos dispositivos se envió.
 */
export async function testNotification(delaySeconds = 5): Promise<number> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke<{ sent?: number; error?: string }>('send-reminders', { body: { test: true, delay: delaySeconds } }),
    30_000,
    'El servidor no respondió al enviar la prueba.',
  )
  if (error) {
    let detail = error.message
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) detail = body.error
    } catch {
      /* sin detalle */
    }
    throw new PushError(`No se pudo enviar la prueba: ${detail}`)
  }
  if (data?.error) throw new PushError(`No se pudo enviar la prueba: ${data.error}`)
  return data?.sent ?? 0
}

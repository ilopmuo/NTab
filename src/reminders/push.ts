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

export async function getPushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && isPushEnabledHere() ? 'on' : 'off'
}

function keyToBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Pide permiso, suscribe este dispositivo y lo guarda en tu cuenta */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Inicia sesión para activar los avisos con la app cerrada')
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      user_id: userData.user.id,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  localStorage.setItem(FLAG, '1')
  return 'on'
}

/** Da de baja este dispositivo */
export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  localStorage.removeItem(FLAG)
  return 'off'
}

/** Notificación de prueba en este dispositivo (sin pasar por el servidor) */
export async function testNotification() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('NTab', {
    body: 'Así te llegarán los avisos de tus tareas ⏰',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: './#/today' },
  })
}

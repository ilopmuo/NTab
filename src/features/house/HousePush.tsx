import { useEffect, useState } from 'react'
import { Bell, BellOff, Share, SquarePlus } from 'lucide-react'
import { PushError, isIOS, isStandalone, subscribeDevice } from '@/reminders/push'
import { toast } from '@/app/store'
import { Button, Card } from '@/components/ui'
import { houseUrl } from './store'

/**
 * Avisos del piso en este móvil, también sin cuenta: por la mañana lo que te
 * toca y por la tarde lo que sigue sin hacer (los envía send-reminders). Se
 * guardan en el servidor para el miembro del piso que eres.
 */
export type HousePushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const FLAG = (token: string) => `ntab-house-push:${token}`

function flagged(token: string) {
  try {
    return localStorage.getItem(FLAG(token))
  } catch {
    return null
  }
}

export function housePushState(token: string, me: string): HousePushState {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return flagged(token) === me ? 'on' : 'off'
}

async function post(token: string, body: unknown) {
  const res = await fetch(houseUrl(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new PushError('No se ha podido guardar en el piso. ¿Tienes conexión?')
}

export async function enableHousePush(token: string, member: string, open: 'piso' | 'house'): Promise<HousePushState> {
  const sub = await subscribeDevice()
  if (typeof sub === 'string') return sub
  await post(token, { push: { member, endpoint: sub.endpoint, keys: sub.keys, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, open } })
  try {
    localStorage.setItem(FLAG(token), member)
  } catch {
    /* sin almacenamiento */
  }
  return 'on'
}

/** Quita los avisos del piso de este móvil (sin tocar los avisos de tu LUNO, si los tienes) */
export async function disableHousePush(token: string): Promise<HousePushState> {
  try {
    localStorage.removeItem(FLAG(token))
  } catch {
    /* sin almacenamiento */
  }
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (sub) await post(token, { unpush: { endpoint: sub.endpoint } }).catch(() => {})
  return 'off'
}

/** Activar o quitar los avisos del piso. `compact`: solo una línea (cuando ya están puestos) */
export function HousePushCard({ token, me, open, compact }: { token: string; me: string; open: 'piso' | 'house'; compact?: boolean }) {
  const [state, setState] = useState<HousePushState>(() => housePushState(token, me))
  const [busy, setBusy] = useState(false)
  useEffect(() => setState(housePushState(token, me)), [token, me])
  if (state === 'unsupported') return null
  const run = async (fn: () => Promise<HousePushState>) => {
    setBusy(true)
    try {
      const next = await fn()
      setState(next)
      if (next === 'on') toast('Listo: te avisaremos de lo que te toca en casa')
      if (next === 'denied') toast('Has bloqueado los avisos: actívalos en los ajustes del navegador')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se han podido activar los avisos')
    } finally {
      setBusy(false)
    }
  }
  if (state === 'on' && compact)
    return (
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted">
        <Bell size={13} /> Avisos activados ·{' '}
        <button type="button" disabled={busy} onClick={() => void run(() => disableHousePush(token))} className="font-semibold text-blue">
          Quitar
        </button>
      </p>
    )
  return (
    <Card className="mb-6 flex items-start gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill">{state === 'denied' ? <BellOff size={17} /> : <Bell size={17} />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{state === 'on' ? 'Avisos activados' : 'Que te avise el móvil'}</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-muted">
          {state === 'needs-install'
            ? 'En el iPhone, los avisos solo llegan con el piso en la pantalla de inicio: añádelo (aquí abajo te dice cómo), ábrelo desde ahí y actívalos.'
            : state === 'denied'
              ? 'Has bloqueado los avisos de esta web. Actívalos en los ajustes del navegador y vuelve aquí.'
              : 'A las 9:00, lo que te toca en casa; a las 20:00, si sigue sin hacer.'}
        </p>
      </div>
      {(state === 'off' || state === 'on') && (
        <Button size="sm" variant={state === 'on' ? 'secondary' : 'primary'} disabled={busy} onClick={() => void run(() => (state === 'on' ? disableHousePush(token) : enableHousePush(token, me, open)))}>
          {state === 'on' ? 'Quitar' : 'Activar'}
        </Button>
      )}
    </Card>
  )
}

// Android y Chrome: el aviso del navegador para instalar, si llega
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e as Event & { prompt: () => Promise<void> }
  })

/** Cómo tener el piso en la pantalla de inicio (y así abrirlo de un toque y recibir avisos en el iPhone) */
export function InstallHint() {
  const [hidden, setHidden] = useState(false)
  if (hidden || isStandalone() || !matchMedia('(pointer: coarse)').matches) return null
  return (
    <Card className="mb-6 flex items-start gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill">
        <SquarePlus size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Tenlo en la pantalla de inicio</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-muted">
          {isIOS() ? (
            <>
              En Safari, toca <Share size={13} className="inline -translate-y-px" aria-label="Compartir" /> y luego «Añadir a pantalla de inicio». Se abrirá directamente en tu piso.
            </>
          ) : installPrompt ? (
            'Se abrirá directamente en tu piso, como una app.'
          ) : (
            'En el menú del navegador, «Añadir a pantalla de inicio». Se abrirá directamente en tu piso.'
          )}
        </p>
      </div>
      {installPrompt && !isIOS() && (
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            await installPrompt?.prompt()
            installPrompt = null
            setHidden(true)
          }}
        >
          Instalar
        </Button>
      )}
    </Card>
  )
}

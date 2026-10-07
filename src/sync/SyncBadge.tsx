import { AlertTriangle, Cloud, CloudOff, CloudUpload, Loader2, LogIn } from 'lucide-react'
import { href } from '@/app/router'
import { cx } from '@/components/ui'
import { openAuth, useSync, type SyncStatus } from './service'

/** «20 segundos», «5 minutos», «1 hora», «3 días» (lo de formatDistanceToNowStrict, sin cargarlo al arrancar) */
export function since(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000))
  const [n, one, many]: [number, string, string] =
    s < 60 ? [s, 'segundo', 'segundos'] : s < 3600 ? [Math.round(s / 60), 'minuto', 'minutos'] : s < 86400 ? [Math.round(s / 3600), 'hora', 'horas'] : [Math.round(s / 86400), 'día', 'días']
  return `${n} ${n === 1 ? one : many}`
}

export function syncLabel(s: SyncStatus): { icon: React.ReactNode; text: string; tone: string } {
  switch (s.state) {
    case 'syncing':
      return { icon: <Loader2 size={14} className="animate-spin" />, text: 'Sincronizando…', tone: 'text-muted' }
    case 'synced':
      return {
        icon: <Cloud size={14} />,
        text: s.lastSyncAt ? `Sincronizado · ${since(s.lastSyncAt)}` : 'Sincronizado',
        tone: 'text-muted',
      }
    case 'pending':
      return { icon: <CloudUpload size={14} />, text: 'Cambios pendientes', tone: 'text-warn' }
    case 'offline':
      return { icon: <CloudOff size={14} />, text: 'Sin conexión · se guardará al volver', tone: 'text-warn' }
    case 'error':
      return { icon: <AlertTriangle size={14} />, text: 'Error al sincronizar', tone: 'text-danger' }
    default:
      return s.knownEmail
        ? { icon: <LogIn size={14} />, text: 'Sesión caducada · entrar', tone: 'text-warn' }
        : { icon: <LogIn size={14} />, text: 'Solo en este dispositivo', tone: 'text-muted' }
  }
}

/** Estado de la sincronización en la barra lateral */
export function SyncBadge() {
  const s = useSync()
  if (s.state === 'loading') return null
  const { icon, text, tone } = syncLabel(s)
  if (s.state === 'signed-out') {
    return (
      <button
        type="button"
        onClick={openAuth}
        className={cx('flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] transition-colors hover:bg-hover', tone)}
      >
        <span className="flex w-4 justify-center">{icon}</span>
        <span className="truncate">{text}</span>
      </button>
    )
  }
  return (
    <a
      href={href('/settings')}
      title={s.error}
      className={cx('flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[12px] transition-colors hover:bg-hover', tone)}
    >
      <span className="flex w-4 justify-center">{icon}</span>
      <span className="truncate">{text}</span>
    </a>
  )
}

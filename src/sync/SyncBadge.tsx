import { AlertTriangle, Cloud, CloudOff, CloudUpload, Loader2, LogIn } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { href } from '@/app/router'
import { cx } from '@/components/ui'
import { openAuth, useSync, type SyncStatus } from './service'

export function syncLabel(s: SyncStatus): { icon: React.ReactNode; text: string; tone: string } {
  switch (s.state) {
    case 'syncing':
      return { icon: <Loader2 size={14} className="animate-spin" />, text: 'Sincronizando…', tone: 'text-muted' }
    case 'synced':
      return {
        icon: <Cloud size={14} />,
        text: s.lastSyncAt ? `Sincronizado · ${formatDistanceToNowStrict(s.lastSyncAt, { locale: es })}` : 'Sincronizado',
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
        : { icon: <LogIn size={14} />, text: 'Solo en este dispositivo', tone: 'text-faint' }
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

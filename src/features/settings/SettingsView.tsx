import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BellRing,
  Clock,
  Send,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cloud,
  Download,
  Keyboard,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Upload,
  Loader2,
  Sunrise,
  MonitorSmartphone,
  Volume2,
} from 'lucide-react'
import { openAuth, signOut, syncNow, useSync } from '@/sync/service'
import { syncLabel } from '@/sync/SyncBadge'
import type { Area } from '@/db/types'
import { db } from '@/db/db'
import { deleteArea, setSetting } from '@/db/actions'
import { useAreas } from '@/db/hooks'
import { downloadBackup, importData, isBackup, wipeData } from '@/db/backup'
import { seedIfEmpty } from '@/db/seed'
import { SectionIcon, section, type Tint } from '@/app/sections'
import { setUI, toast, ui, useUI } from '@/app/store'
import { setTheme, useTheme } from '@/app/theme'
import { AreaBadge } from '@/components/icons'
import { Group, IconButton, PageHeader, Segmented, Switch, cx } from '@/components/ui'
import { disablePush, enablePush, getPushState, testNotification, type PushState } from '@/reminders/push'
import { testHere } from '@/reminders/local'
import { AreaForm } from '../areas/AreaForm'
import { CalendarBlock } from './CalendarBlock'
import { CalendarSourcesBlock } from './CalendarSourcesBlock'
import { ClaudeBlock } from './ClaudeBlock'
import { Page } from '../Page'

/** Icono cuadrado de color, como en la app Ajustes */
function Glyph({ c, children }: { c: Tint; children: React.ReactNode }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill text-fg" data-tint={c}>
      {children}
    </span>
  )
}

const rowCls =
  "relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] transition-colors after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-px after:bg-line after:content-[''] last:after:hidden"

function Row({
  glyph,
  label,
  detail,
  onClick,
  danger,
  right,
}: {
  glyph: React.ReactNode
  label: string
  detail?: React.ReactNode
  onClick?: () => void
  danger?: boolean
  right?: React.ReactNode
}) {
  const content = (
    <>
      {glyph}
      <span className={cx('min-w-0 flex-1', danger && 'text-red')}>
        {label}
        {detail && <span className="block truncate text-[13px] text-muted">{detail}</span>}
      </span>
      {right ?? (onClick && <ChevronRight size={17} className="text-faint" />)}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(rowCls, 'hover:bg-hover active:bg-press')}>
      {content}
    </button>
  ) : (
    <div className={rowCls}>{content}</div>
  )
}

function Block({ title, footer, alert, children }: { title?: string; footer?: string; alert?: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      {title && <h2 className="mb-2 px-4 text-[13px] font-medium tracking-wide text-muted uppercase">{title}</h2>}
      <Group>{children}</Group>
      {footer && <p className={cx('mt-2 px-4 text-[13px] leading-snug', alert ? 'font-medium text-fg' : 'text-muted')}>{footer}</p>}
    </section>
  )
}

/** Cabecera de cuenta, como el Apple ID en Ajustes */
function AccountCard() {
  const sync = useSync()
  const { icon, text, tone } = syncLabel(sync)
  if (!sync.user) {
    return (
      <section className="mb-8">
        <Group>
          <button type="button" onClick={openAuth} className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-hover">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-fill text-muted">
              <LogIn size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold text-blue">{sync.knownEmail ? 'Volver a entrar' : 'Iniciar sesión'}</span>
              <span className="block text-[13px] leading-snug text-muted">
                {sync.knownEmail ? `La sesión de ${sync.knownEmail} ha caducado. Entra para seguir sincronizando.` : 'Ten tus datos en el iPhone, el iPad y el ordenador.'}
              </span>
            </span>
            <ChevronRight size={18} className="text-faint" />
          </button>
        </Group>
      </section>
    )
  }
  return (
    <section className="mb-8">
      <Group>
        <div className="flex items-center gap-4 p-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-semibold text-white"
            style={{ background: 'linear-gradient(180deg, #a9adb6, #7f848d)' }}
          >
            {sync.user.email.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{sync.user.email}</p>
            <p className={cx('flex items-center gap-1.5 text-[13px]', tone)}>
              {icon} {text}
            </p>
          </div>
        </div>
        {sync.error && <p className="px-4 pb-3 text-[13px] break-words text-red">{sync.error}</p>}
        <div className="shadow-[inset_0_1px_0_var(--c-border)]">
          <Row
            glyph={
              <Glyph c="blue">
                <RefreshCw size={15} strokeWidth={2.4} />
              </Glyph>
            }
            label="Sincronizar ahora"
            onClick={() => void syncNow()}
          />
          <Row
            glyph={
              <Glyph c="red">
                <LogOut size={15} strokeWidth={2.4} />
              </Glyph>
            }
            label="Cerrar sesión"
            danger
            onClick={() => void signOut()}
          />
        </div>
      </Group>
    </section>
  )
}

/** Cuando el navegador tiene permiso pero el sistema operativo no enseña los avisos */
const OS_HELP = navigator.userAgent.includes('Mac')
  ? 'En el Mac: Ajustes del Sistema → Notificaciones → tu navegador (Chrome, Safari…) → Permitir notificaciones, estilo «Alertas» y sonido. Revisa también que no esté activo un modo de Concentración.'
  : 'En Windows: Configuración → Sistema → Notificaciones → activa tu navegador y el sonido. Revisa también el modo No molestar / Asistente de concentración.'

const PUSH_HELP: Record<PushState, string> = {
  on: 'Te llegarán los avisos aunque NTab esté cerrada.',
  off: 'Actívalo para recibir los avisos aunque NTab esté cerrada.',
  'needs-install':
    'En iPhone y iPad los avisos solo funcionan con NTab en la pantalla de inicio: en Safari, Compartir → Añadir a pantalla de inicio, y ábrela desde el icono.',
  denied: 'Has bloqueado las notificaciones. Actívalas en Ajustes del iPhone → Notificaciones → NTab (o en los ajustes del navegador).',
  unsupported: 'Este navegador no permite notificaciones. Mientras NTab esté abierta te avisará dentro de la app.',
}

/** Avisos: notificaciones push en este dispositivo y aviso automático */
function NotificationsBlock() {
  const sync = useSync()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRemind = useLiveQuery(() => db.settings.get('autoRemind'), [])
  const sound = useLiveQuery(() => db.settings.get('reminderSound'), [])
  const digestRow = useLiveQuery(() => db.settings.get('dailyDigest'), [])
  const digest = { enabled: false, time: '08:00', ...(digestRow?.value as { enabled?: boolean; time?: string } | undefined) }
  const setDigest = (patch: Partial<typeof digest>) => void setSetting('dailyDigest', { ...digest, ...patch })
  useEffect(() => {
    void getPushState().then(setState)
  }, [])
  const tryHere = async () => {
    setError(null)
    const r = await testHere()
    if (r === 'shown') toast(`¿No ves la notificación? ${OS_HELP}`, undefined, 12_000)
    else if (r === 'denied') setError('El navegador tiene bloqueadas las notificaciones de NTab. Actívalas en los ajustes del sitio (el candado junto a la dirección).')
    else setError('Este navegador no permite notificaciones.')
    void getPushState().then(setState)
  }
  const toggle = (on: boolean) => {
    if (!sync.user) return openAuth()
    const userId = sync.user.id
    setBusy(true)
    setError(null)
    // enablePush se llama sin esperar a nada: iOS exige que el permiso se pida en el mismo toque
    const run = on ? enablePush(userId) : disablePush()
    void run
      .then((next) => {
        setState(next)
        if (next === 'on') toast('Avisos activados en este dispositivo')
        else if (!on) toast('Avisos desactivados en este dispositivo')
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron activar los avisos'))
      .finally(() => setBusy(false))
  }
  const test = async () => {
    setTesting(true)
    setError(null)
    try {
      const sent = await testNotification(5)
      if (sent) toast('Aviso enviado: te llegará en unos segundos. Sal a la pantalla de inicio para verlo.', undefined, 8000)
      else setError('El servidor no encontró este dispositivo. Desactiva y vuelve a activar las notificaciones.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la prueba')
    } finally {
      setTesting(false)
    }
  }
  const canToggle = state === 'on' || state === 'off'
  const footer = error ?? (state ? (sync.user || state !== 'off' ? PUSH_HELP[state] : 'Inicia sesión para recibir los avisos con la app cerrada.') : undefined)
  return (
    <Block title="Avisos" footer={footer} alert={!!error}>
      <Row
        glyph={
          <Glyph c="blue">
            <BellRing size={15} strokeWidth={2.4} />
          </Glyph>
        }
        label="Notificaciones en este dispositivo"
        detail={busy ? 'Activando…' : undefined}
        right={
          <span className="flex items-center gap-2">
            {busy && <Loader2 size={16} className="animate-spin text-muted" />}
            <Switch label="Notificaciones en este dispositivo" checked={state === 'on'} disabled={!canToggle || busy} onChange={toggle} />
          </span>
        }
      />
      <Row
        glyph={
          <Glyph c="gray">
            <Clock size={15} strokeWidth={2.4} />
          </Glyph>
        }
        label="Avisar a la hora de las tareas"
        detail="Las tareas con hora avisan solas; puedes cambiarlo en cada tarea"
        right={
          <Switch
            label="Avisar a la hora de las tareas"
            checked={autoRemind?.value !== false}
            onChange={(v) => void setSetting('autoRemind', v)}
          />
        }
      />
      <Row
        glyph={
          <Glyph c="gray">
            <Sunrise size={15} strokeWidth={2.4} />
          </Glyph>
        }
        label="Resumen de la mañana"
        detail={digest.enabled ? 'Lo que tienes hoy, en una notificación' : 'Una notificación diaria con lo que toca hoy'}
        right={
          <span className="flex items-center gap-2">
            {digest.enabled && (
              <input
                type="time"
                aria-label="Hora del resumen"
                value={digest.time}
                onChange={(e) => e.target.value && setDigest({ time: e.target.value })}
                className="font-num h-8 rounded-lg bg-fill px-2 text-[14px] font-semibold"
              />
            )}
            <Switch label="Resumen de la mañana" checked={digest.enabled} onChange={(v) => setDigest({ enabled: v })} />
          </span>
        }
      />
      <Row
        glyph={
          <Glyph c="gray">
            <Volume2 size={15} strokeWidth={2.4} />
          </Glyph>
        }
        label="Sonido con la app abierta"
        right={<Switch label="Sonido con la app abierta" checked={sound?.value !== false} onChange={(v) => void setSetting('reminderSound', v)} />}
      />
      <Row
        glyph={
          <Glyph c="gray">
            <MonitorSmartphone size={15} strokeWidth={2.4} />
          </Glyph>
        }
        label="Probar en este dispositivo"
        detail="Sonido y notificación al momento, sin pasar por el servidor"
        onClick={() => void tryHere()}
      />
      {state === 'on' && (
        <Row
          glyph={
            <Glyph c="gray">
              {testing ? <Loader2 size={15} strokeWidth={2.4} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />}
            </Glyph>
          }
          label={testing ? 'Enviando…' : 'Enviar un aviso de prueba'}
          detail="Llega en 5 segundos, como un aviso real"
          onClick={() => !testing && void test()}
        />
      )}
    </Block>
  )
}

export function SettingsView() {
  const theme = useTheme()
  const areas = useAreas()
  const creatingArea = useUI((s) => s.creating === 'area')
  const [editing, setEditing] = useState<Area | undefined>()
  const fileRef = useRef<HTMLInputElement>(null)

  const move = async (i: number, dir: -1 | 1) => {
    const a = areas[i]
    const b = areas[i + dir]
    if (!a || !b) return
    await db.transaction('rw', db.areas, async () => {
      await db.areas.update(a.id, { order: b.order })
      await db.areas.update(b.id, { order: a.order })
    })
  }

  return (
    <Page>
      <PageHeader icon={<SectionIcon def={section('settings')} size={40} />} title="Ajustes" />

      <AccountCard />

      <NotificationsBlock />
      <ClaudeBlock />
      <CalendarSourcesBlock />
      <CalendarBlock />

      <Block title="Apariencia">
        <Row
          glyph={
            <Glyph c="indigo">
              <Palette size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Tema"
          right={
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: <Moon size={14} strokeWidth={2.3} />, title: 'Oscuro' },
                { value: 'light', label: <Sun size={14} strokeWidth={2.3} />, title: 'Claro' },
                { value: 'system', label: <Monitor size={14} strokeWidth={2.3} />, title: 'Automático' },
              ]}
            />
          }
        />
      </Block>

      <Block title="Áreas de vida" footer="Las grandes parcelas de tu vida. Cada tarea, proyecto y nota puede pertenecer a una.">
        {areas.map((a, i) => (
          <div key={a.id} className={rowCls}>
            <AreaBadge icon={a.icon} size={30} />
            <span className="min-w-0 flex-1 truncate">{a.name}</span>
            <IconButton label="Subir" onClick={() => move(i, -1)} disabled={i === 0} className="h-8 w-8">
              <ChevronUp size={16} />
            </IconButton>
            <IconButton label="Bajar" onClick={() => move(i, 1)} disabled={i === areas.length - 1} className="h-8 w-8">
              <ChevronDown size={16} />
            </IconButton>
            <IconButton label="Editar" onClick={() => setEditing(a)} className="h-8 w-8">
              <Pencil size={14} />
            </IconButton>
            <IconButton
              label="Eliminar"
              className="h-8 w-8 hover:!text-red"
              onClick={async () => {
                if (!confirm(`¿Eliminar el área "${a.name}"? Sus tareas y proyectos se conservan sin área.`)) return
                await deleteArea(a.id)
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        <button type="button" onClick={() => setUI({ creating: 'area' })} className={cx(rowCls, 'font-medium text-blue hover:bg-hover')}>
          <span className="flex h-[30px] w-[30px] items-center justify-center">
            <Plus size={20} strokeWidth={2.4} />
          </span>
          Nueva área
        </button>
      </Block>

      <Block
        title="Tus datos"
        footer="Con sesión iniciada, tus datos ya están en la nube. La copia en archivo es un respaldo extra; importarla sustituye todos los datos."
      >
        <Row
          glyph={
            <Glyph c="teal">
              <Cloud size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Exportar copia"
          detail="Descarga un archivo con todo"
          onClick={() => void downloadBackup()}
          right={<Download size={17} className="text-faint" />}
        />
        <Row
          glyph={
            <Glyph c="green">
              <Upload size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Importar copia"
          onClick={() => fileRef.current?.click()}
        />
        <Row
          glyph={
            <Glyph c="red">
              <Trash2 size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Borrar todos los datos"
          danger
          onClick={async () => {
            if (!confirm('¿Borrar TODOS los datos? Con sesión iniciada se borran también de tu cuenta y del resto de dispositivos. No se puede deshacer: exporta una copia antes si la necesitas.')) return
            await wipeData()
            await seedIfEmpty()
            toast('Datos borrados')
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const data = JSON.parse(await file.text())
              if (!isBackup(data)) throw new Error('formato')
              if (!confirm('Esto sustituirá TODOS tus datos actuales por los de la copia. ¿Continuar?')) return
              await importData(data)
              toast('Copia importada correctamente')
            } catch {
              toast('El archivo no es una copia válida de NTab')
            }
          }}
        />
      </Block>

      <Block>
        <Row
          glyph={
            <Glyph c="gray">
              <Keyboard size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Atajos de teclado"
          onClick={() => ui.help()}
        />
      </Block>

      <p className="text-center text-[13px] text-faint">NTab {__APP_VERSION__}</p>

      <AreaForm open={creatingArea} onClose={() => setUI({ creating: null })} />
      <AreaForm area={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

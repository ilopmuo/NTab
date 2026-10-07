import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  BellRing,
  CalendarDays,
  Shapes,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cloud,
  Contrast,
  Download,
  Droplet,
  Keyboard,
  LayoutGrid,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Moon,
  Palette,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Sunrise,
  CalendarClock,
  Trash2,
  Upload,
  FileUp,
  Volume2,
  Wind,
} from 'lucide-react'
import { openAuth, signOut, syncNow, useSync } from '@/sync/service'
import { syncLabel } from '@/sync/SyncBadge'
import type { Area } from '@/db/types'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { deleteArea } from '@/db/moreActions'
import { useAreas } from '@/db/hooks'
import { downloadBackup, importData, isBackup, wipeData } from '@/db/backup'
import { seedIfEmpty } from '@/db/seed'
import { SectionIcon, section, type Tint } from '@/app/sections'
import { setUI, toast, ui, useUI } from '@/app/store'
import { navigate } from '@/app/router'
import { SETTINGS_PAGES } from '@/app/titles'
import { a11yPrefs, setContrastPref, setMotionPref, setTheme, useA11yPrefs, useTheme } from '@/app/theme'
import { AccentPicker } from './AccentPicker'
// Se carga al abrirla: los importadores no hacen falta para ver Ajustes
const ImportSheet = lazy(() => import('./ImportSheet').then((m) => ({ default: m.ImportSheet })))
import { LunoLockup } from '@/components/Brand'
import { FEATURES } from '@/lib/features'
import { useFeatures } from '@/app/features'
import { TodayCardsEditor } from '../today/cards'
import { AreaBadge } from '@/components/icons'
import { Group, IconButton, PageHeader, cx } from '@/components/ui'
import { Segmented, Switch } from '@/components/form'
import { disablePush, enablePush, getPushState, testNotification, type PushState } from '@/reminders/push'
import { testHere } from '@/reminders/local'
import { AreaForm } from '../areas/AreaForm'
import { CalendarBlock } from './CalendarBlock'
import { CalendarSourcesBlock } from './CalendarSourcesBlock'
import { ClaudeBlock } from './ClaudeBlock'
import { SiriBlock } from './SiriBlock'
import { Page } from '../Page'
import { DEADLINE_ALERT_TIME, type DeadlineAlertPrefs } from '@/lib/deadlines'

/** Icono cuadrado de color, como en la app Ajustes */
function Glyph({ c, children }: { c: Tint; children: React.ReactNode }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill text-fg" data-tint={c}>
      {children}
    </span>
  )
}

const rowCls =
  "relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] transition-colors active:bg-press after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-px after:bg-line after:content-[''] last:after:hidden"

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
  on: 'Te llegarán los avisos aunque LUNO esté cerrada.',
  off: 'Actívalo para recibir los avisos aunque LUNO esté cerrada.',
  'needs-install':
    'En iPhone y iPad los avisos solo funcionan con LUNO en la pantalla de inicio: en Safari, Compartir → Añadir a pantalla de inicio, y ábrela desde el icono.',
  denied: 'Has bloqueado las notificaciones. Actívalas en Ajustes del iPhone → Notificaciones → LUNO (o en los ajustes del navegador).',
  unsupported: 'Este navegador no permite notificaciones. Mientras LUNO esté abierta te avisará dentro de la app.',
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
  const deadlineRow = useLiveQuery(() => db.settings.get('deadlineAlerts'), [])
  const deadlines = { enabled: true, time: DEADLINE_ALERT_TIME, ...(deadlineRow?.value as DeadlineAlertPrefs | undefined) }
  const setDeadlines = (patch: Partial<typeof deadlines>) => void setSetting('deadlineAlerts', { ...deadlines, ...patch })
  useEffect(() => {
    void getPushState().then(setState)
  }, [])
  const tryHere = async () => {
    setError(null)
    const r = await testHere()
    if (r === 'shown') toast(`¿No ves la notificación? ${OS_HELP}`, undefined, 12_000)
    else if (r === 'denied') setError('El navegador tiene bloqueadas las notificaciones de LUNO. Actívalas en los ajustes del sitio (el candado junto a la dirección).')
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
            <CalendarClock size={15} strokeWidth={2.4} />
          </Glyph>
        }
        label="Fechas límite"
        detail={deadlines.enabled ? 'Aviso la víspera y el mismo día' : 'Sin aviso de las fechas límite'}
        right={
          <span className="flex items-center gap-2">
            {deadlines.enabled && (
              <input
                type="time"
                aria-label="Hora del aviso de fecha límite"
                value={deadlines.time}
                onChange={(e) => e.target.value && setDeadlines({ time: e.target.value })}
                className="font-num h-8 rounded-lg bg-fill px-2 text-[14px] font-semibold"
              />
            )}
            <Switch label="Avisar de las fechas límite" checked={deadlines.enabled} onChange={(v) => setDeadlines({ enabled: v })} />
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

/** Los apartados de Ajustes: cada uno, su página (como los Ajustes de iOS) */
const PAGES = [
  { id: 'avisos', detail: 'Notificaciones, resumen de la mañana y fechas límite', icon: Bell, c: 'red' },
  { id: 'apariencia', detail: 'Tema, color, contraste y movimiento', icon: Palette, c: 'indigo' },
  { id: 'funciones', detail: 'Qué ves en Hoy, en la barra lateral y en el móvil', icon: LayoutGrid, c: 'blue' },
  { id: 'areas', detail: 'Las grandes parcelas: trabajo, casa, salud…', icon: Shapes, c: 'blue' },
  { id: 'calendarios', detail: 'Tus calendarios en LUNO y LUNO en tu calendario', icon: CalendarDays, c: 'blue' },
  { id: 'conectar', detail: 'Apuntar y preguntar sin abrir la app', icon: Sparkles, c: 'gray' },
  { id: 'datos', detail: 'Copia, traer de otra app o borrarlo todo', icon: Cloud, c: 'teal' },
] as const satisfies readonly { id: keyof typeof SETTINGS_PAGES; detail: string; icon: typeof Bell; c: Tint }[]

/**
 * Ajustes: una portada corta (tu cuenta y los apartados) y cada apartado en su
 * página, con «‹ Ajustes» para volver. Antes era una sola página muy larga.
 */
export function SettingsView({ page }: { page?: string }) {
  const def = PAGES.find((x) => x.id === page)
  if (!def)
    return (
      <Page>
        <PageHeader icon={<SectionIcon def={section('settings')} size={40} />} title="Ajustes" />
        <AccountCard />
        <Block>
          {PAGES.map((x) => (
            <Row
              key={x.id}
              glyph={
                <Glyph c={x.c}>
                  <x.icon size={15} strokeWidth={2.4} />
                </Glyph>
              }
              label={SETTINGS_PAGES[x.id]}
              detail={x.detail}
              onClick={() => navigate(`/settings/${x.id}`)}
            />
          ))}
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
        <div className="flex flex-col items-center gap-2 pt-2 text-muted">
          <LunoLockup height={10} />
          <p className="text-[12px]">Versión {__APP_VERSION__}</p>
        </div>
      </Page>
    )
  return (
    <Page>
      <PageHeader
        icon={
          <Glyph c={def.c}>
            <def.icon size={18} strokeWidth={2.4} />
          </Glyph>
        }
        title={SETTINGS_PAGES[def.id]}
      />
      {def.id === 'avisos' && <NotificationsBlock />}
      {def.id === 'apariencia' && <AppearancePage />}
      {def.id === 'funciones' && <FeaturesPage />}
      {def.id === 'areas' && <AreasPage />}
      {def.id === 'calendarios' && (
        <>
          <CalendarSourcesBlock />
          <CalendarBlock />
        </>
      )}
      {def.id === 'conectar' && (
        <>
          <ClaudeBlock />
          <SiriBlock />
        </>
      )}
      {def.id === 'datos' && <DataPage />}
    </Page>
  )
}

function AppearancePage() {
  const theme = useTheme()
  useA11yPrefs()
  const a11y = a11yPrefs()
  return (
    <>
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
        <Row
          glyph={
            <Glyph c="blue">
              <Droplet size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Color"
          right={<AccentPicker />}
        />
      </Block>
      <Block title="Accesibilidad" footer="«Automático» sigue a lo que tengas en el sistema. Con «Sí», en este dispositivo siempre.">
        <Row
          glyph={
            <Glyph c="blue">
              <Contrast size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Más contraste"
          detail="Textos y bordes más marcados, sin transparencias"
          right={
            <Segmented
              value={a11y.contrast}
              onChange={setContrastPref}
              options={[
                { value: 'system', label: 'Auto', title: 'Automático' },
                { value: 'on', label: 'Sí', title: 'Siempre' },
              ]}
            />
          }
        />
        <Row
          glyph={
            <Glyph c="blue">
              <Wind size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Reducir movimiento"
          detail="Sin animaciones, confeti ni transiciones"
          right={
            <Segmented
              value={a11y.motion}
              onChange={setMotionPref}
              options={[
                { value: 'system', label: 'Auto', title: 'Automático' },
                { value: 'on', label: 'Sí', title: 'Siempre' },
              ]}
            />
          }
        />
      </Block>

    </>
  )
}

function FeaturesPage() {
  const [todayCards, setTodayCards] = useState(false)
  const features = useFeatures()
  return (
    <>
      <Block footer="Apaga lo que no uses y elige qué ves en Hoy, en la barra lateral y en las pestañas del móvil: el resto de la app se queda solo con lo tuyo. Tus datos no se borran.">
        <Row
          glyph={
            <Glyph c="blue">
              <LayoutGrid size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Elegir funciones"
          detail={`${FEATURES.filter((f) => features.on(f.id)).length} de ${FEATURES.length} encendidas`}
          onClick={() => ui.features()}
        />
        <Row
          glyph={
            <Glyph c="blue">
              <SlidersHorizontal size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Personalizar Hoy"
          detail="Qué tarjetas ves y en qué orden"
          onClick={() => setTodayCards(true)}
        />
        <Row
          glyph={
            <Glyph c="blue">
              <PanelLeft size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Barra lateral"
          detail="Qué secciones ves, dónde y en qué orden"
          onClick={() => ui.navEditor('sidebar')}
        />
        <Row
          glyph={
            <Glyph c="blue">
              <Smartphone size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Pestañas del móvil"
          detail="Las cuatro de la barra inferior"
          onClick={() => ui.navEditor('tabs')}
        />
      </Block>
      <TodayCardsEditor open={todayCards} onClose={() => setTodayCards(false)} />
    </>
  )
}

function AreasPage() {
  const areas = useAreas()
  const creatingArea = useUI((s) => s.creating === 'area')
  const [editing, setEditing] = useState<Area | undefined>()
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
    <>
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
        <button type="button" onClick={() => ui.create('area')} className={cx(rowCls, 'font-medium text-blue hover:bg-hover')}>
          <span className="flex h-[30px] w-[30px] items-center justify-center">
            <Plus size={20} strokeWidth={2.4} />
          </span>
          Nueva área
        </button>
      </Block>

      <AreaForm open={creatingArea} onClose={() => setUI({ creating: null })} />
      <AreaForm area={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </>
  )
}

function DataPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  return (
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
            <Glyph c="indigo">
              <FileUp size={15} strokeWidth={2.4} />
            </Glyph>
          }
          label="Traer de otra app"
          detail="Todoist, TickTick, Google Tasks o una lista pegada"
          onClick={() => setImporting(true)}
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
        {importing && (
          <Suspense fallback={null}>
            <ImportSheet open={importing} onClose={() => setImporting(false)} />
          </Suspense>
        )}
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
              toast('El archivo no es una copia válida de LUNO')
            }
          }}
        />
      </Block>
  )
}

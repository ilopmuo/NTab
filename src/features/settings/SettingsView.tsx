import { useRef, useState } from 'react'
import {
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
} from 'lucide-react'
import { openAuth, signOut, syncNow, useSync } from '@/sync/service'
import { syncLabel } from '@/sync/SyncBadge'
import type { Area } from '@/db/types'
import { db } from '@/db/db'
import { deleteArea } from '@/db/actions'
import { useAreas } from '@/db/hooks'
import { downloadBackup, importData, isBackup, wipeData } from '@/db/backup'
import { seedIfEmpty } from '@/db/seed'
import { SectionIcon, section, tint, type Tint } from '@/app/sections'
import { setUI, toast, ui, useUI } from '@/app/store'
import { setTheme, useTheme } from '@/app/theme'
import { AreaBadge } from '@/components/icons'
import { Group, IconButton, PageHeader, Segmented, cx } from '@/components/ui'
import { AreaForm } from '../areas/AreaForm'
import { Page } from '../Page'

/** Icono cuadrado de color, como en la app Ajustes */
function Glyph({ c, children }: { c: Tint; children: React.ReactNode }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white" style={{ background: tint(c) }}>
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

function Block({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      {title && <h2 className="mb-2 px-4 text-[13px] font-medium tracking-wide text-muted uppercase">{title}</h2>}
      <Group>{children}</Group>
      {footer && <p className="mt-2 px-4 text-[13px] leading-snug text-muted">{footer}</p>}
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
            style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${tint('blue')} 70%, white), ${tint('blue')})` }}
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
            <AreaBadge icon={a.icon} color={a.color} size={30} />
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

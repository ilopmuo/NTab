import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Keyboard, LogIn, LogOut, Monitor, Moon, Pencil, Plus, RefreshCw, Settings, Sun, Trash2, Upload } from 'lucide-react'
import { setLocalOnly, signOut, syncNow, useSync } from '@/sync/service'
import { syncLabel } from '@/sync/SyncBadge'
import type { Area } from '@/db/types'
import { db } from '@/db/db'
import { deleteArea } from '@/db/actions'
import { useAreas } from '@/db/hooks'
import { downloadBackup, importData, isBackup, wipeData } from '@/db/backup'
import { seedIfEmpty } from '@/db/seed'
import { setUI, toast, ui, useUI } from '@/app/store'
import { setTheme, useTheme } from '@/app/theme'
import { Icon } from '@/components/icons'
import { Button, Card, IconButton, PageHeader, Segmented } from '@/components/ui'
import { AreaForm } from '../areas/AreaForm'
import { Page } from '../Page'

function AccountBlock() {
  const sync = useSync()
  const { icon, text, tone } = syncLabel(sync)
  if (!sync.user) {
    return (
      <Block title="Cuenta y sincronización" desc="Ahora mismo tus datos solo están en este dispositivo. Crea una cuenta o entra para tenerlos también en el iPhone, el iPad y el ordenador.">
        <Button variant="primary" onClick={() => setLocalOnly(false)}>
          <LogIn size={15} /> Iniciar sesión o crear cuenta
        </Button>
      </Block>
    )
  }
  return (
    <Block title="Cuenta y sincronización" desc="Tus datos se guardan en tu cuenta y se sincronizan solos entre tus dispositivos. Sin conexión también funciona: los cambios se suben al volver.">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent">
          {sync.user.email.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{sync.user.email}</p>
          <p className={`flex items-center gap-1.5 text-[12.5px] ${tone}`}>
            {icon} {text}
          </p>
          {sync.error && <p className="mt-1 text-[12px] break-words text-danger">{sync.error}</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>
            <RefreshCw size={13} /> Sincronizar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>
            <LogOut size={13} /> Salir
          </Button>
        </div>
      </Card>
    </Block>
  )
}

function Block({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 mb-4 text-[13px] text-muted">{desc}</p>}
      {!desc && <div className="mb-4" />}
      {children}
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
      <PageHeader icon={<Settings size={26} className="text-muted" />} title="Ajustes" />

      <AccountBlock />

      <Block title="Apariencia">
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'dark', label: <><Moon size={13} /> Oscuro</> },
            { value: 'light', label: <><Sun size={13} /> Claro</> },
            { value: 'system', label: <><Monitor size={13} /> Sistema</> },
          ]}
        />
      </Block>

      <Block title="Áreas de vida" desc="Las grandes parcelas de tu vida. Cada tarea, proyecto y nota puede pertenecer a una.">
        <Card className="divide-y divide-line">
          {areas.map((a, i) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${a.color}22`, color: a.color }}>
                <Icon name={a.icon} size={16} />
              </span>
              <span className="flex-1 text-[14px]">{a.name}</span>
              <IconButton label="Subir" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-20">
                <ChevronUp size={15} />
              </IconButton>
              <IconButton label="Bajar" onClick={() => move(i, 1)} disabled={i === areas.length - 1} className="disabled:opacity-20">
                <ChevronDown size={15} />
              </IconButton>
              <IconButton label="Editar" onClick={() => setEditing(a)}>
                <Pencil size={14} />
              </IconButton>
              <IconButton
                label="Eliminar"
                className="hover:text-danger"
                onClick={async () => {
                  if (!confirm(`¿Eliminar el área "${a.name}"? Sus tareas y proyectos se conservan sin área.`)) return
                  await deleteArea(a.id)
                }}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setUI({ creating: 'area' })}
            className="flex w-full items-center gap-3 px-4 py-3 text-[14px] text-muted transition-colors hover:text-accent"
          >
            <Plus size={16} /> Nueva área
          </button>
        </Card>
      </Block>

      <Block
        title="Tus datos"
        desc="Exporta una copia en un archivo cuando quieras tener un respaldo extra. Importar una copia sustituye todos los datos (y, con sesión iniciada, también los de tu cuenta)."
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadBackup()}>
            <Download size={15} /> Exportar copia
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Importar copia
          </Button>
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
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('¿Borrar TODOS los datos? Con sesión iniciada se borran también de tu cuenta y del resto de dispositivos. No se puede deshacer: exporta una copia antes si la necesitas.')) return
              await wipeData()
              await seedIfEmpty()
              toast('Datos borrados')
            }}
          >
            <Trash2 size={15} /> Borrar todo
          </Button>
        </div>
      </Block>

      <Block title="Teclado">
        <Button onClick={() => ui.help()}>
          <Keyboard size={15} /> Ver atajos de teclado
        </Button>
      </Block>

      <p className="text-[12px] text-faint">NTab v{__APP_VERSION__} · Hecho a medida para organizar tu vida.</p>

      <AreaForm open={creatingArea} onClose={() => setUI({ creating: null })} />
      <AreaForm area={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

import { useEffect, useState } from 'react'
import { CalendarRange, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/sync/supabase'
import { useSync } from '@/sync/service'
import { refreshEvents, useEvents } from '@/lib/calendarEvents'
import { addDaysYmd, today } from '@/lib/dates'
import { toast } from '@/app/store'
import { Button, Field, Input, Modal, ModalHeader } from '@/components/ui'
import { LinkRow, LinkSection } from './LinkSection'

interface Source {
  id: string
  name: string
  url: string
}

const HOWTO = [
  {
    name: 'Google Calendar',
    steps: 'En el ordenador: Configuración (⚙︎) → elige el calendario → «Integrar el calendario» → copia la «Dirección secreta en formato iCal».',
  },
  {
    name: 'iCloud (Calendario de Apple)',
    steps: 'En el iPhone: Calendario → Calendarios → ⓘ junto al calendario → activa «Calendario público» → Compartir enlace → Copiar.',
  },
  {
    name: 'Outlook',
    steps: 'En outlook.com: Configuración → Calendario → Calendarios compartidos → Publicar un calendario → «Puede ver todos los detalles» → copia el enlace ICS.',
  },
]

/** Calendarios externos que NTab muestra junto a tus tareas (solo lectura) */
export function CalendarSourcesBlock() {
  const sync = useSync()
  const [sources, setSources] = useState<Source[] | null>(null)
  const [adding, setAdding] = useState(false)
  const t = today()
  const { errors } = useEvents(t, addDaysYmd(t, 6))

  const load = async () => {
    const { data } = await supabase.from('calendar_sources').select('id,name,url').order('created_at')
    setSources((data as Source[] | null) ?? [])
  }
  useEffect(() => {
    if (sync.user) void load()
  }, [sync.user])

  if (!sync.user) return null

  const remove = async (s: Source) => {
    if (!window.confirm(`¿Dejar de ver «${s.name}» en NTab? El calendario original no se toca.`)) return
    await supabase.from('calendar_sources').delete().eq('id', s.id)
    await load()
    refreshEvents()
  }

  return (
    <>
      <LinkSection
        title="Tus calendarios"
        footer="Tus reuniones y citas aparecen en la Agenda de Hoy, en el Calendario y al planificar el día. Solo lectura: se editan en su app. La dirección es privada; se guarda en tu cuenta de NTab."
      >
        {(sources ?? []).map((s) => {
          const err = errors.find((e) => e.sourceId === s.id)
          return (
            <div key={s.id} className="flex min-h-12 items-center gap-3 px-4 py-2 [&+&]:shadow-[inset_0_1px_0_var(--c-border)]">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill text-fg">
                <CalendarRange size={15} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{s.name}</span>
                <span className="block truncate text-[13px] text-muted">{err ? `No se pudo leer: ${err.error}` : hostOf(s.url)}</span>
              </span>
              <button type="button" aria-label={`Quitar ${s.name}`} onClick={() => void remove(s)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg">
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}
        <LinkRow
          icon={<Plus size={15} strokeWidth={2.6} />}
          onClick={() => setAdding(true)}
          label={sources?.length ? 'Añadir otro calendario' : 'Conectar un calendario'}
          detail={sources?.length ? undefined : 'Google, iCloud, Outlook… para ver tus reuniones junto a tus tareas'}
          primary
        />
      </LinkSection>
      <AddSource
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={async () => {
          await load()
          refreshEvents()
        }}
      />
    </>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url.replace(/^webcals?:/i, 'https:')).hostname
  } catch {
    return url
  }
}

function AddSource({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = name.trim() && /^(https?|webcals?):\/\/\S+$/i.test(url.trim())

  const save = async () => {
    if (!valid) return
    setBusy(true)
    const { error } = await supabase.from('calendar_sources').insert({ name: name.trim(), url: url.trim() })
    setBusy(false)
    if (error) return void toast(`No se pudo guardar: ${error.message}`)
    await onAdded()
    toast(`«${name.trim()}» conectado`)
    setName('')
    setUrl('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} position="center">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <ModalHeader title="Conectar un calendario" onClose={onClose} />
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 pb-2">
          <Field label="Nombre">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Trabajo, Personal, Familia…" />
          </Field>
          <Field label="Dirección del calendario (.ics)">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" inputMode="url" />
          </Field>
          <div className="space-y-3 rounded-xl bg-fill-2 p-3.5">
            {HOWTO.map((h) => (
              <p key={h.name} className="text-[13px] leading-snug text-muted">
                <b className="font-semibold text-fg">{h.name}:</b> {h.steps}
              </p>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pt-3 pb-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            {busy ? 'Conectando…' : 'Conectar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

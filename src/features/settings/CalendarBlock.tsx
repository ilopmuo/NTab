import { useEffect, useState } from 'react'
import { CalendarPlus, Copy, RefreshCw } from 'lucide-react'
import { SUPABASE_URL, supabase } from '@/sync/supabase'
import { useSync } from '@/sync/service'
import { toast } from '@/app/store'
import { Group, cx } from '@/components/ui'

interface Feed {
  token: string
}

const feedUrl = (token: string) => `${SUPABASE_URL}/functions/v1/calendar?token=${token}`
const appUrl = () => `${window.location.origin}${window.location.pathname}`
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

const rowCls = 'flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[15px] transition-colors hover:bg-hover'
const Glyph = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill text-fg">{children}</span>
)

/** Calendario suscribible: tareas con fecha, pagos y cumpleaños en el calendario del sistema */
export function CalendarBlock() {
  const sync = useSync()
  const [feed, setFeed] = useState<Feed | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sync.user) return
    void supabase
      .from('calendar_feeds')
      .select('token')
      .maybeSingle()
      .then(({ data, error }) => setFeed(error ? null : ((data as Feed | null) ?? null)))
  }, [sync.user])

  if (!sync.user) return null

  const create = async () => {
    setBusy(true)
    const { data, error } = await supabase
      .from('calendar_feeds')
      .upsert({ user_id: sync.user!.id, tz: tz(), app_url: appUrl() }, { onConflict: 'user_id' })
      .select('token')
      .single()
    setBusy(false)
    if (error) return toast(`No se pudo crear el enlace: ${error.message}`)
    setFeed(data as Feed)
  }

  const regenerate = async () => {
    if (!window.confirm('El enlace actual dejará de funcionar y tendrás que volver a suscribirte en tus calendarios. ¿Cambiarlo?')) return
    setBusy(true)
    await supabase.from('calendar_feeds').delete().eq('user_id', sync.user!.id)
    setBusy(false)
    await create()
    toast('Enlace cambiado')
  }

  const copy = async () => {
    if (!feed) return
    try {
      await navigator.clipboard.writeText(feedUrl(feed.token))
      toast('Enlace copiado')
    } catch {
      window.prompt('Copia el enlace:', feedUrl(feed.token))
    }
  }

  return (
    <section className="mb-8">
      <h2 className="mb-2 px-4 text-[13px] font-medium tracking-wide text-muted uppercase">Calendario</h2>
      <Group>
        {feed ? (
          <>
            <a href={feedUrl(feed.token).replace(/^https?:/, 'webcal:')} className={rowCls}>
              <Glyph>
                <CalendarPlus size={15} strokeWidth={2.4} />
              </Glyph>
              <span className="min-w-0 flex-1">
                <span className="text-blue">Añadir a Calendario</span>
                <span className="block text-[13px] text-muted">iPhone, iPad y Mac: se abre Calendario para suscribirte</span>
              </span>
            </a>
            <button type="button" onClick={() => void copy()} className={cx(rowCls, 'shadow-[inset_0_1px_0_var(--c-border)]')}>
              <Glyph>
                <Copy size={15} strokeWidth={2.4} />
              </Glyph>
              <span className="min-w-0 flex-1">
                Copiar enlace
                <span className="block text-[13px] text-muted">Google Calendar: Otros calendarios → + → Desde URL</span>
              </span>
            </button>
            <button type="button" disabled={busy} onClick={() => void regenerate()} className={cx(rowCls, 'shadow-[inset_0_1px_0_var(--c-border)]')}>
              <Glyph>
                <RefreshCw size={15} strokeWidth={2.4} />
              </Glyph>
              <span className="min-w-0 flex-1">Cambiar enlace</span>
            </button>
          </>
        ) : (
          <button type="button" disabled={busy || feed === undefined} onClick={() => void create()} className={rowCls}>
            <Glyph>
              <CalendarPlus size={15} strokeWidth={2.4} />
            </Glyph>
            <span className="min-w-0 flex-1">
              <span className="text-blue">{busy ? 'Creando enlace…' : 'Ver NTab en tu calendario'}</span>
              <span className="block text-[13px] text-muted">Tareas con fecha, pagos y cumpleaños en Calendario, Google u Outlook</span>
            </span>
          </button>
        )}
      </Group>
      <p className="mt-2 px-4 text-[13px] leading-snug text-muted">
        {feed
          ? 'Se actualiza sola cada pocos minutos (Google puede tardar horas). Quien tenga el enlace ve tus tareas: no lo compartas y, si lo haces, cámbialo.'
          : 'Solo lectura: las tareas se siguen creando y completando en NTab.'}
      </p>
    </section>
  )
}

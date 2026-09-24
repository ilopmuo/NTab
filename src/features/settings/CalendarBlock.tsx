import { useState } from 'react'
import { CalendarPlus, CalendarSync, Copy, RefreshCw } from 'lucide-react'
import { SUPABASE_URL } from '@/sync/supabase'
import { LinkRow, LinkSection } from './LinkSection'
import { copyText, deviceTz, useSecretLink } from './secretLink'
import { GoogleCalendarSheet } from './GoogleCalendarSheet'

const feedUrl = (token: string) => `${SUPABASE_URL}/functions/v1/calendar?token=${token}`

/** Calendario suscribible: tareas con fecha, pagos y cumpleaños en el calendario del sistema */
export function CalendarBlock() {
  const [google, setGoogle] = useState(false)
  const link = useSecretLink('calendar_feeds', () => ({ tz: deviceTz(), app_url: `${window.location.origin}${window.location.pathname}` }))
  if (!link.signedIn) return null
  const { token, busy } = link
  return (
    <LinkSection
      title="Calendario"
      footer={
        token
          ? 'Calendario de Apple se pone al día solo cada pocos minutos; para Google, usa «Google Calendar». Quien tenga el enlace ve tus tareas: no lo compartas y, si lo haces, cámbialo.'
          : 'Solo lectura: las tareas se siguen creando y completando en NTab.'
      }
    >
      {token ? (
        <>
          <LinkRow icon={<CalendarPlus size={15} strokeWidth={2.4} />} href={feedUrl(token).replace(/^https?:/, 'webcal:')} label="Añadir a Calendario" detail="iPhone, iPad y Mac: se abre Calendario para suscribirte" primary />
          <LinkRow
            icon={<CalendarSync size={15} strokeWidth={2.4} />}
            onClick={() => setGoogle(true)}
            label="Google Calendar"
            detail="Al día cada 5 minutos, también lo que borras"
            primary
          />
          <LinkRow icon={<Copy size={15} strokeWidth={2.4} />} onClick={() => void copyText(feedUrl(token))} label="Copiar enlace" detail="Outlook u otras apps de calendario" />
          <LinkRow
            icon={<RefreshCw size={15} strokeWidth={2.4} />}
            disabled={busy}
            onClick={() => void link.regenerate('El enlace actual dejará de funcionar y tendrás que volver a suscribirte en tus calendarios. ¿Cambiarlo?')}
            label="Cambiar enlace"
          />
          <GoogleCalendarSheet jsonUrl={`${feedUrl(token)}&format=json`} open={google} onClose={() => setGoogle(false)} />
        </>
      ) : (
        <LinkRow
          icon={<CalendarPlus size={15} strokeWidth={2.4} />}
          disabled={busy || token === undefined}
          onClick={() => void link.create()}
          label={busy ? 'Creando enlace…' : 'Ver NTab en tu calendario'}
          detail="Tareas con fecha, pagos y cumpleaños en Calendario, Google u Outlook"
          primary
        />
      )}
    </LinkSection>
  )
}

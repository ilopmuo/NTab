import { useState } from 'react'
import { Copy, ListChecks, Mic, RefreshCw } from 'lucide-react'
import { SUPABASE_URL } from '@/sync/supabase'
import { Button, Modal, ModalHeader } from '@/components/ui'
import { LinkRow, LinkSection } from './LinkSection'
import { copyText, deviceTz, useSecretLink } from './secretLink'

export const captureUrl = (token: string) => `${SUPABASE_URL}/functions/v1/capture/${token}`

const b = (t: string) => <b className="font-semibold">{t}</b>

const STEPS = [
  <>Copia la URL de captura (botón de abajo).</>,
  <>
    Abre la app {b('Atajos')} y pulsa {b('+')}. Ponle de nombre {b('Apunta en NTab')}: será lo que le digas a Siri.
  </>,
  <>
    Toca {b('ⓘ')} (detalles) y activa {b('Mostrar en la hoja de compartir')}. Arriba aparece «Recibir… de Hoja de compartir»: elige {b('Texto')} y {b('URL')}, y en «Si no hay entrada» elige {b('Solicitar')} (Siri te preguntará qué apuntar).
  </>,
  <>
    Añade la acción {b('Obtener contenido de URL')}. Pega la URL, pon el método {b('POST')}, cuerpo {b('JSON')} y un campo de texto con clave {b('text')} y valor {b('Entrada del atajo')}.
  </>,
  <>Añade {b('Mostrar resultado')} con el {b('Contenido de URL')}: te confirmará qué ha apuntado.</>,
]

/** Captura desde fuera de la app: Siri y la hoja de compartir de iOS */
export function SiriBlock() {
  const [help, setHelp] = useState(false)
  const link = useSecretLink('capture_keys', () => ({ tz: deviceTz() }))
  if (!link.signedIn) return null
  const { token, busy } = link
  return (
    <>
      <LinkSection
        title="Siri y Atajos"
        footer={
          token
            ? '«Oye Siri, apunta en NTab» → «llamar al banco mañana a las 10». También desde Compartir en cualquier app (un texto, una lista, un enlace). La URL solo permite añadir tareas; si se te escapa, cámbiala.'
            : 'Apunta tareas con la voz o desde el botón Compartir de cualquier app, sin abrir NTab. Entiende lo mismo que la captura rápida: fechas, horas, #etiquetas y +proyectos.'
        }
      >
        {token ? (
          <>
            <LinkRow icon={<ListChecks size={15} strokeWidth={2.4} />} onClick={() => setHelp(true)} label="Cómo crear el Atajo" detail="5 pasos, una sola vez" primary />
            <LinkRow icon={<Copy size={15} strokeWidth={2.4} />} onClick={() => void copyText(captureUrl(token), 'URL de captura copiada')} label="Copiar URL de captura" />
            <LinkRow
              icon={<RefreshCw size={15} strokeWidth={2.4} />}
              disabled={busy}
              onClick={() => void link.regenerate('La URL actual dejará de funcionar y tendrás que ponerla de nuevo en el Atajo. ¿Cambiarla?')}
              label="Cambiar URL"
            />
          </>
        ) : (
          <LinkRow
            icon={<Mic size={15} strokeWidth={2.4} />}
            disabled={busy || token === undefined}
            onClick={() => void link.create().then(() => setHelp(true))}
            label={busy ? 'Creando…' : 'Apuntar con Siri'}
            detail="Y desde Compartir en cualquier app"
            primary
          />
        )}
      </LinkSection>
      <Modal open={help && !!token} onClose={() => setHelp(false)} position="center">
        <ModalHeader title="Atajo «Apunta en NTab»" onClose={() => setHelp(false)} />
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 pb-5">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug">
                <span className="font-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill text-[13px] font-bold">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          {token && (
            <Button variant="primary" onClick={() => void copyText(captureUrl(token), 'URL de captura copiada')}>
              <Copy size={15} /> Copiar URL de captura
            </Button>
          )}
          <p className="text-[13px] leading-snug text-muted">
            Pruébalo: «Oye Siri, apunta en NTab», y dicta «pagar la luz el viernes !alta». En un Mac, el mismo Atajo funciona desde la barra de menús o con un
            atajo de teclado.
          </p>
        </div>
      </Modal>
    </>
  )
}

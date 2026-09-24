import { Copy, ExternalLink } from 'lucide-react'
import { Button, Modal, ModalHeader } from '@/components/ui'
import { copyText } from './secretLink'
import { googleScript } from './googleScript'

const STEPS = [
  <>
    Abre <b className="font-semibold">script.google.com</b> con tu cuenta de Google y pulsa <b className="font-semibold">Nuevo proyecto</b>.
  </>,
  <>Borra lo que haya en el editor y pega el script (ya lleva tu enlace).</>,
  <>
    Guarda (💾), elige la función <b className="font-semibold">instalar</b> en la barra de arriba y pulsa <b className="font-semibold">▶ Ejecutar</b>.
  </>,
  <>
    Acepta los permisos. Google avisará de que la app no está verificada: es tu propio script, así que pulsa{' '}
    <b className="font-semibold">Configuración avanzada → Ir a…</b>
  </>,
  <>
    Si ya te habías suscrito con el enlace en Google Calendar, quita esa suscripción (el calendario «NTab» de <i>Otros calendarios</i> →
    Anular suscripción) para no ver todo repetido.
  </>,
]

/** Pasos para tener NTab en Google Calendar con cambios y borrados en 5 minutos */
export function GoogleCalendarSheet({ jsonUrl, open, onClose }: { jsonUrl: string; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      <ModalHeader title="Google Calendar" onClose={onClose} />
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 pb-5">
        <p className="text-[15px] leading-relaxed text-muted">
          Google tarda horas en refrescar los calendarios suscritos, así que lo que borras en NTab sigue ahí. Con este pequeño script en tu cuenta de
          Google, el calendario <b className="font-semibold text-fg">NTab</b> se pone al día cada 5 minutos: crea, cambia y borra.
        </p>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-snug">
              <span className="font-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill text-[13px] font-bold">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" onClick={() => void copyText(googleScript(jsonUrl), 'Script copiado')}>
            <Copy size={15} /> Copiar script
          </Button>
          <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">
            <Button type="button">
              <ExternalLink size={15} /> Abrir Google Apps Script
            </Button>
          </a>
        </div>
        <p className="text-[13px] leading-snug text-muted">
          Solo lectura: las tareas se siguen creando y completando en NTab. Para pararlo, en el script ejecuta <b className="font-semibold">desinstalar</b>.
        </p>
      </div>
    </Modal>
  )
}

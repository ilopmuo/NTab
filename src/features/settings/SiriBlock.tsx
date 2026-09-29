import { Copy, Mic, RefreshCw } from 'lucide-react'
import { LinkRow, LinkSection } from './LinkSection'
import { connectorUrl } from './ClaudeBlock'
import { copyText, deviceTz, useSecretLink } from './secretLink'

export const captureUrl = (token: string) => `${connectorUrl(token)}/capturar`

/**
 * Apuntar con Siri sin abrir la app: un atajo del iPhone manda lo que dictas
 * al servidor (Edge Function mcp, ruta /capturar), que lo entiende como la
 * captura rápida y lo guarda. Usa la misma URL privada que el conector de Claude.
 */
export function SiriBlock() {
  const link = useSecretLink('mcp_connectors', () => ({ tz: deviceTz() }))
  if (!link.signedIn) return null
  const { token, busy } = link
  return (
    <LinkSection
      title="Siri"
      footer={
        token ? (
          <>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Copia la URL de captura.</li>
              <li>
                En la app <b className="font-semibold text-fg">Atajos</b>, crea uno nuevo con tres acciones: <b className="font-semibold text-fg">Dictar texto</b>;{' '}
                <b className="font-semibold text-fg">Obtener contenido de URL</b> (pega la URL, método POST, cuerpo JSON con el campo <code>texto</code> = Texto dictado);
                y <b className="font-semibold text-fg">Mostrar resultado</b>.
              </li>
              <li>
                Llámalo «Apunta en NTab». Ya puedes decir: <i>«Oye Siri, apunta en NTab»</i> y dictar, por ejemplo:
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>«llamar al dentista mañana a las 10» o «sacar la ropa dentro de una hora» (tarea)</li>
                  <li>«compra: leche y pan» (lista de la compra) · «gasto 12 café» (gastos)</li>
                  <li>«nota: el código del portal es 4512» (notas) · «hecho: cambiar las sábanas» (última vez)</li>
                  <li>«+1 agua» o el nombre de un hábito, como «meditar» (hábitos)</li>
                </ul>
                Siri te lee lo que ha apuntado.
              </li>
            </ol>
            <p className="mt-2">Es la misma URL privada que la del conector de Claude: si la cambias, cambia en los dos sitios.</p>
          </>
        ) : (
          'Apunta tareas, compra y gastos diciéndoselo a Siri, sin abrir NTab. Se entiende igual que la captura rápida: fechas, horas, avisos, #etiquetas y +listas.'
        )
      }
    >
      {token ? (
        <>
          <LinkRow icon={<Copy size={15} strokeWidth={2.4} />} onClick={() => void copyText(captureUrl(token), 'URL de captura copiada')} label="Copiar URL de captura" primary />
          <LinkRow
            icon={<RefreshCw size={15} strokeWidth={2.4} />}
            disabled={busy}
            onClick={() => void link.regenerate('La URL actual dejará de funcionar en tu atajo de Siri y en el conector de Claude. ¿Cambiarla?')}
            label="Cambiar URL"
          />
        </>
      ) : (
        <LinkRow
          icon={<Mic size={15} strokeWidth={2.4} />}
          disabled={busy || token === undefined}
          onClick={() => void link.create()}
          label={busy ? 'Creando enlace…' : 'Apuntar con Siri'}
          detail="Crea tu URL privada para el atajo"
          primary
        />
      )}
    </LinkSection>
  )
}

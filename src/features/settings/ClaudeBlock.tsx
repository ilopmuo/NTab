import { Copy, ExternalLink, RefreshCw, Sparkles } from 'lucide-react'
import { SUPABASE_URL } from '@/sync/supabase'
import { LinkRow, LinkSection } from './LinkSection'
import { copyText, deviceTz, useSecretLink } from './secretLink'

export const connectorUrl = (token: string) => `${SUPABASE_URL}/functions/v1/mcp/${token}`

/**
 * Conector de NTab para Claude (MCP): con él, Claude lee y cambia tus tareas
 * desde su app o su web, usando tu suscripción de Claude (sin claves de API).
 */
export function ClaudeBlock() {
  const link = useSecretLink('mcp_connectors', () => ({ tz: deviceTz() }))
  if (!link.signedIn) return null
  const { token, busy } = link
  return (
    <LinkSection
      title="Claude"
      footer={
        token ? (
          <>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Copia la URL del conector.</li>
              <li>
                En Claude (web o escritorio): <b className="font-semibold text-fg">Ajustes → Conectores → Añadir conector personalizado</b>. Nombre: NTab. Pega la URL.
              </li>
              <li>Listo, también en la app del iPhone. Prueba: «¿Qué tengo hoy en NTab?» o «Apunta en NTab lo de este email».</li>
            </ol>
            <p className="mt-2">Quien tenga la URL puede ver y cambiar tus tareas: no la compartas y, si lo haces, cámbiala.</p>
          </>
        ) : (
          'Habla con NTab desde Claude con tu suscripción: pregúntale por tu semana, que te planifique el día o que convierta un email en tareas. Los cambios aparecen aquí al momento.'
        )
      }
    >
      {token ? (
        <>
          <LinkRow icon={<Copy size={15} strokeWidth={2.4} />} onClick={() => void copyText(connectorUrl(token), 'URL del conector copiada')} label="Copiar URL del conector" primary />
          <LinkRow icon={<ExternalLink size={15} strokeWidth={2.4} />} href="https://claude.ai/settings/connectors" external label="Abrir conectores de Claude" />
          <LinkRow
            icon={<RefreshCw size={15} strokeWidth={2.4} />}
            disabled={busy}
            onClick={() => void link.regenerate('La URL actual dejará de funcionar y tendrás que volver a añadir el conector en Claude. ¿Cambiarla?')}
            label="Cambiar URL"
          />
        </>
      ) : (
        <LinkRow
          icon={<Sparkles size={15} strokeWidth={2.4} />}
          disabled={busy || token === undefined}
          onClick={() => void link.create()}
          label={busy ? 'Creando conector…' : 'Conectar NTab con Claude'}
          detail="Usa tu suscripción de Claude, sin claves de API"
          primary
        />
      )}
    </LinkSection>
  )
}

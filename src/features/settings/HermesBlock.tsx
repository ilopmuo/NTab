import { BookOpen, Copy, Download, Sparkles } from 'lucide-react'
import { hermesConfig } from '@/lib/hermes'
import { toast } from '@/app/store'
import skill from '../../../hermes/luno/SKILL.md?raw'
import { LinkRow, LinkSection } from './LinkSection'
import { connectorUrl } from './ClaudeBlock'
import { copyText, deviceTz, useSecretLink } from './secretLink'

const b = (s: string) => <b className="font-semibold text-fg">{s}</b>
const code = (s: string) => <code className="rounded bg-fill px-1 py-0.5 text-[12.5px]">{s}</code>

function downloadSkill() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([skill], { type: 'text/markdown' }))
  a.download = 'SKILL.md'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  toast('Skill de LUNO descargada: guárdala en ~/.hermes/skills/luno/')
}

/**
 * LUNO en Hermes: el agente que está siempre encendido y te escribe por
 * Telegram o WhatsApp. Con la misma URL privada que Claude, Hermes lee y
 * cambia tus cosas, y con la skill sabe cuándo usar cada herramienta y puede
 * mandarte los buenos días, recordarte las pastillas o cerrar el día contigo.
 */
export function HermesBlock() {
  const link = useSecretLink('mcp_connectors', () => ({ tz: deviceTz() }))
  if (!link.signedIn) return null
  const { token, busy } = link
  return (
    <LinkSection
      title="Hermes"
      footer={
        token ? (
          <>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Copia la configuración y pégala en {code('~/.hermes/config.yaml')} (si ya tienes {code('mcp_servers:')}, añade solo el bloque {code('luno')}).
              </li>
              <li>
                Descarga la skill y guárdala como {code('~/.hermes/skills/luno/SKILL.md')}.
              </li>
              <li>
                En Hermes, escribe {code('/reload-mcp')} (o reinícialo). Prueba: {b('«¿Qué tengo hoy en LUNO?»')}
              </li>
              <li>
                Y lo mejor: pídele que esté pendiente. {b('«Cada día a las 8 mándame los buenos días de LUNO»')}, {b('«a las 21:30 cerramos el día»')} o{' '}
                {b('«los domingos a las 7 hacemos la revisión semanal»')}. Lo que le cuentes por Telegram o WhatsApp acaba en LUNO.
              </li>
            </ol>
            <p className="mt-2">Es la misma URL privada que la de Claude y Siri: si la cambias, cámbiala también en Hermes.</p>
          </>
        ) : (
          'Hermes es un asistente que está siempre encendido y te escribe por Telegram o WhatsApp. Conectado a LUNO, te da los buenos días con lo importante, te recuerda las pastillas, cierra el día contigo y apunta lo que le cuentes desde cualquier chat.'
        )
      }
    >
      {token ? (
        <>
          <LinkRow icon={<Copy size={15} strokeWidth={2.4} />} onClick={() => void copyText(hermesConfig(connectorUrl(token)), 'Configuración de Hermes copiada')} label="Copiar configuración de Hermes" primary />
          <LinkRow icon={<Download size={15} strokeWidth={2.4} />} onClick={downloadSkill} label="Descargar la skill de LUNO" detail="Le explica a Hermes qué hacer en cada caso" />
          <LinkRow icon={<BookOpen size={15} strokeWidth={2.4} />} href="https://hermes-agent.nousresearch.com/docs/" external label="Guía de Hermes" />
        </>
      ) : (
        <LinkRow
          icon={<Sparkles size={15} strokeWidth={2.4} />}
          disabled={busy || token === undefined}
          onClick={() => void link.create()}
          label={busy ? 'Creando enlace…' : 'Conectar LUNO con Hermes'}
          detail="Crea tu URL privada para Hermes"
          primary
        />
      )}
    </LinkSection>
  )
}

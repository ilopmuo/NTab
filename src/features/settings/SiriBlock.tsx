import { useEffect, useState } from 'react'
import { Copy, Mic, Play, RefreshCw } from 'lucide-react'
import { getSupabase } from '@/sync/client'
import { LinkRow, LinkSection } from './LinkSection'
import { connectorUrl } from './ClaudeBlock'
import { copyText, deviceTz, useSecretLink } from './secretLink'

export const captureUrl = (token: string) => `${connectorUrl(token)}/capturar`

/** «hace 2 min», «hace 3 h», «el 3 de octubre» */
function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  return `el ${new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
}

const b = (s: string) => <b className="font-semibold text-fg">{s}</b>

/**
 * Siri sin abrir la app: un solo atajo, «LUNO», manda lo que dictas (o lo que
 * compartes desde otra app) al servidor (Edge Function mcp, ruta /capturar),
 * que lo entiende como la captura rápida, hace lo que pides o responde.
 * Usa la misma URL privada que el conector de Claude.
 */
export function SiriBlock() {
  const link = useSecretLink('mcp_connectors', () => ({ tz: deviceTz() }))
  const { token, busy } = link
  // Cuándo se usó la URL por última vez (Siri o Claude): así se sabe si el atajo funciona
  const [lastUsed, setLastUsed] = useState<string | null | undefined>(undefined)
  const [probe, setProbe] = useState<{ busy?: boolean; ok?: boolean; text?: string } | null>(null)
  const refresh = () =>
    void getSupabase().then((s) =>
      s
        .from('mcp_connectors')
        .select('last_used_at')
        .maybeSingle()
        .then(({ data }) => setLastUsed((data as { last_used_at: string | null } | null)?.last_used_at ?? null)),
    )
  useEffect(() => {
    if (token) refresh()
  }, [token])
  if (!link.signedIn) return null

  // Pregunta a la URL lo mismo que a Siri: no apunta nada y dice si todo está bien
  const test = async () => {
    if (!token) return
    setProbe({ busy: true })
    try {
      const res = await fetch(captureUrl(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: '¿Qué tengo hoy?' }) })
      setProbe({ ok: res.ok, text: await res.text() })
      refresh()
    } catch {
      setProbe({ ok: false, text: 'No he podido llegar a LUNO. ¿Hay conexión?' })
    }
  }

  return (
    <LinkSection
      title="Siri"
      footer={
        token ? (
          <>
            {probe && !probe.busy && (
              <p className="mb-3 rounded-xl bg-fill-2 px-3 py-2 text-[13.5px] text-fg" role="status">
                {probe.ok ? <>Funciona. Siri diría: «{probe.text}»</> : probe.text}
              </p>
            )}
            <p className="font-semibold text-fg">Un atajo para todo: «LUNO»</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Copia la URL de captura.</li>
              <li>
                En la app {b('Atajos')}, crea uno nuevo y llámalo «LUNO». En sus detalles (ⓘ), activa {b('Mostrar en la hoja de compartir')}.
              </li>
              <li>
                Con tres acciones: {b('Si')} la Entrada del atajo {b('no tiene ningún valor')}, {b('Dictar texto')} (y si tiene, {b('Texto')} con la Entrada del atajo);{' '}
                {b('Obtener contenido de URL')} (pega la URL, método POST, cuerpo JSON con el campo <code>texto</code> = el resultado del Si); y {b('Mostrar resultado')}.
              </li>
              <li>
                Di <i>«Oye Siri, LUNO»</i> y lo que quieras. Desde Safari o cualquier app, <i>Compartir → LUNO</i> apunta el enlace con el título de la página. Siri te lee la respuesta.
              </li>
            </ol>
            <p className="mt-3 font-semibold text-fg">Qué le puedes decir</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                <b className="font-semibold text-fg">Apuntar</b>: «llamar al dentista mañana a las 10», «compra leche y pan», «añade ibuprofeno a la lista de la farmacia», «piso: papel higiénico»,
                «me he gastado 15 en Mercadona», «nota: el código del portal es 4512», «+1 agua», «tomada: ibuprofeno», «he dejado las llaves en el cajón», «presupuesto del fontanero
                esperando a Luis».
              </li>
              <li>
                <b className="font-semibold text-fg">Hacer</b>: «he llamado al dentista» (la marca como hecha; si no es una tarea, el hábito o «última vez»), «pospón el dentista a mañana» o
                «deshaz» (quita lo último que has dictado).
              </li>
              <li>
                <b className="font-semibold text-fg">Preguntar</b>: «¿qué tengo hoy?» (también lo de tus calendarios), «¿qué hago ahora?», «¿dónde está el pasaporte?», «¿qué falta en la
                compra?», «¿cuánto llevo gastado?», «¿cuándo cambié las sábanas?».
              </li>
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold text-fg">Más: gastos de un tirón y cada pago con Apple Pay</summary>
              <p className="mt-2">
                Otro atajo igual, «Mete un gasto», con el campo <code>gasto</code> en vez de <code>texto</code>: <i>«Oye Siri, mete un gasto»</i> y luego <i>«quince euros en Mercadona»</i>.
                Entiende los importes con cifras o con palabras («doce con cincuenta») y pone la categoría sola.
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>
                  En {b('Atajos → Automatización')}, crea una nueva de tipo {b('Transacción')} (iOS 17 o posterior), elige tus tarjetas y marca {b('Ejecutar inmediatamente')}.
                </li>
                <li>
                  Añade {b('Obtener contenido de URL')} con la URL de captura, método POST y cuerpo JSON con <code>importe</code> = Importe y <code>comercio</code> = Comerciante (las variables de la
                  transacción). Si quieres verlo, añade {b('Mostrar notificación')} con el resultado.
                </li>
                <li>
                  En Ajustes del iPhone → Datos móviles, deja activada {b('Cartera')}: sin datos, la automatización falla fuera de casa.
                </li>
              </ol>
              <p className="mt-1">
                Solo llegan los pagos con el iPhone o el reloj; lo que pagues con la tarjeta de plástico o por domiciliación, díselo a Siri. Las devoluciones no se apuntan. Lanzada a mano
                no apunta nada: para probarla, cambia un momento las variables por un importe fijo (1,50) y un comercio (Prueba).
              </p>
            </details>
            <p className="mt-2">Es la misma URL privada que la del conector de Claude: si la cambias, cambia en los dos sitios. Si ya tenías el atajo «Apunta en LUNO», sigue funcionando.</p>
          </>
        ) : (
          'Apunta tareas, compra y gastos diciéndoselo a Siri, sin abrir LUNO; márcalas como hechas, pospónlas o pregúntale qué tienes hoy, y cada pago con Apple Pay en Gastos sin hacer nada. Se entiende igual que la captura rápida: fechas, horas, avisos, #etiquetas y +listas.'
        )
      }
    >
      {token ? (
        <>
          <LinkRow icon={<Copy size={15} strokeWidth={2.4} />} onClick={() => void copyText(captureUrl(token), 'URL de captura copiada')} label="Copiar URL de captura" primary />
          <LinkRow
            icon={<Play size={15} strokeWidth={2.4} />}
            disabled={probe?.busy}
            onClick={() => void test()}
            label={probe?.busy ? 'Probando…' : 'Probar ahora'}
            detail={lastUsed ? `Último uso: ${ago(lastUsed)}` : lastUsed === null ? 'Aún no se ha usado' : undefined}
          />
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

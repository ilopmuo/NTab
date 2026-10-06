import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { Button, cx } from '@/components/ui'

/**
 * Si algo falla al pintar, React desmonta todo lo que cuelga del fallo hasta el
 * límite más cercano. Sin límites, la ventana entera se quedaba en blanco (ni
 * barra lateral para salir). Con ellos, lo que falla es solo esa pantalla (o
 * ese panel), se ve el error y se puede reintentar o ir a otra.
 */

/** Lo que ha fallado, para verlo y copiarlo */
export interface Crash {
  message: string
  details: string
  /** No llegó el código: reintentar no sirve, hay que recargar */
  stale: boolean
}

/** El último fallo, por si hay que mirarlo después */
const KEY = 'ntab-last-crash'

function record(error: unknown, info: ErrorInfo, where: string): Crash {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const path = window.location.hash.replace(/^#/, '') || '/today'
  const details = [
    message,
    `${where} · ${path} · v${__APP_VERSION__} · ${new Date().toISOString()}`,
    navigator.userAgent,
    error instanceof Error && error.stack ? error.stack : '',
    info.componentStack ? `Componentes:${info.componentStack}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  try {
    localStorage.setItem(KEY, details)
  } catch {
    /* sin almacenamiento */
  }
  return { message, details, stale: isStaleCode(error) }
}

/** El código de una pantalla no ha llegado: casi siempre, una versión nueva publicada con esta abierta */
const isStaleCode = (e: unknown) =>
  /dynamically imported module|module script failed|error loading dynamically imported|Unable to preload CSS/i.test(e instanceof Error ? e.message : String(e))

/** Recarga para traer la versión nueva, una sola vez (si lo nuevo tampoco llega, no en bucle) */
function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem('ntab-reloaded-at') ?? 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem('ntab-reloaded-at', String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

type Props = {
  /** Dónde está (sale en los detalles) */
  where: string
  /** Al cambiar (otra pantalla, el panel se cierra), se vuelve a intentar */
  resetKey?: unknown
  fallback: (crash: Crash | undefined, retry: () => void) => ReactNode
  children: ReactNode
}
type State = { failed: boolean; crash?: Crash; resetKey?: unknown }

export class Boundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.resetKey) return null
    return { resetKey: props.resetKey, failed: false, crash: undefined }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[${this.props.where}]`, error, info.componentStack)
    if (isStaleCode(error) && reloadForNewVersion()) return
    this.setState({ crash: record(error, info, this.props.where) })
  }

  retry = () => this.setState({ failed: false, crash: undefined })

  render() {
    return this.state.failed ? this.props.fallback(this.state.crash, this.retry) : this.props.children
  }
}

/** Lo que se ve en lugar de lo que ha fallado: qué ha pasado, el error y qué hacer */
function Crashed({ crash, title, hint, action, retry, className }: { crash?: Crash; title: string; hint: string; action: string; retry: () => void; className: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div role="alert" className={cx('flex flex-col items-center px-6 text-center', className)}>
      <h1 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h1>
      <p className="mt-1 max-w-sm text-[14px] leading-snug text-muted">{hint}</p>
      {crash && <code className="mt-4 block max-w-md rounded-xl bg-fill-2 px-3 py-2 text-left text-[12px] break-words text-muted">{crash.message}</code>}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={retry}>
          {action}
        </Button>
        {crash && (
          <Button onClick={() => void navigator.clipboard?.writeText(crash.details).then(() => setCopied(true), () => {})}>
            {copied ? 'Copiado' : 'Copiar detalles'}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Una pantalla que ha fallado: la barra lateral sigue ahí para ir a otra */
export const ScreenCrash = ({ crash, retry }: { crash?: Crash; retry: () => void }) => (
  <Crashed
    crash={crash}
    retry={crash?.stale ? () => window.location.reload() : retry}
    title="Esta pantalla no se ha podido abrir"
    hint="Lo demás sigue funcionando y lo que apuntaste está guardado. Prueba otra vez o ve a otra sección."
    action={crash?.stale ? 'Recargar' : 'Reintentar'}
    className="mx-auto max-w-md pt-24 pb-36"
  />
)

/** La barra lateral o la de pestañas: un aviso pequeño en su sitio */
export const BarCrash = ({ retry, className }: { retry: () => void; className: string }) => (
  <div role="alert" className={cx('glass-thick fixed z-40 flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4 text-[13px]', className)}>
    La navegación ha fallado
    <Button size="sm" onClick={retry}>
      Reintentar
    </Button>
  </div>
)

/** Toda la app: el último recurso */
export const AppCrash = ({ crash }: { crash?: Crash }) => (
  <Crashed
    crash={crash}
    retry={() => window.location.reload()}
    title="LUNO ha tenido un problema"
    hint="Lo que apuntaste está guardado. Al recargar vuelve a estar todo."
    action="Recargar"
    className="fixed inset-0 justify-center bg-bg text-fg"
  />
)

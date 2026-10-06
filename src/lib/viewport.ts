/**
 * El teclado del móvil, sin tropiezos.
 *
 * - Lo que se ve de verdad con el teclado abierto (visualViewport) va a
 *   `--vv-top` y `--vv-height`: las hojas y los diálogos se colocan ahí, encima
 *   del teclado, en vez de quedarse debajo o hacer saltar la página (en el
 *   iPhone el teclado no encoge la página, solo lo que se ve).
 * - Mientras el teclado está abierto, `<html data-keyboard>`: la barra de
 *   pestañas se aparta para dejar sitio a lo que escribes.
 * - `primeKeyboard()`: en el iPhone el teclado solo sale si un campo recibe el
 *   foco en el mismo toque, y la captura o un formulario se montan justo
 *   después. Se enfoca al momento un campo invisible (el teclado sale) y, cuando
 *   llega el de verdad, el foco pasa a él sin que el teclado se esconda.
 */

export function watchViewport() {
  // Safari en el iPhone solo pinta el estado pulsado (:active) si alguien escucha los toques
  document.addEventListener('touchstart', () => {}, { passive: true })
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let frame = 0
  const update = () => {
    frame = 0
    // Con la página ampliada con dos dedos no se toca nada
    if (Math.abs(vv.scale - 1) > 0.01) return
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
    root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`)
    const full = Math.max(window.innerHeight, root.clientHeight)
    // Más de 120 px tapados: es el teclado (no la barra de Safari al encogerse)
    if (full - vv.height - vv.offsetTop > 120) root.dataset.keyboard = 'open'
    else delete root.dataset.keyboard
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  update()
}

let proxy: HTMLInputElement | undefined

export function primeKeyboard() {
  if (typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches) return
  // Si ya se está escribiendo en algo, el teclado ya está fuera
  const active = document.activeElement
  if (active instanceof HTMLElement && active.matches('input, textarea, [contenteditable=true]') && active !== proxy) return
  if (!proxy) {
    proxy = document.createElement('input')
    proxy.type = 'text'
    proxy.tabIndex = -1
    proxy.setAttribute('aria-hidden', 'true')
    proxy.dataset.keyboardProxy = ''
    // 16 px para que el iPhone no acerque la página; arriba, para que no la desplace
    proxy.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none'
  }
  if (!proxy.isConnected) document.body.append(proxy)
  proxy.focus({ preventScroll: true })
  const p = proxy
  // Si nada recoge el foco (se canceló), el teclado se va
  setTimeout(() => document.activeElement === p && p.blur(), 1200)
}

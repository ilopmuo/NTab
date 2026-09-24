/**
 * Toque háptico breve. En Android usa navigator.vibrate; en el iPhone
 * (iOS 18+) no hay API, pero cambiar un interruptor nativo
 * (<input type="checkbox" switch>) produce el toque del sistema, así que se
 * pulsa uno oculto. En el resto no hace nada.
 */
type Kind = 'light' | 'success' | 'warning'

let label: HTMLLabelElement | null = null
const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function appleTap() {
  if (!label) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.id = 'ntab-haptic'
    input.tabIndex = -1
    input.setAttribute('aria-hidden', 'true')
    label = document.createElement('label')
    label.htmlFor = input.id
    label.setAttribute('aria-hidden', 'true')
    for (const el of [input, label]) el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none'
    document.body.append(input, label)
  }
  label.click()
}

export function haptic(kind: Kind = 'light') {
  try {
    if (isApple()) {
      appleTap()
      if (kind !== 'light') setTimeout(appleTap, 110)
      return
    }
    navigator.vibrate?.(kind === 'success' ? [10, 70, 16] : kind === 'warning' ? [24, 50, 24] : 8)
  } catch {
    /* sin háptica */
  }
}

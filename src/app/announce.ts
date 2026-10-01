/**
 * Lee en voz alta un mensaje breve con el lector de pantalla (VoiceOver,
 * TalkBack, NVDA…): avisos, «Deshacer», cambios de pantalla. Usa una región
 * `aria-live` que está siempre en la página (#announcer, en App).
 */
let timer: ReturnType<typeof setTimeout> | undefined
export function announce(message: string) {
  const el = typeof document !== 'undefined' ? document.getElementById('announcer') : null
  if (!el) return
  // Vaciarla y volver a escribir hace que se lea aunque el texto se repita
  el.textContent = ''
  clearTimeout(timer)
  timer = setTimeout(() => (el.textContent = message), 60)
}

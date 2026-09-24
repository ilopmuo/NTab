/**
 * Sonido de aviso con la app abierta: dos notas suaves, generadas con Web Audio
 * (sin archivos). Los navegadores solo dejan sonar audio después de que el
 * usuario haya tocado la página, así que el contexto se prepara en el primer toque.
 */
let ctx: AudioContext | null = null

function unlock() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* sin audio */
  }
}

export function primeSound() {
  const opts = { capture: true, passive: true } as const
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, unlock, opts)
}

export function chime() {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.22
  master.connect(ctx.destination)
  // Mi6 → La6, como una campanilla
  ;[
    [1318.5, 0],
    [1760, 0.16],
  ].forEach(([freq, at]) => {
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + at)
    gain.gain.linearRampToValueAtTime(1, now + at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.9)
    osc.connect(gain).connect(master)
    osc.start(now + at)
    osc.stop(now + at + 1)
  })
}

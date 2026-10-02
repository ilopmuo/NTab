/**
 * Sonido de fondo para concentrarse (como Noisli o Endel): ruido de colores y
 * olas, generados al momento con Web Audio, sin ficheros. Lo que se elige se
 * guarda en este dispositivo.
 */

export type NoiseKind = 'off' | 'brown' | 'pink' | 'white' | 'waves'

export const NOISES: { value: NoiseKind; label: string; hint: string }[] = [
  { value: 'off', label: 'Sin sonido', hint: '' },
  { value: 'brown', label: 'Marrón', hint: 'Grave y suave, como una cascada lejana' },
  { value: 'pink', label: 'Rosa', hint: 'Como la lluvia' },
  { value: 'white', label: 'Blanco', hint: 'Tapa las voces de alrededor' },
  { value: 'waves', label: 'Olas', hint: 'Ruido grave que va y viene' },
]

export interface NoisePrefs {
  kind: NoiseKind
  /** 0…1 */
  volume: number
}

const KEY = 'ntab-focus-sound'
export function loadNoise(): NoisePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NoisePrefs> | null
    return { kind: p?.kind ?? 'off', volume: typeof p?.volume === 'number' ? p.volume : 0.5 }
  } catch {
    return { kind: 'off', volume: 0.5 }
  }
}
export function saveNoise(p: NoisePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Muestras de ruido de un color (entre -1 y 1). El marrón suma el blanco con
 * fuga (más graves); el rosa usa el filtro de Paul Kellet (-3 dB por octava).
 */
export function noiseSamples(kind: Exclude<NoiseKind, 'off'>, length: number, random = Math.random): Float32Array {
  const out = new Float32Array(length)
  let last = 0
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < length; i++) {
    const white = random() * 2 - 1
    if (kind === 'white') out[i] = white * 0.5
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      b3 = 0.8665 * b3 + white * 0.3104856
      b4 = 0.55 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.016898
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    } else {
      last = (last + 0.02 * white) / 1.02
      out[i] = last * 3.5
    }
  }
  // Por si acaso: nada fuera de [-1, 1]
  let peak = 0
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 1) for (let i = 0; i < length; i++) out[i] /= peak
  return out
}

let ctx: AudioContext | null = null

function audio() {
  const AC = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

/** Desbloquea el audio dentro de un toque, para que luego pueda sonar */
export function unlockAudio() {
  audio()
}

let playing: { kind: NoiseKind; source: AudioBufferSourceNode; gain: GainNode; lfo?: OscillatorNode } | null = null

const FADE = 0.8

/** Suena (o cambia de sonido o de volumen) con un fundido */
export function playNoise(kind: NoiseKind, volume: number) {
  if (kind === 'off') return stopNoise()
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime
  if (playing?.kind === kind) {
    playing.gain.gain.cancelScheduledValues(now)
    playing.gain.gain.setTargetAtTime(volume * 0.6, now, 0.1)
    return
  }
  stopNoise()
  // 8 s en bucle: suficiente para no notar la repetición
  const buffer = ac.createBuffer(1, ac.sampleRate * 8, ac.sampleRate)
  buffer.copyToChannel(noiseSamples(kind === 'waves' ? 'brown' : kind, buffer.length) as Float32Array<ArrayBuffer>, 0)
  const source = ac.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume * 0.6, now + FADE)
  let lfo: OscillatorNode | undefined
  let out: AudioNode = source
  if (kind === 'waves') {
    // Olas: el volumen sube y baja despacio (una ola cada ~9 s)
    const swell = ac.createGain()
    swell.gain.value = 0.55
    lfo = ac.createOscillator()
    lfo.frequency.value = 0.11
    const depth = ac.createGain()
    depth.gain.value = 0.45
    lfo.connect(depth).connect(swell.gain)
    lfo.start()
    source.connect(swell)
    out = swell
  }
  out.connect(gain).connect(ac.destination)
  source.start()
  playing = { kind, source, gain, lfo }
}

export function stopNoise() {
  if (!ctx || !playing) return
  const { source, gain, lfo } = playing
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(0, now + FADE)
  source.stop(now + FADE + 0.05)
  lfo?.stop(now + FADE + 0.05)
  playing = null
}

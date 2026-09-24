import { useEffect, useRef, useState } from 'react'

/**
 * Dictado por voz con la Web Speech API (Safari en iPhone/iPad y Chrome).
 * Mientras se habla llega el texto provisional; al terminar, el definitivo.
 * Donde no existe, `supported` es false y no se enseña el botón.
 */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

type Ctor = new () => Recognition
const Impl: Ctor | undefined =
  typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: Ctor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition) : undefined

export function useDictation(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  cb.current = onText

  useEffect(() => () => rec.current?.abort(), [])

  const start = () => {
    if (!Impl || listening) return
    const r = new Impl()
    r.lang = 'es-ES'
    r.interimResults = true
    r.continuous = false
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interim += res[0].transcript
      }
      cb.current((finalText + interim).trim(), false)
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Permite el micrófono para dictar' : e.error === 'no-speech' ? 'No te he oído' : null)
    r.onend = () => {
      setListening(false)
      if (finalText.trim()) cb.current(finalText.trim(), true)
      rec.current = null
    }
    rec.current = r
    setError(null)
    setListening(true)
    try {
      r.start()
    } catch {
      setListening(false)
    }
  }
  const stop = () => rec.current?.stop()

  return { supported: !!Impl, listening, error, start, stop }
}

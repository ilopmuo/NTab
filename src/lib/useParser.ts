import { useEffect, useState } from 'react'

type Parse = typeof import('./parse').parseQuickAdd
let cached: Parse | undefined

/** El analizador de lenguaje natural, bajo demanda: no hace falta para el primer pintado */
export const loadParser = (): Promise<Parse> => (cached ? Promise.resolve(cached) : import('./parse').then((m) => (cached = m.parseQuickAdd)))

/** El analizador, en cuanto `active` (p. ej. al abrir el campo); hasta que llega, undefined */
export function useParser(active = true): Parse | undefined {
  const [parse, setParse] = useState<Parse | undefined>(() => cached)
  useEffect(() => {
    if (active && !parse) void loadParser().then((p) => setParse(() => p))
  }, [active, parse])
  return parse
}

/**
 * Duraciones escritas a mano, sin dependencias: lo usan la app
 * (src/lib/duration.ts) y el analizador de lenguaje natural del servidor.
 */

/**
 * Lee una duración escrita a mano: "30", "30m", "45 min", "2h", "1h30",
 * "1,5 h", "1:30". Sin unidad son minutos. Devuelve minutos o undefined.
 */
export function parseDuration(raw: string): number | undefined {
  const s = raw.trim().toLowerCase().replace(',', '.')
  let m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m) return clamp(Number(m[1]) * 60 + Number(m[2]))
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hrs?|horas?)\s*(?:(\d{1,2})\s*(?:m|min|minutos?)?)?$/)
  if (m) return clamp(Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0))
  m = s.match(/^(\d+)\s*(?:m|min|mins|minutos?)?$/)
  if (m) return clamp(Number(m[1]))
  return undefined
}

function clamp(n: number) {
  return n > 0 && n <= 24 * 60 ? n : undefined
}

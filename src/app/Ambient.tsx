import { useEffect, useState } from 'react'
import { tint, type Tint } from './sections'

/** Color según la hora: cálido por la mañana, azul por la tarde, índigo por la noche */
function timeTint(h = new Date().getHours()): [Tint, Tint] {
  if (h >= 6 && h < 12) return ['orange', 'pink']
  if (h >= 12 && h < 19) return ['teal', 'blue']
  return ['indigo', 'purple']
}

/** Los colores muy luminosos (amarillo, verde…) se atenúan para que el halo no deslumbre */
const GLOW: Partial<Record<Tint, number>> = { yellow: 0.5, green: 0.7, orange: 0.75, teal: 0.8, gray: 0.8 }
const glow = (t: Tint, k = 1) => `calc(var(--ambient-opacity) * ${(GLOW[t] ?? 1) * k})`

/** Fondo vivo: halos difuminados que se mueven muy despacio detrás del cristal */
export function Ambient({ section }: { section: Tint }) {
  const [time, setTime] = useState(timeTint)
  useEffect(() => {
    const t = setInterval(() => setTime(timeTint()), 10 * 60_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="ambient" aria-hidden>
      <span
        style={{
          transition: 'background-color 1.2s ease, opacity 1.2s ease',
          width: '55vmax',
          height: '55vmax',
          left: '-12vmax',
          top: '-22vmax',
          background: tint(section),
          opacity: glow(section),
          animation: 'drift-a 26s ease-in-out infinite',
        }}
      />
      <span
        style={{
          width: '48vmax',
          height: '48vmax',
          right: '-16vmax',
          bottom: '-20vmax',
          background: tint(time[0]),
          opacity: glow(time[0]),
          animation: 'drift-b 32s ease-in-out infinite',
        }}
      />
      <span
        style={{
          width: '26vmax',
          height: '26vmax',
          right: '18vw',
          top: '8vh',
          background: tint(time[1]),
          opacity: glow(time[1], 0.55),
          animation: 'drift-a 38s ease-in-out infinite reverse',
        }}
      />
    </div>
  )
}

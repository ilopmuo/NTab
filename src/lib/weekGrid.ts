/** Geometría de la semana por horas: de un punto de la pantalla a un día y una hora */
export interface GridBox {
  left: number
  top: number
  width: number
  /** ancho de la columna de las horas */
  gutter: number
  days: number
  startHour: number
  hourPx: number
}

/** Qué día (columna, de 0 a days-1) hay bajo la x */
export function dayAt(x: number, g: GridBox): number {
  const col = Math.floor((x - g.left - g.gutter) / ((g.width - g.gutter) / g.days))
  return Math.max(0, Math.min(g.days - 1, col))
}

/** Minuto del día bajo la y, redondeado a `step` (hacia abajo) */
export function minuteAt(y: number, g: GridBox, step = 15): number {
  const raw = g.startHour * 60 + ((y - g.top) / g.hourPx) * 60
  return Math.max(0, Math.min(24 * 60 - step, Math.floor(raw / step) * step))
}

/** Hora de inicio al soltar un bloque que se cogió `grab` minutos por debajo de su principio */
export function dropStart(y: number, g: GridBox, grab: number, duration: number, step = 15): number {
  const raw = g.startHour * 60 + ((y - g.top) / g.hourPx) * 60 - grab
  return Math.max(0, Math.min(24 * 60 - duration, Math.round(raw / step) * step))
}

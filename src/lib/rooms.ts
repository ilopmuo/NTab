/**
 * Estancias de la casa, para colocar las cosas (Cosas) y las tareas de limpieza
 * (Última vez), como hacen Encircle o Tody. Se puede escribir otra cualquiera.
 */
export const ROOMS = ['Cocina', 'Salón', 'Dormitorio', 'Baño', 'Entrada', 'Despacho', 'Terraza', 'Trastero', 'Garaje'] as const

/** Las de siempre más las que ya se usan, sin repetir */
export function roomsIn(used: (string | undefined)[]): string[] {
  const extra = [...new Set(used.map((r) => r?.trim()).filter((r): r is string => !!r))].filter((r) => !ROOMS.some((x) => x.toLowerCase() === r.toLowerCase()))
  return [...ROOMS, ...extra.sort((a, b) => a.localeCompare(b, 'es'))]
}

/** Texto para comparar: minúsculas y sin acentos. Sin dependencias (app y servidor). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

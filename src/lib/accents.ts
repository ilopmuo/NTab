/**
 * Color de acento (Ajustes → Apariencia). La app sigue siendo monocroma: el
 * acento sustituye al índigo de LUNO en todo lo que actúa (hoy, selección,
 * botones, enlaces). Los tonos de cada uno, para los dos temas, están en
 * index.css (`[data-accent=…]`) y los comprueba accents.test.ts (contraste AA).
 * El de la marca conserva el id `blue` (el que ya guardan los dispositivos).
 */
export const ACCENTS = [
  { id: 'blue', label: 'Índigo LUNO', swatch: '#5b57e8' },
  { id: 'azure', label: 'Azul', swatch: '#1766e8' },
  { id: 'violet', label: 'Violeta', swatch: '#7c3aed' },
  { id: 'pink', label: 'Rosa', swatch: '#db2777' },
  { id: 'orange', label: 'Naranja', swatch: '#c2410c' },
  { id: 'teal', label: 'Verde azulado', swatch: '#0f766e' },
  { id: 'graphite', label: 'Grafito', swatch: '#48484a' },
] as const

export type Accent = (typeof ACCENTS)[number]['id']

export const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a.id === v)

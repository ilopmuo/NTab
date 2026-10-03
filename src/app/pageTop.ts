import type { ComponentType, ReactNode } from 'react'

/**
 * Lo que va encima de cada página (las pestañas del espacio). La App lo pone
 * al arrancar: así `Page`, que importan todas las vistas, no arrastra la
 * navegación y el arranque no se parte en trozos.
 */
export const pageTop: {
  Component: ComponentType<{ anyDepth?: boolean; trailing?: ReactNode }> | null
  /** «‹ Atrás» en la barra compacta de arriba */
  Back: ComponentType<{ compact?: boolean; className?: string }> | null
} = { Component: null, Back: null }

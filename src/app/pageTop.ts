import type { ComponentType } from 'react'

/**
 * Lo que va encima de cada página (las pestañas del espacio). La App lo pone
 * al arrancar: así `Page`, que importan todas las vistas, no arrastra la
 * navegación y el arranque no se parte en trozos.
 */
export const pageTop: { Component: ComponentType<{ anyDepth?: boolean }> | null } = { Component: null }

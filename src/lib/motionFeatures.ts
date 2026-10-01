/**
 * Lo pesado de Motion (layout, arrastrar, animar a mano), fuera del arranque:
 * la app pinta con `m` (la versión ligera, ver App) y esto se carga en cuanto
 * está en pantalla. Hasta entonces, lo que se mueve aparece sin animación.
 */
export { domMax as default, animate } from 'motion/react'

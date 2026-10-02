/**
 * Funciones que se pueden apagar (Ajustes → Funciones). Lo esencial (Hoy,
 * Próximo, Bandeja, Calendario, Proyectos, Etiquetas…) no se apaga. Apagar una
 * función la quita de la barra lateral, las pestañas, ⌘K, los atajos, las
 * tarjetas de Hoy y sus avisos; los datos se conservan.
 *
 * Se guarda en el ajuste `features` (sincronizado) como { id: false } para lo
 * apagado: lo que no aparece está encendido, así que una función nueva nace
 * encendida.
 */
export type FeatureGroup = 'organize' | 'life' | 'home' | 'money'

export interface FeatureDef {
  id: string
  label: string
  hint: string
  group: FeatureGroup
  /** secciones de la app que dependen de ella */
  sections: string[]
  /** tarjetas de Hoy que dependen de ella */
  cards: string[]
}

export const FEATURES: FeatureDef[] = [
  { id: 'notes', label: 'Notas', hint: 'Apuntes, ideas y listas que se convierten en tareas', group: 'organize', sections: ['notes'], cards: [] },
  { id: 'lists', label: 'Listas inteligentes', hint: 'Búsquedas guardadas por fecha, prioridad, etiqueta o persona', group: 'organize', sections: ['lists'], cards: [] },
  { id: 'matrix', label: 'Matriz de Eisenhower', hint: 'Lo urgente y lo importante, en cuatro cuadrantes', group: 'organize', sections: ['matrix'], cards: [] },
  { id: 'templates', label: 'Plantillas', hint: 'Listas que repites: la maleta, el cierre de mes…', group: 'organize', sections: ['templates'], cards: [] },
  { id: 'goals', label: 'Objetivos', hint: 'Metas con una cifra o con sus proyectos', group: 'organize', sections: ['goals'], cards: [] },
  { id: 'review', label: 'Revisión semanal', hint: 'Seis pasos para vaciar la cabeza y planificar la semana', group: 'organize', sections: ['review'], cards: [] },
  { id: 'focus', label: 'Foco', hint: 'Pomodoros con descansos, sonido de fondo y tus mejores horas', group: 'organize', sections: ['focus'], cards: [] },
  { id: 'countdowns', label: 'Cuenta atrás', hint: 'Los días que faltan para lo que esperas, en Hoy', group: 'organize', sections: [], cards: ['countdowns'] },
  { id: 'habits', label: 'Hábitos', hint: 'Seguimiento diario, rachas y recordatorios', group: 'life', sections: ['habits'], cards: ['habits'] },
  { id: 'routines', label: 'Rutinas', hint: 'Pasos que haces siempre igual, guiados', group: 'life', sections: ['routines'], cards: ['routines'] },
  { id: 'trackers', label: 'Última vez', hint: '¿Cuándo cambiaste las sábanas? Y aviso cuando toca', group: 'life', sections: ['trackers'], cards: ['trackers'] },
  { id: 'journal', label: 'Diario', hint: 'Ánimo, unas líneas y tres cosas buenas cada día', group: 'life', sections: ['journal'], cards: ['journal'] },
  { id: 'people', label: 'Personas', hint: 'Cumpleaños y a quién hace tiempo que no llamas', group: 'life', sections: ['people'], cards: ['people'] },
  { id: 'house', label: 'Tareas de casa', hint: 'Turnos de limpieza, compra y cuentas con tus compañeros de piso', group: 'home', sections: ['house'], cards: ['house'] },
  { id: 'shopping', label: 'Compra', hint: 'Lista de la compra por pasillos', group: 'home', sections: ['shopping'], cards: [] },
  { id: 'menu', label: 'Menú', hint: 'Comidas de la semana con tus recetas', group: 'home', sections: ['menu'], cards: ['meals'] },
  { id: 'things', label: 'Cosas', hint: 'Dónde está algo, préstamos y caducidades', group: 'home', sections: ['things'], cards: ['things'] },
  { id: 'expenses', label: 'Gastos', hint: 'Lo que gastas al mes, con presupuesto', group: 'money', sections: ['expenses'], cards: [] },
  { id: 'finance', label: 'Pagos', hint: 'Suscripciones y recibos, con aviso antes del cargo', group: 'money', sections: ['finance'], cards: ['payments'] },
]

export const FEATURE_GROUPS: { id: FeatureGroup; label: string }[] = [
  { id: 'organize', label: 'Organizar' },
  { id: 'life', label: 'Día a día' },
  { id: 'home', label: 'Casa' },
  { id: 'money', label: 'Dinero' },
]

/** Valor del ajuste: lo apagado, a false */
export type FeatureFlags = Record<string, boolean>

export const featureOn = (flags: FeatureFlags | null | undefined, id: string) => flags?.[id] !== false

const bySection = new Map(FEATURES.flatMap((f) => f.sections.map((s) => [s, f.id] as const)))
const byCard = new Map(FEATURES.flatMap((f) => f.cards.map((c) => [c, f.id] as const)))

/** ¿Se ve esta sección? (las que no dependen de ninguna función, siempre) */
export const sectionOn = (flags: FeatureFlags | null | undefined, section: string) => {
  const f = bySection.get(section)
  return !f || featureOn(flags, f)
}

export const cardOn = (flags: FeatureFlags | null | undefined, card: string) => {
  const f = byCard.get(card)
  return !f || featureOn(flags, f)
}

/** La función de la que depende una sección, si la hay */
export const featureOfSection = (section: string) => FEATURES.find((f) => f.id === bySection.get(section))

export { REMINDER_FEATURE, reminderAllowed } from '../../supabase/functions/_shared/features.ts'

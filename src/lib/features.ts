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
  group: FeatureGroup
  /** secciones de la app que dependen de ella */
  sections: string[]
  /** tarjetas de Hoy que dependen de ella */
  cards: string[]
}

export const FEATURES: FeatureDef[] = [
  { id: 'notes', label: 'Notas', group: 'organize', sections: ['notes'], cards: [] },
  { id: 'lists', label: 'Filtros', group: 'organize', sections: [], cards: [] },
  { id: 'matrix', label: 'Matriz de Eisenhower', group: 'organize', sections: ['matrix'], cards: [] },
  { id: 'templates', label: 'Plantillas', group: 'organize', sections: ['templates'], cards: [] },
  { id: 'goals', label: 'Objetivos', group: 'organize', sections: ['goals'], cards: [] },
  { id: 'review', label: 'Revisión semanal', group: 'organize', sections: ['review'], cards: [] },
  { id: 'focus', label: 'Foco', group: 'organize', sections: ['focus'], cards: [] },
  { id: 'countdowns', label: 'Cuenta atrás', group: 'organize', sections: [], cards: ['countdowns'] },
  { id: 'habits', label: 'Hábitos', group: 'life', sections: ['habits'], cards: ['habits'] },
  { id: 'routines', label: 'Rutinas', group: 'life', sections: ['routines'], cards: ['routines'] },
  { id: 'trackers', label: 'Última vez', group: 'life', sections: ['trackers'], cards: ['trackers'] },
  { id: 'meds', label: 'Medicación', group: 'life', sections: ['meds'], cards: ['meds'] },
  { id: 'journal', label: 'Diario', group: 'life', sections: ['journal'], cards: ['journal'] },
  { id: 'people', label: 'Personas', group: 'life', sections: ['people'], cards: ['people'] },
  { id: 'house', label: 'Tareas de casa', group: 'home', sections: ['house'], cards: ['house'] },
  { id: 'shopping', label: 'Compra', group: 'home', sections: ['shopping'], cards: [] },
  { id: 'menu', label: 'Menú', group: 'home', sections: ['menu'], cards: ['meals'] },
  { id: 'things', label: 'Cosas', group: 'home', sections: ['things'], cards: ['things'] },
  { id: 'expenses', label: 'Gastos', group: 'money', sections: ['expenses', 'money'], cards: [] },
  { id: 'finance', label: 'Pagos', group: 'money', sections: ['finance'], cards: ['payments'] },
  { id: 'accounts', label: 'Cuentas y patrimonio', group: 'money', sections: ['accounts'], cards: [] },
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

/** Lugares que juntan varias funciones: se ven si alguna está encendida (Hábitos lleva también Última vez) */
const ANY_OF: Record<string, string[]> = { habits: ['habits', 'trackers'] }

/** ¿Se ve esta sección? (las que no dependen de ninguna función, siempre) */
export const sectionOn = (flags: FeatureFlags | null | undefined, section: string) => {
  if (ANY_OF[section]) return ANY_OF[section].some((id) => featureOn(flags, id))
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

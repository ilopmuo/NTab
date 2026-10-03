import { useMemo, useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Area, Person, Project, Task } from './types'

// Áreas, proyectos y personas se usan en casi todas las pantallas (y en la
// captura rápida para entender "+Proyecto" y "@Persona"): se mantienen en
// memoria para que estén disponibles al instante, sin esperar a una consulta.
let cache: { areas: Area[]; projects: Project[]; people: Person[] } = { areas: [], projects: [], people: [] }
const listeners = new Set<() => void>()
let started = false
export function startLookupCache() {
  if (started) return
  started = true
  liveQuery(() => Promise.all([db.areas.orderBy('order').toArray(), db.projects.orderBy('order').toArray(), db.people.orderBy('name').toArray()])).subscribe({
    next: ([areas, projects, people]) => {
      cache = { areas, projects, people }
      listeners.forEach((l) => l())
    },
    error: (e) => console.error('[lookup]', e),
  })
}

/** Lo mismo, fuera de React (p. ej. para saber de qué área cuelga un proyecto) */
export const lookupNow = () => cache

function useCache() {
  startLookupCache()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => cache,
  )
}

export function useAreas(): Area[] {
  return useCache().areas
}

export function useProjects(): Project[] {
  return useCache().projects
}

// Las tareas pendientes también se quedan en memoria: Hoy, la Bandeja,
// Próximo o un proyecto las leen de aquí, así que volver a una de esas
// pantallas no espera a IndexedDB (con miles de tareas, un buen rato en un
// móvil) y se pinta en el mismo fotograma. Se mantienen al día solas.
let open: Task[] | undefined
const openListeners = new Set<() => void>()
let openStarted = false
export function startOpenTasks() {
  if (openStarted) return
  openStarted = true
  liveQuery(() => db.tasks.where('done').equals(0).toArray()).subscribe({
    next: (list) => {
      open = list
      openListeners.forEach((l) => l())
    },
    error: (e) => console.error('[pendientes]', e),
  })
}

export function useOpenTasks(): Task[] | undefined {
  startOpenTasks()
  return useSyncExternalStore(
    (l) => {
      openListeners.add(l)
      return () => void openListeners.delete(l)
    },
    () => open,
  )
}

export function useTask(id: string | null | undefined) {
  return useLiveQuery(() => (id ? db.tasks.get(id) : undefined), [id])
}

/** Mapa id → entidad, para pintar etiquetas de proyecto/área/persona en las tareas */
export function useLookup() {
  const { areas, projects, people } = useCache()
  return useMemo(() => {
    const a = new Map(areas.map((x) => [x.id, x]))
    const p = new Map(projects.map((x) => [x.id, x]))
    const pe = new Map(people.map((x) => [x.id, x]))
    return {
      areas,
      projects,
      people,
      area: (id?: string) => (id ? a.get(id) : undefined),
      project: (id?: string) => (id ? p.get(id) : undefined),
      person: (id?: string) => (id ? pe.get(id) : undefined),
    }
  }, [areas, projects, people])
}

export type Lookup = ReturnType<typeof useLookup>

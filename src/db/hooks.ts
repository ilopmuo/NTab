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

export function useOpenTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.where('done').equals(0).toArray(), [])
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

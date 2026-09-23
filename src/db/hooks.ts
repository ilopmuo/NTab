import { useMemo, useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Area, Project, Task } from './types'

// Áreas y proyectos se usan en casi todas las pantallas (y en la captura
// rápida para entender "+Proyecto"): se mantienen en memoria para que estén
// disponibles al instante, sin esperar a una consulta.
let cache: { areas: Area[]; projects: Project[] } = { areas: [], projects: [] }
const listeners = new Set<() => void>()
let started = false
export function startLookupCache() {
  if (started) return
  started = true
  liveQuery(() => Promise.all([db.areas.orderBy('order').toArray(), db.projects.orderBy('order').toArray()])).subscribe({
    next: ([areas, projects]) => {
      cache = { areas, projects }
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

/** Mapa id → entidad, para pintar etiquetas de proyecto/área en las tareas */
export function useLookup() {
  const { areas, projects } = useCache()
  return useMemo(() => {
    const a = new Map(areas.map((x) => [x.id, x]))
    const p = new Map(projects.map((x) => [x.id, x]))
    return {
      areas,
      projects,
      area: (id?: string) => (id ? a.get(id) : undefined),
      project: (id?: string) => (id ? p.get(id) : undefined),
    }
  }, [areas, projects])
}

export type Lookup = ReturnType<typeof useLookup>

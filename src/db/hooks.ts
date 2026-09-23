import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Area, Project, Task } from './types'

export function useAreas(): Area[] {
  return useLiveQuery(() => db.areas.orderBy('order').toArray(), []) ?? []
}

export function useProjects(): Project[] {
  return useLiveQuery(() => db.projects.orderBy('order').toArray(), []) ?? []
}

export function useOpenTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.where('done').equals(0).toArray(), [])
}

export function useTask(id: string | null | undefined) {
  return useLiveQuery(() => (id ? db.tasks.get(id) : undefined), [id])
}

/** Mapa id → entidad, para pintar etiquetas de proyecto/área en las tareas */
export function useLookup() {
  const areas = useAreas()
  const projects = useProjects()
  return {
    areas,
    projects,
    area: (id?: string) => (id ? areas.find((a) => a.id === id) : undefined),
    project: (id?: string) => (id ? projects.find((p) => p.id === id) : undefined),
  }
}

export type Lookup = ReturnType<typeof useLookup>

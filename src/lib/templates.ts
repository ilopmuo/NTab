import { db } from '@/db/db'
import { createProject, createTask } from '@/db/actions'
import type { Project, Task, Template, TemplateItem } from '@/db/types'
import { uid } from './id'
import { expandTemplate, itemsFromTasks } from '../../supabase/functions/_shared/templates.ts'

export { expandTemplate, itemsFromTasks }

export interface ApplyOptions {
  /** YYYY-MM-DD del día de inicio */
  start: string
  /** crear un proyecto con el nombre de la plantilla (o este) */
  asProject?: boolean
  projectName?: string
  areaId?: string
  /** añadir las tareas a un proyecto existente */
  projectId?: string
}

/** Usa una plantilla: crea sus tareas (y el proyecto, si se pide) */
export async function applyTemplate(t: Template, opts: ApplyOptions): Promise<{ project?: Project; tasks: Task[] }> {
  return db.transaction('rw', db.tasks, db.projects, async () => {
    let project: Project | undefined
    if (opts.asProject) project = await createProject({ name: opts.projectName?.trim() || t.name, areaId: opts.areaId })
    const projectId = project?.id ?? opts.projectId
    const areaId = project?.areaId ?? (opts.projectId ? (await db.projects.get(opts.projectId))?.areaId : opts.areaId)
    const tasks: Task[] = []
    for (const [i, x] of expandTemplate(t.items, opts.start).entries()) {
      tasks.push(
        await createTask({
          title: x.title,
          dueDate: x.dueDate,
          dueTime: x.dueTime,
          priority: x.priority,
          subtasks: x.subtasks.map((s) => ({ id: uid(), title: s, done: false })),
          projectId,
          areaId,
          order: Date.now() + i,
        }),
      )
    }
    return { project, tasks }
  })
}

export async function createTemplate(data: Partial<Template> & { name: string; items: TemplateItem[] }): Promise<Template> {
  const tpl: Template = { id: uid(), icon: 'list', order: Date.now(), createdAt: Date.now(), ...data }
  await db.templates.add(tpl)
  return tpl
}

/** Guarda las tareas de un proyecto como plantilla */
export async function templateFromProject(project: Project): Promise<Template> {
  const tasks = await db.tasks.where('projectId').equals(project.id).toArray()
  return createTemplate({ name: project.name, items: itemsFromTasks(tasks) as TemplateItem[] })
}

/** Ejemplos para empezar */
export const SAMPLE_TEMPLATES: { name: string; icon: string; items: TemplateItem[] }[] = [
  {
    name: 'Maleta de viaje',
    icon: 'plane',
    items: [
      { title: 'Revisar pasaporte / DNI', offset: -7 },
      { title: 'Reservar transporte al aeropuerto', offset: -3 },
      { title: 'Hacer la maleta', offset: -1, subtasks: ['Cargadores', 'Adaptador de enchufe', 'Medicinas', 'Ropa para los días del viaje', 'Neceser'] },
      { title: 'Hacer check-in online', offset: -1 },
      { title: 'Sacar la basura y cerrar ventanas', offset: 0 },
    ],
  },
  {
    name: 'Cierre de mes',
    icon: 'wallet',
    items: [
      { title: 'Revisar los cargos del banco', offset: 0 },
      { title: 'Pagar recibos pendientes', offset: 0 },
      { title: 'Apuntar gastos del mes', offset: 1 },
      { title: 'Mover el ahorro a la cuenta de ahorro', offset: 1, priority: 2 },
    ],
  },
  {
    name: 'Limpieza a fondo',
    icon: 'home',
    items: [
      { title: 'Cambiar sábanas', offset: 0 },
      { title: 'Limpiar baño', offset: 0 },
      { title: 'Aspirar y fregar', offset: 0 },
      { title: 'Limpiar nevera y tirar lo caducado', offset: 0 },
      { title: 'Sacar la basura y el reciclaje', offset: 0 },
    ],
  },
]

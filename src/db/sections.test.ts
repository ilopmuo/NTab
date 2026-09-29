import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addSection, createProject, createTask, deleteSection, moveSection, renameSection } from './actions'
import { applyTemplate, templateFromProject } from '@/lib/templates'
import { createTasks, useTemplate, type Env, type Row } from '../../supabase/functions/mcp/ntab'
import { planSections } from '../../supabase/functions/_shared/templates'

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.projects.clear(), db.templates.clear()])
})

describe('secciones de proyecto', () => {
  it('añadir, renombrar, mover y borrar (las tareas se quedan sin sección)', async () => {
    const p = await createProject({ name: 'Web nueva' })
    const a = (await addSection(p.id, ' Diseño '))!
    const b = (await addSection(p.id, 'Contenido'))!
    expect(await addSection(p.id, '   ')).toBeUndefined()
    await renameSection(p.id, a.id, 'Diseño visual')
    await moveSection(p.id, b.id, -1)
    expect((await db.projects.get(p.id))!.sections).toEqual([
      { id: b.id, name: 'Contenido' },
      { id: a.id, name: 'Diseño visual' },
    ])
    const t = await createTask({ title: 'Maquetas', projectId: p.id, sectionId: a.id })
    await deleteSection(p.id, a.id)
    expect((await db.projects.get(p.id))!.sections).toEqual([{ id: b.id, name: 'Contenido' }])
    const after = await db.tasks.get(t.id)
    expect(after?.projectId).toBe(p.id)
    expect(after?.sectionId).toBeUndefined()
  })

  it('las plantillas conservan las secciones', async () => {
    const p = await createProject({ name: 'Lanzamiento' })
    const s = (await addSection(p.id, 'Prensa'))!
    await createTask({ title: 'Nota de prensa', projectId: p.id, sectionId: s.id })
    await createTask({ title: 'Revisar web', projectId: p.id })
    const tpl = await templateFromProject((await db.projects.get(p.id))!)
    expect(tpl.items.find((i) => i.title === 'Nota de prensa')?.section).toBe('Prensa')
    const { project, tasks } = await applyTemplate(tpl, { start: '2026-10-01', asProject: true, projectName: 'Lanzamiento 2' })
    const fresh = await db.projects.get(project!.id)
    expect(fresh?.sections?.map((x) => x.name)).toEqual(['Prensa'])
    expect(tasks.find((t) => t.title === 'Nota de prensa')?.sectionId).toBe(fresh!.sections![0].id)
    expect(tasks.find((t) => t.title === 'Revisar web')?.sectionId).toBeUndefined()
  })
})

describe('secciones en el servidor', () => {
  let n = 0
  const env = (): Env => ({ tz: 'Europe/Madrid', now: Date.parse('2026-09-30T08:00:00Z'), autoRemind: true, newId: () => `new-${++n}` })
  const rows: Row[] = [
    { tbl: 'projects', id: 'p1', data: { id: 'p1', name: 'Web nueva', status: 'active', sections: [{ id: 's1', name: 'Diseño' }] } },
    { tbl: 'templates', id: 'tp', data: { id: 'tp', name: 'Mudanza', items: [{ title: 'Cajas', section: 'Antes' }, { title: 'Llaves', section: 'Después' }, { title: 'Contratos' }] } },
  ]

  it('planSections reutiliza por nombre y añade las nuevas en orden', () => {
    let k = 0
    const plan = planSections([{ id: 's1', name: 'Diseño' }], ['diseño', 'Lanzamiento', undefined, 'Lanzamiento'], () => `x${++k}`)
    expect(plan.sections).toEqual([{ id: 's1', name: 'Diseño' }, { id: 'x1', name: 'Lanzamiento' }])
    expect(plan.idFor('DISEÑO')).toBe('s1')
    expect(plan.changed).toBe(true)
  })

  it('crear_tareas con sección (existente o nueva)', () => {
    const r = createTasks(rows, [{ titulo: 'Logo', proyecto: 'web', seccion: 'diseño' }, { titulo: 'Anuncio', proyecto: 'web', seccion: 'Lanzamiento' }, { titulo: 'Post', proyecto: 'web', seccion: 'lanzamiento' }], env())
    const tasks = r.writes.filter((w) => w.tbl === 'tasks')
    const project = r.writes.find((w) => w.tbl === 'projects')!
    const launch = (project.data.sections as { id: string; name: string }[]).find((s) => s.name === 'Lanzamiento')!
    expect(tasks.map((t) => t.data.sectionId)).toEqual(['s1', launch.id, launch.id])
    expect((project.data.sections as unknown[]).length).toBe(2)
  })

  it('usar_plantilla como proyecto crea sus secciones', () => {
    const r = useTemplate(rows, { plantilla: 'mudanza', como: 'proyecto' }, env())
    const project = r.writes.find((w) => w.tbl === 'projects')!
    const secs = project.data.sections as { id: string; name: string }[]
    expect(secs.map((s) => s.name)).toEqual(['Antes', 'Después'])
    const byTitle = Object.fromEntries(r.writes.filter((w) => w.tbl === 'tasks').map((w) => [w.data.title, w.data.sectionId]))
    expect(byTitle).toEqual({ Cajas: secs[0].id, Llaves: secs[1].id, Contratos: undefined })
  })
})

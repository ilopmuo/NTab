import { describe, expect, it } from 'vitest'
import type { Goal, Task } from '@/db/types'
import { healthLabel, projectHealth } from './projectHealth'
import { checkItem, checkNoteLine, contactKind, openChecklist, sameLine, trackerFor } from './ripples'
import { goalProgress, taskGoalCount } from './goals'
import { buildSummary, updateTasks, type Env, type Row } from '../../supabase/functions/mcp/ntab'
import { capture } from '../../supabase/functions/mcp/capture'

const TODAY = '2026-10-05'
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const at = (ymd: string) => Date.parse(`${ymd}T10:00:00Z`)

describe('salud de los proyectos', () => {
  const p = (extra: Partial<{ status: string; deadline: string; createdAt: number }> = {}) => ({ status: 'active', createdAt: at('2026-09-01'), ...extra })
  const t = (done: boolean, extra: Partial<{ createdAt: number; completedAt: number; someday: boolean; waitingFor: string }> = {}) => ({ done, createdAt: at('2026-10-01'), ...extra })

  it('con fecha límite: pasada, justa o con tiempo', () => {
    expect(projectHealth(p({ deadline: '2026-10-01' }), [t(false), t(true)], TODAY, day)).toEqual({ kind: 'late', days: 4, open: 1 })
    // Cinco pendientes para tres días: va justo
    expect(projectHealth(p({ deadline: '2026-10-08' }), [t(false), t(false), t(false), t(false), t(false)], TODAY, day)).toEqual({ kind: 'atRisk', daysLeft: 3, open: 5 })
    // Una cosa para dentro de diez días: bien
    expect(projectHealth(p({ deadline: '2026-10-15' }), [t(false)], TODAY, day).kind).toBe('ok')
    // Lo hecho no cuenta para la fecha
    expect(projectHealth(p({ deadline: '2026-10-01' }), [t(true)], TODAY, day).kind).toBe('finished')
  })

  it('sin siguiente paso, todo hecho o parado', () => {
    expect(projectHealth(p(), [], TODAY, day).kind).toBe('noNext')
    expect(projectHealth(p(), [t(false, { waitingFor: 'Ana' }), t(false, { someday: true })], TODAY, day).kind).toBe('noNext')
    expect(projectHealth(p(), [t(true, { completedAt: at('2026-10-04') })], TODAY, day).kind).toBe('finished')
    const old = { createdAt: at('2026-09-01') }
    expect(projectHealth(p(), [t(false, old), t(true, { ...old, completedAt: at('2026-09-10') })], TODAY, day)).toEqual({ kind: 'stalled', days: 25 })
    // Hacer o añadir algo lo pone en marcha
    expect(projectHealth(p(), [t(false, old), t(true, { ...old, completedAt: at('2026-10-02') })], TODAY, day).kind).toBe('ok')
  })

  it('los pausados y terminados no avisan; y la etiqueta', () => {
    expect(projectHealth(p({ status: 'paused', deadline: '2026-01-01' }), [t(false)], TODAY, day).kind).toBe('ok')
    expect(healthLabel({ kind: 'stalled', days: 20 })).toBe('Parado 20 días')
    expect(healthLabel({ kind: 'atRisk', daysLeft: 1, open: 4 })).toBe('Faltan 1 día · quedan 4')
    expect(healthLabel({ kind: 'late', days: 2, open: 3 })).toBe('Fecha límite pasada hace 2 días · quedan 3')
    expect(healthLabel({ kind: 'ok' })).toBeUndefined()
  })
})

describe('lo que una tarea hecha cambia en lo demás', () => {
  it('qué contacto es', () => {
    expect(contactKind('Llamar a mamá')).toBe('call')
    expect(contactKind('Escribir a Luis por WhatsApp')).toBe('message')
    expect(contactKind('Comer con Ana')).toBe('meeting')
    expect(contactKind('Mandar el correo a Pedro')).toBe('email')
    expect(contactKind('Devolverle el libro a Ana')).toBe('other')
  })

  it('la «Última vez» que es, en los dos sentidos', () => {
    const trackers = [
      { name: 'Cambiar las sábanas' },
      { name: 'Días sin fumar', avoid: true },
      { name: 'Regar las plantas', archived: 1 },
    ]
    expect(trackerFor('Cambiar sábanas', trackers)?.name).toBe('Cambiar las sábanas')
    expect(trackerFor('Cambiar las sábanas de invitados', trackers)).toBeUndefined()
    expect(trackerFor('Regar las plantas', trackers)).toBeUndefined()
    expect(trackerFor('Fumar', trackers)).toBeUndefined()
  })

  it('las casillas de una nota: marcar, desmarcar y leerlas', () => {
    const note = '# Viaje\n- [ ] Reservar hotel\n- [x] Sacar billetes\n* [ ]  Comprar adaptador '
    expect(checkNoteLine(note, 'reservar  hotel', true)).toBe('# Viaje\n- [x] Reservar hotel\n- [x] Sacar billetes\n* [ ]  Comprar adaptador ')
    expect(checkNoteLine(note, 'Sacar billetes', false)).toContain('- [ ] Sacar billetes')
    // Ya estaba así, o la línea ya no existe
    expect(checkNoteLine(note, 'Sacar billetes', true)).toBeUndefined()
    expect(checkNoteLine(note, 'Hacer la maleta', true)).toBeUndefined()
    expect(openChecklist(note)).toEqual(['Reservar hotel', 'Comprar adaptador'])
    expect(checkItem('- [x] Sacar billetes')).toEqual({ done: true, text: 'Sacar billetes' })
    expect(checkItem('Sacar billetes')).toBeUndefined()
    expect(sameLine('Llamar a Ángela ', 'llamar a angela')).toBe(true)
  })
})

describe('objetivos que se miden con tareas', () => {
  const goal: Goal = { id: 'g', title: 'Leer 20 libros', why: '', kind: 'tasks', tag: 'lectura', target: 20, unit: 'libros', status: 'active', order: 0, createdAt: at('2026-09-01') } as Goal
  const task = (tags: string[], done: boolean, completedAt?: number) => ({ id: Math.random().toString(), title: 'x', tags, done: done ? 1 : 0, completedAt, createdAt: 0 }) as unknown as Task

  it('cuenta las hechas con la etiqueta desde que existe el objetivo', () => {
    const tasks = [task(['lectura'], true, at('2026-09-10')), task(['Lectura', 'ocio'], true, at('2026-10-01')), task(['lectura'], true, at('2026-08-01')), task(['lectura'], false), task(['ocio'], true, at('2026-09-10'))]
    expect(taskGoalCount(goal, tasks)).toBe(2)
    expect(goalProgress(goal, [], tasks)).toMatchObject({ value: 0.1, label: '2 de 20 libros · #lectura' })
    expect(goalProgress({ ...goal, status: 'done' }, [], tasks).value).toBe(1)
  })
})

describe('Claude y Siri: todo conectado', () => {
  // Lunes 5 de octubre de 2026, 10:30 en Madrid
  const NOW = Date.parse('2026-10-05T08:30:00Z')
  let n = 0
  const env: Env = { tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` }
  const task = (id: string, title: string, extra: Record<string, unknown> = {}): Row => ({
    tbl: 'tasks',
    id,
    data: { id, title, done: 0, tags: [], subtasks: [], priority: 0, order: 1, createdAt: at('2026-10-01'), notes: '', ...extra },
  })
  const rows: Row[] = [
    { tbl: 'projects', id: 'web', data: { id: 'web', name: 'Web nueva', status: 'active', createdAt: at('2026-08-01') } },
    { tbl: 'projects', id: 'boda', data: { id: 'boda', name: 'Boda de Ana', status: 'active', deadline: '2026-10-07', createdAt: at('2026-09-01') } },
    { tbl: 'projects', id: 'mud', data: { id: 'mud', name: 'Mudanza', status: 'active', createdAt: at('2026-09-01') } },
    { tbl: 'people', id: 'ana', data: { id: 'ana', name: 'Ana', lastContact: '2026-08-01' } },
    task('w1', 'Elegir plantilla', { projectId: 'web', createdAt: at('2026-08-01') }),
    task('b1', 'Comprar el regalo', { projectId: 'boda' }),
    task('b2', 'Reservar peluquería', { projectId: 'boda' }),
    task('b3', 'Planchar el traje', { projectId: 'boda' }),
    task('m1', 'Contratar la furgoneta', { projectId: 'mud' }),
    task('c1', 'Llamar a Ana', { people: ['ana'] }),
    task('s1', 'Cambiar sábanas'),
    task('n1', 'Reservar hotel', { source: { noteId: 'viaje', line: 'Reservar hotel' } }),
    task('r1', 'Regar', { source: { noteId: 'viaje', line: 'Regar' }, recurrence: { freq: 'day', interval: 3 }, dueDate: TODAY }),
    task('l1', 'Leer «Rayuela»', { tags: ['lectura'], done: 1, completedAt: at('2026-09-20') }),
    { tbl: 'notes', id: 'viaje', data: { id: 'viaje', title: 'Viaje', content: '- [ ] Reservar hotel\n- [ ] Regar' } },
    { tbl: 'trackers', id: 'sab', data: { id: 'sab', name: 'Cambiar las sábanas', log: ['2026-09-20'], archived: 0 } },
    { tbl: 'goals', id: 'g1', data: { id: 'g1', title: 'Leer 12 libros', kind: 'tasks', tag: 'lectura', target: 12, unit: 'libros', status: 'active', createdAt: at('2026-09-01') } },
  ]
  const done = (id: string) => updateTasks(rows, [{ id, hecha: true }], env)

  it('hacer una tarea con alguien apunta el contacto', () => {
    const w = done('c1').writes.find((x) => x.tbl === 'interactions')
    expect(w?.data).toMatchObject({ personId: 'ana', date: TODAY, kind: 'call', summary: 'Llamar a Ana', taskId: 'c1' })
    // Y es su último contacto (para «hace mucho que no hablas con…»)
    expect(done('c1').writes.find((x) => x.tbl === 'people')?.data).toMatchObject({ name: 'Ana', lastContact: TODAY })
  })

  it('si es una «Última vez», se registra', () => {
    const w = done('s1').writes.find((x) => x.tbl === 'trackers')
    expect((w?.data.log as string[])[0]).toBe(TODAY)
  })

  it('la casilla de la nota de la que salió se marca (no si se repite)', () => {
    expect(done('n1').writes.find((x) => x.tbl === 'notes')?.data.content).toBe('- [x] Reservar hotel\n- [ ] Regar')
    expect(done('r1').writes.some((x) => x.tbl === 'notes')).toBe(false)
  })

  it('la última tarea de un proyecto propone terminarlo', () => {
    expect(done('m1').report.join(' ')).toContain('Era la última tarea de «Mudanza»')
    expect(done('b1').report.join(' ')).not.toContain('Era la última')
  })

  it('el resumen avisa de los proyectos que piden atención y cuenta los objetivos con tareas', () => {
    const s = buildSummary(rows, env)
    expect(s).toContain('- Web nueva: 1 pendientes de 1 · OJO: Parado 65 días')
    expect(s).toContain('- Boda de Ana: 3 pendientes de 3 · límite 2026-10-07 · OJO: Faltan 2 días · quedan 3')
    expect(s).toMatch(/- Mudanza: 1 pendientes de 1\n/)
    expect(s).toContain('Los que llevan OJO piden atención')
    expect(s).toContain('- Leer 12 libros: 1 de 12 libros (cuenta solo las tareas con #lectura')
  })

  it('Siri: el proyecto más urgente en los buenos días, y cómo van los proyectos', () => {
    expect(capture(rows, 'Buenos días', env).report[0]).toContain('A «Boda de Ana» le quedan 3 cosas y faltan 2 días.')
    const r = capture(rows, '¿Cómo van mis proyectos?', env).report[0]
    expect(r).toBe('A «Boda de Ana» le quedan 3 cosas y faltan 2 días. «Web nueva» lleva 65 días parado: ¿cuál es el siguiente paso? El resto va bien.')
    expect(capture([], '¿Cómo van mis proyectos?', env).report[0]).toBe('No tienes proyectos en marcha.')
  })
})

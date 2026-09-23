import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@/db/db'
import type { Area, Task } from '@/db/types'
import { SyncEngine, type Remote, type RemoteRow } from './engine'

/** Servidor en memoria con el mismo comportamiento que la tabla `records` de Supabase */
class MemoryRemote implements Remote {
  rows = new Map<string, RemoteRow>()
  private clock = Date.parse('2026-09-23T10:00:00Z')
  async upsert(rows: RemoteRow[]) {
    for (const r of rows) {
      this.clock += 1
      this.rows.set(`${r.tbl}:${r.id}`, { ...structuredClone(r), updated_at: new Date(this.clock).toISOString() })
    }
  }
  async pullSince(since: string | null) {
    return [...this.rows.values()]
      .filter((r) => !since || r.updated_at! > since)
      .sort((a, b) => a.updated_at!.localeCompare(b.updated_at!))
      .map((r) => structuredClone(r))
  }
  async count() {
    return this.rows.size
  }
  live(tbl: string) {
    return [...this.rows.values()].filter((r) => r.tbl === tbl && !r.deleted)
  }
}

let n = 0
function device(remote: Remote) {
  const { db, raw } = openDatabase(`device-${++n}`)
  return { db, raw, engine: new SyncEngine(raw, remote) }
}

/** Deja que el middleware vuelque los cambios al outbox */
const settle = () => new Promise((r) => setTimeout(r, 10))

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id,
  title,
  notes: '',
  done: 0,
  priority: 0,
  tags: [],
  subtasks: [],
  order: 0,
  createdAt: 0,
  ...extra,
})
const area = (id: string, name: string): Area => ({ id, name, icon: 'circle', color: '#fff', order: 0 })

async function seed(d: ReturnType<typeof device>, prefix: string) {
  await d.db.areas.bulkAdd([area(`${prefix}-a1`, 'Trabajo'), area(`${prefix}-a2`, 'Salud')])
  await d.db.tasks.add(task(`${prefix}-welcome`, 'Pulsa N'))
  await d.db._local.put({ key: 'seedIds', value: [`${prefix}-a1`, `${prefix}-a2`, `${prefix}-welcome`] })
  await d.db.settings.put({ key: 'seeded', value: true })
  await settle()
}

describe('SyncEngine', () => {
  it('registra en el outbox altas, cambios, modify() y borrados', async () => {
    const d = device(new MemoryRemote())
    await d.db.tasks.add(task('t1', 'Uno'))
    await d.db.tasks.add(task('t2', 'Dos'))
    await d.db.tasks.where('id').equals('t1').modify({ title: 'Uno bis' })
    await d.db.tasks.delete('t2')
    await settle()
    const keys = (await d.raw._outbox.toArray()).map((e) => e.key).sort()
    expect(keys).toEqual(['tasks:t1', 'tasks:t2'])
  })

  it('primer dispositivo: sube todo a una nube vacía', async () => {
    const remote = new MemoryRemote()
    const a = device(remote)
    await seed(a, 'A')
    await a.db.tasks.add(task('t1', 'Comprar pan'))
    await settle()
    expect(await a.engine.connect('user-1', async () => true)).toBe('uploaded')
    expect(remote.live('tasks').map((r) => r.id).sort()).toEqual(['A-welcome', 't1'])
    expect(await a.engine.pendingCount()).toBe(0)
  })

  it('segundo dispositivo recién estrenado: descarga la nube sin duplicar las áreas de ejemplo', async () => {
    const remote = new MemoryRemote()
    const a = device(remote)
    await seed(a, 'A')
    await a.db.tasks.add(task('t1', 'Comprar pan'))
    await settle()
    await a.engine.connect('user-1', async () => true)

    const b = device(remote)
    await seed(b, 'B')
    let asked = false
    expect(
      await b.engine.connect('user-1', async () => {
        asked = true
        return true
      }),
    ).toBe('downloaded')
    expect(asked).toBe(false)
    expect((await b.db.areas.toArray()).map((x) => x.id).sort()).toEqual(['A-a1', 'A-a2'])
    expect((await b.db.tasks.get('t1'))?.title).toBe('Comprar pan')
    // y no sube nada suyo
    expect(remote.live('areas')).toHaveLength(2)
  })

  it('los cambios y borrados viajan entre dispositivos', async () => {
    const remote = new MemoryRemote()
    const a = device(remote)
    await a.db.tasks.bulkAdd([task('t1', 'Uno'), task('t2', 'Dos')])
    await settle()
    await a.engine.connect('u', async () => true)
    const b = device(remote)
    await b.engine.connect('u', async () => false)

    await b.db.tasks.update('t1', { title: 'Uno editado', done: 1 })
    await b.db.tasks.delete('t2')
    await b.db.tasks.add(task('t3', 'Tres'))
    await settle()
    await b.engine.sync()
    await a.engine.sync()

    expect((await a.db.tasks.get('t1'))?.title).toBe('Uno editado')
    expect((await a.db.tasks.get('t1'))?.done).toBe(1)
    expect(await a.db.tasks.get('t2')).toBeUndefined()
    expect((await a.db.tasks.get('t3'))?.title).toBe('Tres')
    // aplicar lo que llega de la nube no genera cambios locales nuevos
    expect(await a.engine.pendingCount()).toBe(0)
  })

  it('un cambio local sin subir no se pisa con lo que llega de la nube, y todos convergen', async () => {
    const remote = new MemoryRemote()
    const a = device(remote)
    await a.db.tasks.add(task('t1', 'Original'))
    await settle()
    await a.engine.connect('u', async () => true)
    const b = device(remote)
    await b.engine.connect('u', async () => false)

    await b.db.tasks.update('t1', { title: 'Desde B' })
    await settle()
    await b.engine.sync()
    await a.db.tasks.update('t1', { title: 'Desde A (más tarde)' })
    await settle()
    await a.engine.sync()
    await b.engine.sync()

    expect((await a.db.tasks.get('t1'))?.title).toBe('Desde A (más tarde)')
    expect((await b.db.tasks.get('t1'))?.title).toBe('Desde A (más tarde)')
  })

  it('borrar todo (clear) se propaga', async () => {
    const remote = new MemoryRemote()
    const a = device(remote)
    await a.db.tasks.bulkAdd([task('t1', 'Uno'), task('t2', 'Dos')])
    await settle()
    await a.engine.connect('u', async () => true)
    await a.db.tasks.clear()
    await settle()
    await a.engine.sync()
    expect(remote.live('tasks')).toHaveLength(0)
  })

  it('dispositivo con datos propios: puede combinarlos con la nube', async () => {
    const remote = new MemoryRemote()
    const a = device(remote)
    await a.db.tasks.add(task('t1', 'De A'))
    await settle()
    await a.engine.connect('u', async () => true)

    const c = device(remote)
    await c.db.tasks.add(task('c1', 'De C'))
    await settle()
    expect(await c.engine.connect('u', async () => true)).toBe('merged')
    expect((await c.db.tasks.toArray()).map((t) => t.id).sort()).toEqual(['c1', 't1'])
    await a.engine.sync()
    expect((await a.db.tasks.toArray()).map((t) => t.id).sort()).toEqual(['c1', 't1'])
  })

  it('o quedarse solo con lo de la nube', async () => {
    const remote = new MemoryRemote()
    const a = device(remote)
    await a.db.tasks.add(task('t1', 'De A'))
    await settle()
    await a.engine.connect('u', async () => true)

    const c = device(remote)
    await c.db.tasks.add(task('c1', 'De C'))
    await settle()
    expect(await c.engine.connect('u', async () => false)).toBe('downloaded')
    expect((await c.db.tasks.toArray()).map((t) => t.id)).toEqual(['t1'])
    expect(remote.live('tasks').map((r) => r.id)).toEqual(['t1'])
  })
})

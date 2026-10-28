import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db, rawDb } from '@/db/db'
import { importData, wipeData, type Backup } from '@/db/backup'
import { SyncEngine, type Remote, type RemoteRow } from './engine'

/**
 * El estado interno de los asistentes (historial `agentLog`, revisiones
 * `agentSeen:*` y la lista de avisos de antes `agentNotices`) lo escribe solo el
 * conector en la nube. Restaurar una copia antigua o combinar un dispositivo
 * con datos viejos no debe subir una versión obsoleta ni borrarlo; las
 * preferencias normales sí se siguen sincronizando.
 */

/** Servidor en memoria con el mismo comportamiento que la tabla `records` */
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
    return [...this.rows.values()].filter((r) => !r.deleted).length
  }
  setting(key: string) {
    const r = this.rows.get(`settings:${key}`)
    return r && !r.deleted ? (r.data as { value: unknown }).value : undefined
  }
}

const settle = () => new Promise((r) => setTimeout(r, 10))
const setting = (key: string, value: unknown): RemoteRow => ({ tbl: 'settings', id: key, data: { key, value }, deleted: false })
const cloudState = { log: [{ id: 'op-nueva', at: 2 }], seen: { at: 2, tasks: [] }, notices: [{ id: 'aviso-nuevo', at: 2 }] }

async function connectedDevice() {
  const remote = new MemoryRemote()
  await remote.upsert([setting('agentLog', cloudState.log), setting('agentSeen:hermes', cloudState.seen), setting('agentNotices', cloudState.notices), setting('theme', 'light')])
  await rawDb.delete()
  await rawDb.open()
  const engine = new SyncEngine(rawDb, remote)
  expect(await engine.connect('user-1', async () => false)).toBe('downloaded')
  return { remote, engine }
}

describe('estado interno de los asistentes al sincronizar', () => {
  it('restaurar una copia antigua no sube su historial ni borra revisiones o avisos de la nube; la preferencia normal sí se sube', async () => {
    const { remote, engine } = await connectedDevice()
    const backup: Backup = {
      app: 'ntab',
      version: 1,
      exportedAt: '2026-09-01T00:00:00Z',
      data: { settings: [{ key: 'agentLog', value: [{ id: 'op-vieja', at: 1 }] }, { key: 'theme', value: 'dark' }] },
    }
    await importData(backup)
    await settle()
    await engine.sync()
    expect(remote.setting('agentLog')).toEqual(cloudState.log)
    expect(remote.setting('agentSeen:hermes')).toEqual(cloudState.seen)
    expect(remote.setting('agentNotices')).toEqual(cloudState.notices)
    expect(remote.setting('theme')).toBe('dark')
  })

  it('cambiar o borrar en el dispositivo una clave interna no la sube; borrar todo tampoco la borra en la nube', async () => {
    const { remote, engine } = await connectedDevice()
    await db.settings.put({ key: 'agentSeen:hermes', value: { at: 0, tasks: [] } })
    await settle()
    await engine.sync()
    expect(remote.setting('agentSeen:hermes')).toEqual(cloudState.seen)
    await wipeData()
    await settle()
    await engine.sync()
    expect(remote.setting('agentLog')).toEqual(cloudState.log)
    expect(remote.setting('agentNotices')).toEqual(cloudState.notices)
    // Lo demás sí se borra, como siempre
    expect(remote.setting('theme')).toBeUndefined()
  })

  it('combinar un dispositivo que guarda una copia vieja con la cuenta no sube esa copia (control añadido tras el arreglo)', async () => {
    const remote = new MemoryRemote()
    await remote.upsert([setting('agentLog', cloudState.log)])
    await rawDb.delete()
    await rawDb.open()
    await db.settings.put({ key: 'agentLog', value: [{ id: 'op-vieja', at: 1 }] })
    await db.tasks.add({ id: 'mia', title: 'Mi tarea', notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0 })
    await settle()
    expect(await new SyncEngine(rawDb, remote).connect('user-2', async () => true)).toBe('merged')
    expect(remote.setting('agentLog')).toEqual(cloudState.log)
    expect(remote.rows.get('tasks:mia')?.deleted).toBe(false)
  })

  it('un cambio local de una clave interna no cuenta como pendiente de subir; una preferencia normal, sí', async () => {
    const { engine } = await connectedDevice()
    await db.settings.put({ key: 'agentSeen:hermes', value: { at: 0, tasks: [] } })
    await db.settings.put({ key: 'agentLog', value: [] })
    await settle()
    expect(await engine.pendingCount()).toBe(0)
    await db.settings.put({ key: 'theme', value: 'dark' })
    await settle()
    expect(await engine.pendingCount()).toBe(1)
  })

  it('lo que dejó en el outbox una versión anterior de la app no cuenta como pendiente ni se sube', async () => {
    const { remote, engine } = await connectedDevice()
    await db.settings.put({ key: 'agentNotices', value: [{ id: 'aviso-viejo', at: 1 }] })
    await settle()
    // Como lo habría apuntado la app de antes, que sí seguía estas claves
    await rawDb._outbox.put({ key: 'settings:agentNotices', tbl: 'settings', id: 'agentNotices', ts: Date.now() })
    expect(await engine.pendingCount()).toBe(0)
    await engine.sync()
    expect(remote.setting('agentNotices')).toEqual(cloudState.notices)
    expect(await rawDb._outbox.count()).toBe(0)
  })

  it('al combinar un dispositivo con la cuenta, sus claves internas no entran en el outbox', async () => {
    const remote = new MemoryRemote()
    await remote.upsert([setting('agentLog', cloudState.log)])
    await rawDb.delete()
    await rawDb.open()
    await db.settings.put({ key: 'agentLog', value: [{ id: 'op-vieja', at: 1 }] })
    await db.tasks.add({ id: 'otra', title: 'Otra', notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0 })
    await settle()
    const engine = new SyncEngine(rawDb, remote)
    await engine.enqueueAll()
    expect((await rawDb._outbox.toArray()).map((e) => e.key)).not.toContain('settings:agentLog')
    expect(await engine.pendingCount()).toBe(1)
  })
})

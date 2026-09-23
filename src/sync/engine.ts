import { TABLES, type NTabDB } from '@/db/db'
import { stamp } from './tracking'

/** Una fila en la nube: el registro local serializado */
export interface RemoteRow {
  tbl: string
  id: string
  data: unknown
  deleted: boolean
  /** ISO, fijado por el servidor */
  updated_at?: string
}

/** Lo que el motor necesita del servidor (Supabase en la app, uno en memoria en los tests) */
export interface Remote {
  upsert(rows: RemoteRow[]): Promise<void>
  /** filas cambiadas después de `since` (o todas si es null), ordenadas por updated_at */
  pullSince(since: string | null): Promise<RemoteRow[]>
  count(): Promise<number>
}

const CHUNK = 500
/**
 * Al pedir cambios se retrocede un poco respecto al último visto: una escritura
 * que empezó antes pero terminó después no se pierde. Re-aplicar filas es inocuo.
 */
const OVERLAP_MS = 2 * 60 * 1000
const SYNCED = new Set<string>(TABLES)

export type ConnectResult = 'already' | 'uploaded' | 'downloaded' | 'merged'

export class SyncEngine {
  /** `raw`: conexión sin seguimiento de cambios (lo que se aplica desde la nube no se vuelve a subir) */
  constructor(
    private raw: NTabDB,
    private remote: Remote,
  ) {}

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.raw._local.get(key))?.value as T | undefined
  }

  async setMeta(key: string, value: unknown) {
    await this.raw._local.put({ key, value })
  }

  pendingCount() {
    return this.raw._outbox.count()
  }

  /** Sube los cambios locales pendientes. Devuelve cuántos registros se subieron. */
  async push(): Promise<number> {
    const entries = (await this.raw._outbox.orderBy('ts').toArray()).filter((e) => SYNCED.has(e.tbl))
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK)
      const rows: RemoteRow[] = await Promise.all(
        chunk.map(async (e) => {
          const value = await this.raw.table(e.tbl).get(e.id)
          return value ? { tbl: e.tbl, id: e.id, data: value, deleted: false } : { tbl: e.tbl, id: e.id, data: null, deleted: true }
        }),
      )
      if (rows.length) await this.remote.upsert(rows)
      // Solo se quitan del outbox los que no han vuelto a cambiar mientras se subían
      await this.raw.transaction('rw', this.raw._outbox, async () => {
        for (const e of chunk) {
          const cur = await this.raw._outbox.get(e.key)
          if (cur && cur.ts === e.ts) await this.raw._outbox.delete(e.key)
        }
      })
    }
    return entries.length
  }

  /** Descarga y aplica lo cambiado en la nube. Devuelve cuántas filas llegaron. */
  async pull(): Promise<number> {
    const cursor = await this.getMeta<string>('cursor')
    const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null
    const rows = await this.remote.pullSince(since)
    if (!rows.length) return 0
    const tables = TABLES.map((t) => this.raw.table(t))
    await this.raw.transaction('rw', [...tables, this.raw._outbox], async () => {
      for (const r of rows) {
        if (!SYNCED.has(r.tbl)) continue
        // Un cambio local aún sin subir manda: se subirá en la próxima vuelta
        if (await this.raw._outbox.get(`${r.tbl}:${r.id}`)) continue
        if (r.deleted || r.data == null) await this.raw.table(r.tbl).delete(r.id)
        else await this.raw.table(r.tbl).put(r.data)
      }
    })
    const newest = rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), cursor ?? '')
    if (newest) await this.setMeta('cursor', newest)
    return rows.length
  }

  async sync() {
    const pushed = await this.push()
    const pulled = await this.pull()
    await this.setMeta('lastSyncAt', Date.now())
    return { pushed, pulled }
  }

  /** Marca todos los registros locales para subirlos */
  async enqueueAll() {
    const ts = stamp()
    for (const t of TABLES) {
      const keys = await this.raw.table(t).toCollection().primaryKeys()
      await this.raw._outbox.bulkPut(keys.map((k) => ({ key: `${t}:${String(k)}`, tbl: t, id: String(k), ts })))
    }
  }

  /** Borra los datos de este dispositivo sin tocar la nube */
  async resetLocal() {
    const tables = TABLES.map((t) => this.raw.table(t))
    await this.raw.transaction('rw', [...tables, this.raw._outbox, this.raw._local], async () => {
      for (const t of tables) await t.clear()
      await this.raw._outbox.clear()
      await this.raw._local.clear()
    })
  }

  /** ¿Solo hay los datos de ejemplo del primer arranque (nada creado por el usuario)? */
  async isPristine(): Promise<boolean> {
    const seedIds = new Set((await this.getMeta<string[]>('seedIds')) ?? [])
    for (const t of TABLES) {
      if (t === 'settings') continue
      const keys = await this.raw.table(t).toCollection().primaryKeys()
      if (keys.some((k) => !seedIds.has(String(k)))) return false
    }
    return true
  }

  /**
   * Primera conexión de este dispositivo a una cuenta.
   * - Nube vacía → se suben los datos locales.
   * - Nube con datos y aquí solo los de ejemplo → se sustituyen por los de la nube.
   * - Ambos con datos → `chooseMerge()` decide: combinar o quedarse con la nube.
   */
  async connect(userId: string, chooseMerge: () => Promise<boolean>): Promise<ConnectResult> {
    if ((await this.getMeta<string>('userId')) === userId) {
      await this.sync()
      return 'already'
    }
    const remoteCount = await this.remote.count()
    let result: ConnectResult
    if (remoteCount === 0) {
      await this.enqueueAll()
      result = 'uploaded'
    } else if ((await this.isPristine()) || !(await chooseMerge())) {
      await this.resetLocal()
      result = 'downloaded'
    } else {
      await this.enqueueAll()
      await this.setMeta('cursor', null)
      result = 'merged'
    }
    await this.setMeta('userId', userId)
    await this.sync()
    return result
  }
}

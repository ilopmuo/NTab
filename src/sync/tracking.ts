import type Dexie from 'dexie'
import type { DBCore, DBCoreTable, Middleware } from 'dexie'

export interface OutboxEntry {
  /** `${tbl}:${id}` */
  key: string
  tbl: string
  id: string
  /** momento del último cambio; permite saber si cambió otra vez mientras se subía */
  ts: number
}

let lastStamp = 0
/** Marca de tiempo estrictamente creciente: dos cambios seguidos nunca comparten valor */
export function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

type Listener = () => void
const listeners = new Set<Listener>()

/** Avisa cuando hay cambios locales nuevos en el outbox (para programar una sincronización) */
export function onLocalChange(fn: Listener) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/**
 * Middleware de Dexie que apunta en `_outbox` qué registros cambian
 * (altas, modificaciones y borrados, incluidos `modify()` y `clear()`).
 * Solo guarda la clave: al subir se lee el estado actual del registro,
 * y si ya no existe se sube como borrado.
 */
export function createTracking(db: Dexie, tables: readonly string[]): Middleware<DBCore> {
  const tracked = new Set(tables)
  const pending = new Map<string, OutboxEntry>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = async () => {
    timer = undefined
    if (!pending.size) return
    const entries = [...pending.values()]
    pending.clear()
    await db.table('_outbox').bulkPut(entries)
    listeners.forEach((l) => l())
  }

  const record = (tbl: string, keys: unknown[]) => {
    const ts = stamp()
    for (const k of keys) {
      if (k === undefined || k === null) continue
      const id = String(k)
      pending.set(`${tbl}:${id}`, { key: `${tbl}:${id}`, tbl, id, ts })
    }
    // Fuera de la transacción actual (que no incluye _outbox)
    if (!timer) timer = setTimeout(() => void flush(), 0)
  }

  return {
    stack: 'dbcore',
    name: 'ntab-sync-tracking',
    create(down) {
      return {
        ...down,
        table(name) {
          const table = down.table(name)
          if (!tracked.has(name)) return table
          const pk = table.schema.primaryKey.keyPath as string
          const wrapped: DBCoreTable = {
            ...table,
            async mutate(req) {
              let deletedKeys: unknown[] | undefined
              if (req.type === 'deleteRange') {
                // clear() y where().delete(): averiguar qué claves se van a borrar
                const res = await table.query({
                  trans: req.trans,
                  values: false,
                  query: { index: table.schema.primaryKey, range: req.range },
                })
                deletedKeys = res.result
              }
              const res = await table.mutate(req)
              if (req.type === 'add' || req.type === 'put') {
                record(name, res.results ?? req.keys ?? req.values.map((v) => (v as Record<string, unknown>)[pk]))
              } else if (req.type === 'delete') {
                record(name, req.keys)
              } else if (deletedKeys) {
                record(name, deletedKeys)
              }
              return res
            },
          }
          return wrapped
        },
      }
    },
  }
}

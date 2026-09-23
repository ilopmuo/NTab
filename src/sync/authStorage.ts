/**
 * Almacenamiento de la sesión de Supabase a prueba de iOS.
 *
 * Las apps web añadidas a la pantalla de inicio del iPhone a veces pierden el
 * localStorage al cerrarse, y con él la sesión: había que volver a entrar cada
 * vez. Aquí la sesión se guarda por duplicado (localStorage + IndexedDB) y, si
 * uno de los dos desaparece, se recupera del otro.
 */

const DB_NAME = 'ntab-auth'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => {
        const db = req.result
        // iOS puede cerrar la conexión por su cuenta: la próxima vez se reabre
        db.onclose = () => (dbPromise = null)
        resolve(db)
      }
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => (dbPromise = null))
  }
  return dbPromise
}

async function idb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const run = async () => {
    const db = await openDb()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  try {
    return await run()
  } catch {
    // Conexión perdida (típico de iOS al volver del segundo plano): un reintento
    dbPromise = null
    return run()
  }
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* sin localStorage: queda IndexedDB */
  }
}
function lsRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nada */
  }
}

export const durableStorage = {
  async getItem(key: string): Promise<string | null> {
    const fromLs = lsGet(key)
    if (fromLs !== null) return fromLs
    try {
      const fromIdb = (await idb<string | undefined>('readonly', (s) => s.get(key))) ?? null
      if (fromIdb !== null) lsSet(key, fromIdb)
      return fromIdb
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    lsSet(key, value)
    try {
      await idb('readwrite', (s) => s.put(value, key))
    } catch {
      /* queda localStorage */
    }
  },
  async removeItem(key: string): Promise<void> {
    lsRemove(key)
    try {
      await idb('readwrite', (s) => s.delete(key))
    } catch {
      /* nada */
    }
  },
}

/** Pide al navegador que no borre los datos de la app para liberar espacio */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.()
  } catch {
    /* no soportado */
  }
}

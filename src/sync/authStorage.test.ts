import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { durableStorage } from './authStorage'

// localStorage mínimo para el entorno de tests (node)
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

describe('durableStorage (sesión a prueba de iOS)', () => {
  beforeEach(() => mem.clear())

  it('guarda y lee la sesión', async () => {
    await durableStorage.setItem('ntab-auth', '{"token":"a"}')
    expect(await durableStorage.getItem('ntab-auth')).toBe('{"token":"a"}')
  })

  it('si iOS borra el localStorage, la recupera de IndexedDB y la restaura', async () => {
    await durableStorage.setItem('ntab-auth', '{"token":"b"}')
    mem.clear()
    expect(await durableStorage.getItem('ntab-auth')).toBe('{"token":"b"}')
    expect(mem.get('ntab-auth')).toBe('{"token":"b"}')
  })

  it('al cerrar sesión se borra de los dos sitios', async () => {
    await durableStorage.setItem('ntab-auth', '{"token":"c"}')
    await durableStorage.removeItem('ntab-auth')
    mem.clear()
    expect(await durableStorage.getItem('ntab-auth')).toBeNull()
  })
})

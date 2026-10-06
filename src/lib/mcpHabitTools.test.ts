import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { daysLabel, parseDays } from '../../supabase/functions/mcp/days'

// Martes 6 de octubre de 2026, 10:00 en Madrid
const NOW = Date.parse('2026-10-06T08:00:00Z')
let n = 0
const env = (now = NOW): Env => ({ tz: 'Europe/Madrid', now, autoRemind: true, newId: () => `new-${++n}` })

function memoryStore(initial: Row[]) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, r]))
  const store: Store & { rows: Map<string, Row> } = {
    rows,
    load: async () => [...rows.values()],
    save: async (writes, deletes = []) => {
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, w)
      for (const d of deletes) rows.delete(`${d.tbl}:${d.id}`)
    },
  }
  return store
}
const call = async (store: Store, name: string, args: Record<string, unknown> = {}, now = NOW) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env(now))) as {
    result: { content: { text: string }[]; isError?: boolean }
  }
  return { text: r.result.content[0].text, isError: !!r.result.isError }
}
const base = (): Row[] => [
  { tbl: 'areas', id: 'a-salud', data: { id: 'a-salud', name: 'Salud', icon: 'heart', color: '#30D158', order: 0 } },
  { tbl: 'areas', id: 'a-estudio', data: { id: 'a-estudio', name: 'Estudio', icon: 'book', color: '#0A84FF', order: 1 } },
]
const habits = (store: { rows: Map<string, Row> }) => [...store.rows.values()].filter((r) => r.tbl === 'habits')
const habit = (store: { rows: Map<string, Row> }, name: string) => habits(store).find((r) => r.data.name === name)!

describe('hábitos desde Claude', () => {
  it('crear, listar, marcar, editar y archivar: igual que los de la app', async () => {
    const store = memoryStore(base())

    // Con cantidad, hora y área
    const agua = await call(store, 'crear_habito', { nombre: 'Beber agua', cantidad: 8, unidad: 'vasos', hora: '9:00', area: 'salud' })
    expect(agua.isError).toBe(false)
    expect(agua.text).toBe('Hábito creado: «Beber agua», todos los días, objetivo 8 vasos al día, aviso a las 09:00, área Salud. Ya sale en Hoy y se marca con marcar_habito.')
    // Mismo registro que crea la app (createHabit) más lo que se ha pedido
    expect(habit(store, 'Beber agua').data).toEqual({
      id: 'new-1', name: 'Beber agua', icon: 'droplet', color: '#30D158', days: [0, 1, 2, 3, 4, 5, 6], archived: 0, order: NOW, createdAt: NOW,
      remindTime: '09:00', target: 8, unit: 'vasos', areaId: 'a-salud',
    })

    // Sin cantidad, solo laborables
    expect((await call(store, 'crear_habito', { nombre: 'Meditar', dias: 'laborables' })).text).toBe('Hábito creado: «Meditar», laborables. Ya sale en Hoy y se marca con marcar_habito.')
    expect(habit(store, 'Meditar').data).toMatchObject({ days: [1, 2, 3, 4, 5], icon: 'brain', archived: 0 })
    expect(habit(store, 'Meditar').data).not.toHaveProperty('target')
    expect(habit(store, 'Meditar').data).not.toHaveProperty('remindTime')

    // Un hábito que hoy (martes) no toca
    expect((await call(store, 'crear_habito', { nombre: 'Leer', dias: [0, 6], cantidad: 20, unidad: 'min', area: 'Estudio' })).text).toContain('fines de semana, objetivo 20 min al día, área Estudio. Hoy no toca; saldrá en Hoy los días que toca')

    // No se duplica (sin importar mayúsculas ni acentos)
    const dup = await call(store, 'crear_habito', { nombre: 'beber AGUA' })
    expect(dup.isError).toBe(true)
    expect(dup.text).toContain('Ya existe el hábito «Beber agua» (todos los días, objetivo 8 vasos al día')
    expect(habits(store)).toHaveLength(3)

    // Listado con días, objetivo, racha y cómo va hoy
    const list = (await call(store, 'ver_habitos')).text
    expect(list).toContain('HÁBITOS (3):')
    expect(list).toContain('- Beber agua: todos los días, objetivo 8 vasos al día, aviso a las 09:00, área Salud · racha 0 días · hoy pendiente (0/8 vasos)')
    expect(list).toContain('- Meditar: laborables · racha 0 días · hoy pendiente')
    expect(list).toContain('- Leer: fines de semana, objetivo 20 min al día, área Estudio · racha 0 días · hoy no toca')

    // Se marcan con marcar_habito, también por cantidad
    expect((await call(store, 'marcar_habito', { habito: 'agua', cantidad: 3 })).text).toBe('«Beber agua» el 2026-10-06: 3/8 vasos.')
    expect((await call(store, 'marcar_habito', { habito: 'meditar' })).text).toBe('«Meditar» marcado como hecho el 2026-10-06.')
    // Y ayer (lunes) también meditó: racha de 2
    await call(store, 'marcar_habito', { habito: 'meditar', fecha: '2026-10-05' })

    const summary = (await call(store, 'ver_resumen')).text
    expect(summary).toContain('HÁBITOS DE HOY: Beber agua (pendiente, 3/8 vasos); Meditar (hecho)')
    expect(summary).not.toMatch(/HÁBITOS DE HOY:.*Leer/)
    expect((await call(store, 'ver_habitos')).text).toContain('- Meditar: laborables · racha 2 días · hoy hecho')

    // Editar: días, hora, cantidad y área
    expect((await call(store, 'actualizar_habito', { habito: 'meditar', dias: 'lunes, miércoles y viernes', hora: '07:30' })).text).toBe(
      'Hábito actualizado: «Meditar»: lunes, miércoles y viernes, aviso a las 07:30.',
    )
    expect(habit(store, 'Meditar').data).toMatchObject({ days: [1, 3, 5], remindTime: '07:30' })
    expect((await call(store, 'actualizar_habito', { habito: 'Beber agua', cantidad: 10, area: null })).text).toBe('Hábito actualizado: «Beber agua»: objetivo 10 vasos al día, sin área.')
    expect(habit(store, 'Beber agua').data).not.toHaveProperty('areaId')
    expect((await call(store, 'actualizar_habito', { habito: 'beber agua', nombre: 'Agua', hora: null })).text).toBe('Hábito actualizado: «Agua»: ahora se llama «Agua», sin aviso.')
    expect(habit(store, 'Agua').data).not.toHaveProperty('remindTime')
    // Lo marcado sigue ahí con el nombre nuevo
    expect((await call(store, 'marcar_habito', { habito: 'agua', cantidad: 7 })).text).toBe('«Agua» el 2026-10-06: 10/10 vasos (objetivo cumplido).')

    // Archivar: sale de Hoy y del resumen, pero el historial se queda
    const logs = () => [...store.rows.values()].filter((r) => r.tbl === 'habitLogs' && r.data.habitId === habit(store, 'Meditar').id)
    expect(logs()).toHaveLength(2)
    expect((await call(store, 'actualizar_habito', { habito: 'meditar', archivado: true })).text).toContain('Hábito archivado: «Meditar».')
    expect(habit(store, 'Meditar').data.archived).toBe(1)
    expect(logs()).toHaveLength(2)
    expect((await call(store, 'ver_resumen')).text).toMatch(/HÁBITOS DE HOY: Agua \(hecho, 10\/10 vasos\)$/m)
    expect((await call(store, 'marcar_habito', { habito: 'meditar' })).text).toContain('No hay ningún hábito que se llame «meditar»')
    const after = (await call(store, 'ver_habitos')).text
    expect(after).toContain('HÁBITOS (2):')
    expect(after).toContain('Archivados (con su historial): Meditar.')
    expect((await call(store, 'actualizar_habito', { habito: 'meditar', archivado: true })).text).toBe('«Meditar» ya estaba archivado.')

    // Crear otro con el mismo nombre no duplica: propone recuperarlo
    expect((await call(store, 'crear_habito', { nombre: 'Meditar' })).text).toContain('archivado. No lo he duplicado')
    expect((await call(store, 'actualizar_habito', { habito: 'Meditar', archivado: false })).text).toContain('Hábito recuperado: «Meditar», lunes, miércoles y viernes, aviso a las 07:30.')
    // Con sus días nuevos (L, X, V), el martes ya no cuenta: racha del lunes, como en la app
    expect((await call(store, 'ver_habitos')).text).toContain('- Meditar: lunes, miércoles y viernes, aviso a las 07:30 · racha 1 día · hoy no toca')
  })

  it('valida lo que entra con errores legibles', async () => {
    const store = memoryStore(base())
    const bad = async (args: Record<string, unknown>) => {
      const r = await call(store, 'crear_habito', { nombre: 'Correr', ...args })
      expect(r.isError).toBe(true)
      return r.text
    }
    expect(await bad({ hora: '25:00' })).toBe('La hora «25:00» no vale: usa HH:MM en 24 h (p. ej. 08:30 o 21:00).')
    expect(await bad({ hora: '8h' })).toContain('no vale: usa HH:MM')
    expect(await bad({ dias: [1, 7] })).toContain('Los días van del 0 (domingo) al 6 (sábado); no vale «7».')
    expect(await bad({ dias: [] })).toContain('Indica al menos un día')
    expect(await bad({ dias: 'a veces' })).toContain('No entiendo los días «a veces»')
    expect(await bad({ cantidad: 0 })).toContain('La cantidad tiene que ser un número mayor que 0')
    expect(await bad({ cantidad: -3 })).toContain('mayor que 0')
    expect(await bad({ cantidad: 2.5 })).toContain('tiene que ser un número entero')
    expect(await bad({ cantidad: '8' })).toContain('mayor que 0')
    expect(await bad({ unidad: 'km' })).toContain('La unidad («km») va con una cantidad')
    // Varios errores a la vez
    expect((await bad({ hora: '9', cantidad: 0 })).split('\n')).toHaveLength(2)
    expect(habits(store)).toHaveLength(0)
    expect((await call(store, 'crear_habito', {})).text).toBe('Falta el nombre del hábito.')

    // El área que no existe no impide crearlo: lo dice
    const r = await call(store, 'crear_habito', { nombre: 'Correr', area: 'Deporte' })
    expect(r.isError).toBe(false)
    expect(r.text).toContain('No encontré el área «Deporte» (áreas: Salud, Estudio); lo he creado sin área.')

    // Al editar, lo que no vale no cambia nada
    const before = habit(store, 'Correr').data
    expect((await call(store, 'actualizar_habito', { habito: 'correr', dias: [9], hora: '10:00' })).text).toContain('no vale «9»')
    expect(habit(store, 'Correr').data).toEqual(before)
    expect((await call(store, 'actualizar_habito', { habito: 'correr' })).text).toBe('No has dicho qué cambiar de «Correr».')
    expect((await call(store, 'actualizar_habito', { habito: 'nadar', hora: '10:00' })).text).toBe('No hay ningún hábito que se llame «nadar». Hábitos: Correr.')
    await call(store, 'crear_habito', { nombre: 'Correr por la tarde' })
    expect((await call(store, 'actualizar_habito', { habito: 'corre', hora: '10:00' })).text).toBe('Hay varios hábitos que encajan con «corre»: Correr, Correr por la tarde. ¿Cuál?')
    expect((await call(store, 'actualizar_habito', { habito: 'correr', nombre: 'correr por la tarde' })).text).toBe('Ya hay otro hábito «Correr por la tarde».')
    expect((await call(store, 'actualizar_habito', { habito: 'correr', cantidad: null })).isError).toBe(false)
  })

  it('días: lista, palabras o nombres de días', () => {
    expect(parseDays(undefined)).toEqual({})
    expect(parseDays('todos').days).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(parseDays('Laborables').days).toEqual([1, 2, 3, 4, 5])
    expect(parseDays('fines de semana').days).toEqual([0, 6])
    expect(parseDays('lunes y jueves').days).toEqual([1, 4])
    expect(parseDays('los sábados').days).toEqual([6])
    expect(parseDays('1,3,5').days).toEqual([1, 3, 5])
    expect(parseDays([5, 1, 1]).days).toEqual([1, 5])
    expect(daysLabel({ days: [0, 1, 2, 3, 4, 5, 6] })).toBe('todos los días')
    expect(daysLabel({ days: [0, 2] })).toBe('martes y domingo')
    expect(daysLabel({ days: [0, 1, 2, 3, 4, 5, 6], perWeek: 3 })).toBe('3 veces por semana')
  })
})

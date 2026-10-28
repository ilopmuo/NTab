import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hermesConfig } from './hermes'
import { TOOLS } from '../../supabase/functions/mcp/server'

type Schema = { type?: unknown; properties?: Record<string, Schema>; items?: Schema; enum?: unknown[]; required?: string[]; description?: string; [k: string]: unknown }

/** Lo que rechazan los proveedores más estrictos (OpenAI, Gemini, modelos abiertos vía Hermes) */
function problems(s: Schema, path: string, out: string[]) {
  // «uno u otro» (una cosa o una lista): cada rama, bien formada
  const branches = (s.oneOf ?? s.anyOf) as Schema[] | undefined
  if (branches) return branches.forEach((b, i) => problems(b, `${path}|${i}`, out))
  // Un tipo, o un tipo que admite null («null para quitarla»)
  const ok = typeof s.type === 'string' || (Array.isArray(s.type) && s.type.length === 2 && s.type.includes('null'))
  if (!ok) out.push(`${path}: sin type`)
  if (s.type === 'array' && !s.items) out.push(`${path}: array sin items`)
  if (s.type === 'object') {
    if (!s.properties) out.push(`${path}: object sin properties`)
    for (const r of s.required ?? []) if (!s.properties?.[r]) out.push(`${path}: required «${r}» no existe`)
  }
  if (s.enum && !s.enum.every((v) => typeof v === typeof s.enum![0])) out.push(`${path}: enum mezclado`)
  for (const [k, v] of Object.entries(s.properties ?? {})) problems(v, `${path}.${k}`, out)
  if (s.items) problems(s.items, `${path}[]`, out)
}

describe('herramientas del conector, para cualquier modelo (Claude, Hermes…)', () => {
  it('nombres válidos y únicos, con descripción', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{0,40}$/)
      expect((t.description ?? '').length).toBeGreaterThan(20)
    }
  })

  it('esquemas de entrada que aceptan los proveedores estrictos', () => {
    const out: string[] = []
    for (const t of TOOLS) problems(t.inputSchema as Schema, t.name, out)
    expect(out).toEqual([])
  })
})

describe('la skill de LUNO para Hermes (hermes/luno/SKILL.md)', () => {
  const skill = readFileSync(new URL('../../hermes/luno/SKILL.md', import.meta.url), 'utf8')
  const mentioned = new Set([...skill.matchAll(/`([a-z][a-z_]+)(?:=[a-z]+)?`/g)].map((m) => m[1]))
  const names = new Set(TOOLS.map((t) => t.name))

  it('tiene la cabecera que pide Hermes', () => {
    expect(skill).toMatch(/^---\nname: luno\ndescription: .{80,}\n/)
  })

  it('solo nombra herramientas que existen, y las nombra todas', () => {
    // Los parámetros de las herramientas (y sus valores) también se pueden nombrar
    const params = new Set<string>()
    const walk = (x: Schema) => {
      for (const v of x.enum ?? []) if (typeof v === 'string') params.add(v)
      for (const [k, v] of Object.entries(x.properties ?? {})) (params.add(k), walk(v))
      if (x.items) walk(x.items)
    }
    TOOLS.forEach((t) => walk(t.inputSchema as Schema))
    const notTools = new Set(['luno', ...params])
    expect([...mentioned].filter((n) => !names.has(n) && !notTools.has(n) && !n.startsWith('mcp_'))).toEqual([])
    expect([...names].filter((n) => !mentioned.has(n))).toEqual([])
  })
})

describe('configuración de Hermes', () => {
  it('el bloque luno de ~/.hermes/config.yaml, con la URL privada', () => {
    expect(hermesConfig('https://x.supabase.co/functions/v1/mcp/abc')).toBe('mcp_servers:\n  luno:\n    url: "https://x.supabase.co/functions/v1/mcp/abc?via=hermes"\n    timeout: 120\n')
  })
})

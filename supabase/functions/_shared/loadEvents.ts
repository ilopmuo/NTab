/**
 * Lee los calendarios externos de un usuario y devuelve sus eventos en un
 * rango. Lo usan las funciones `events` (la app) y `mcp` (Claude).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { expandIcs, normalizeFeedUrl, type CalEvent } from '../events/expand.ts'

export interface SourceError {
  sourceId: string
  name: string
  error: string
}

// deno-lint-ignore no-explicit-any
export async function loadEvents(admin: SupabaseClient<any, any, any>, userId: string, from: number, to: number) {
  const { data, error } = await admin.from('calendar_sources').select('id,name,url').eq('user_id', userId)
  if (error) throw new Error(error.message)
  const sources = (data ?? []) as { id: string; name: string; url: string }[]
  const errors: SourceError[] = []
  const lists = await Promise.all(
    sources.map(async (s) => {
      try {
        const res = await fetch(normalizeFeedUrl(s.url), { signal: AbortSignal.timeout(10_000), headers: { accept: 'text/calendar, */*' } })
        if (!res.ok) throw new Error(`El calendario respondió ${res.status}`)
        const text = await res.text()
        if (!text.includes('BEGIN:VCALENDAR')) throw new Error('El enlace no es un calendario .ics')
        return expandIcs(text, s.id, from, to)
      } catch (e) {
        errors.push({ sourceId: s.id, name: s.name, error: e instanceof Error ? e.message : String(e) })
        return [] as CalEvent[]
      }
    }),
  )
  const names = Object.fromEntries(sources.map((s) => [s.id, s.name]))
  return { events: lists.flat().sort((a, b) => a.start.localeCompare(b.start)), errors, names }
}

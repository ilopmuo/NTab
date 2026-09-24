import { useSyncExternalStore } from 'react'
import { supabase } from '@/sync/supabase'
import type { AssistantReply, ChatMessage, ProposedChange, ProposedTask } from '../../../supabase/functions/assistant/prompt'
import { buildAssistantContext } from './context'

export type { ProposedChange, ProposedTask }

export interface Turn {
  id: number
  role: 'user' | 'assistant'
  content: string
  tasks?: ProposedTask[]
  changes?: ProposedChange[]
  /** propuesta ya aplicada */
  applied?: boolean
  error?: boolean
}

interface ChatState {
  turns: Turn[]
  loading: boolean
  /** pregunta que llega desde ⌘K, para enviarla al abrir la vista */
  pending: string | null
}

const KEY = 'ntab-assistant'
function load(): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Turn[]
  } catch {
    return []
  }
}

let state: ChatState = { turns: load(), loading: false, pending: null }
const listeners = new Set<() => void>()
function set(patch: Partial<ChatState>) {
  state = { ...state, ...patch }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state.turns.slice(-40)))
  } catch {
    /* sin almacenamiento */
  }
  listeners.forEach((l) => l())
}

export function useChat() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function askLater(question: string) {
  set({ pending: question })
}
export function takePending() {
  const q = state.pending
  if (q) set({ pending: null })
  return q
}

export function resetChat() {
  set({ turns: [] })
}

export function markApplied(id: number) {
  set({ turns: state.turns.map((t) => (t.id === id ? { ...t, applied: true } : t)) })
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El asistente tarda demasiado. Prueba otra vez.')), ms)
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    )
  })
}

async function errorMessage(error: { message: string; context?: unknown }) {
  try {
    const body = await (error.context as Response | undefined)?.json()
    if (body?.error) return String(body.error)
  } catch {
    /* sin detalle */
  }
  return /failed to fetch|network/i.test(error.message) ? 'Sin conexión con el servidor.' : error.message
}

export async function send(question: string) {
  const q = question.trim()
  if (!q || state.loading) return
  const turns = [...state.turns, { id: Date.now(), role: 'user' as const, content: q }]
  set({ turns, loading: true })
  try {
    const context = await buildAssistantContext()
    const messages: ChatMessage[] = turns.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content }))
    const { data, error } = await withTimeout(supabase.functions.invoke<AssistantReply & { error?: string }>('assistant', { body: { messages, context } }), 90_000)
    if (error) throw new Error(await errorMessage(error))
    if (!data || data.error) throw new Error(data?.error ?? 'Respuesta vacía')
    set({
      turns: [...state.turns, { id: Date.now(), role: 'assistant', content: data.text, tasks: data.tasks?.length ? data.tasks : undefined, changes: data.changes?.length ? data.changes : undefined }],
    })
  } catch (e) {
    set({ turns: [...state.turns, { id: Date.now(), role: 'assistant', content: e instanceof Error ? e.message : 'No se pudo responder', error: true }] })
  } finally {
    set({ loading: false })
  }
}

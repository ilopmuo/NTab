import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { rawDb } from '@/db/db'
import { seedIfEmpty } from '@/db/seed'
import { toast } from '@/app/store'
import { SyncEngine } from './engine'
import { SupabaseRemote, supabase } from './supabase'
import { onLocalChange } from './tracking'

export type SyncState = 'loading' | 'signed-out' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  user: { id: string; email: string } | null
  lastSyncAt?: number
  error?: string
  /** el usuario ha elegido usar la app sin cuenta en este dispositivo */
  localOnly: boolean
  /** se ha abierto el enlace de "recuperar contraseña" */
  recovery: boolean
  /**
   * Email de la cuenta a la que este dispositivo ya estuvo conectado
   * (undefined mientras se lee). Si la sesión se pierde —iOS a veces borra
   * el almacenamiento de las apps de la pantalla de inicio— la app no se
   * bloquea: sigue funcionando con los datos locales y pide volver a entrar.
   */
  knownEmail?: string | null
  /** pantalla de inicio de sesión abierta encima de la app */
  authOpen: boolean
}

const LOCAL_ONLY_KEY = 'ntab-local-only'
function readLocalOnly() {
  try {
    return localStorage.getItem(LOCAL_ONLY_KEY) === '1'
  } catch {
    return false
  }
}

let status: SyncStatus = { state: 'loading', user: null, localOnly: readLocalOnly(), recovery: false, authOpen: false }
const listeners = new Set<() => void>()
function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSync(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => status,
  )
}

// ── Ciclo de sincronización ───────────────────────────────────

let engine: SyncEngine | null = null
let connected = false
let running = false
let again = false
let debounce: ReturnType<typeof setTimeout> | undefined
const cleanups: (() => void)[] = []

function schedule(ms = 1500) {
  clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), ms)
}

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

function isNetworkError(e: unknown) {
  const m = describe(e).toLowerCase()
  return !navigator.onLine || m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')
}

async function connect(e: SyncEngine, user: { id: string; email: string }) {
  const result = await e.connect(user.id, async () =>
    window.confirm(
      'Tu cuenta ya tiene datos y este dispositivo también tiene cosas propias.\n\n' +
        'Aceptar: combinar ambos (se suben también los de este dispositivo).\n' +
        'Cancelar: usar solo los datos de tu cuenta (se descartan los de este dispositivo).',
    ),
  )
  connected = true
  await e.setMeta('email', user.email)
  set({ knownEmail: user.email })
  if (result === 'uploaded') toast('Tus datos ya están en la nube ☁️')
  if (result === 'downloaded') toast('Datos descargados de tu cuenta')
  if (result === 'merged') toast('Datos combinados con tu cuenta')
}

export async function syncNow() {
  const e = engine
  const user = status.user
  if (!e || !user) return
  if (running) {
    again = true
    return
  }
  if (!navigator.onLine) {
    set({ state: 'offline' })
    return
  }
  running = true
  set({ state: 'syncing' })
  try {
    // La primera conexión de este dispositivo (decidir subir/descargar/combinar)
    // se reintenta hasta completarse; solo después se sincroniza con normalidad.
    if (!connected) await connect(e, user)
    do {
      again = false
      await e.sync()
    } while (again && engine === e)
    const pending = await e.pendingCount()
    set({ state: pending ? 'pending' : 'synced', lastSyncAt: Date.now(), error: undefined })
  } catch (err) {
    console.error('[sync]', err)
    set(isNetworkError(err) ? { state: 'offline' } : { state: 'error', error: describe(err) })
  } finally {
    running = false
  }
}

async function start(session: Session) {
  const user = { id: session.user.id, email: session.user.email ?? '' }
  if (engine && status.user?.id === user.id) return
  stop()
  set({ user, state: 'syncing', localOnly: false, authOpen: false })
  try {
    localStorage.removeItem(LOCAL_ONLY_KEY)
  } catch {
    /* sin almacenamiento */
  }
  engine = new SyncEngine(rawDb, new SupabaseRemote(user.id))
  connected = false
  await syncNow()

  // Cuándo volver a sincronizar
  cleanups.push(onLocalChange(() => schedule(1500)))
  const interval = setInterval(() => void syncNow(), 60_000)
  cleanups.push(() => clearInterval(interval))
  const wake = () => document.visibilityState === 'visible' && schedule(300)
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
  document.addEventListener('visibilitychange', wake)
  cleanups.push(() => {
    window.removeEventListener('online', wake)
    window.removeEventListener('focus', wake)
    document.removeEventListener('visibilitychange', wake)
  })
  // Tiempo real: otro dispositivo ha guardado algo
  const channel = supabase
    .channel(`records-${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${user.id}` }, () => schedule(800))
    .subscribe()
  cleanups.push(() => void supabase.removeChannel(channel))
}

function stop() {
  clearTimeout(debounce)
  while (cleanups.length) cleanups.pop()!()
  engine = null
  connected = false
}

// ── Cuenta ────────────────────────────────────────────────────

function cleanAuthHash() {
  const h = window.location.hash
  if (/access_token=|error_description=|type=recovery|type=signup/.test(h)) {
    const err = new URLSearchParams(h.replace(/^#/, '')).get('error_description')
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/today`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    if (err) toast(`Enlace no válido: ${err}`)
  }
}

let initialized = false
export function initSync() {
  if (initialized) return
  initialized = true
  const known = rawDb._local
    .get('email')
    .then((r) => (r?.value as string | undefined) ?? null)
    .catch(() => null)
  void known.then((knownEmail) => set({ knownEmail }))
  supabase.auth.onAuthStateChange((event, session) => {
    // No se puede llamar a Supabase dentro de este callback: se difiere
    setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') set({ recovery: true })
      if (event === 'INITIAL_SESSION') cleanAuthHash()
      if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) void start(session)
      else if (!session && (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT')) {
        stop()
        // Esperar a saber si el dispositivo ya tenía cuenta para no mostrar el login de golpe
        set({ state: 'signed-out', user: null, knownEmail: await known })
      }
      if (event === 'SIGNED_IN') cleanAuthHash()
    }, 0)
  })
}

const MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirma tu email antes de entrar: revisa tu bandeja de entrada (y la de spam).'],
  [/already registered|already exists/i, 'Ya existe una cuenta con ese email. Prueba a entrar.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera unos minutos y vuelve a probar.'],
  [/invalid email|unable to validate email/i, 'Ese email no parece válido.'],
  [/failed to fetch|network/i, 'Sin conexión con el servidor. Revisa tu internet.'],
]
export function authErrorMessage(e: unknown) {
  const m = describe(e)
  return MESSAGES.find(([re]) => re.test(m))?.[1] ?? m
}

const redirectTo = () => `${window.location.origin}${window.location.pathname}`

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Devuelve true si hay que confirmar el email antes de poder entrar */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } })
  if (error) throw error
  return !data.session
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  set({ recovery: false })
}

export function dismissRecovery() {
  set({ recovery: false })
}

export async function signOut() {
  const pending = engine ? await engine.pendingCount() : 0
  if (pending && !window.confirm(`Hay ${pending} cambios sin subir que se perderán. ¿Cerrar sesión igualmente?`)) return
  if (!pending && !window.confirm('¿Cerrar sesión? Tus datos seguirán en tu cuenta, pero se borrarán de este dispositivo.')) return
  const local = new SyncEngine(rawDb, new SupabaseRemote(''))
  stop()
  await supabase.auth.signOut({ scope: 'local' })
  await local.resetLocal()
  await seedIfEmpty()
  set({ state: 'signed-out', user: null, lastSyncAt: undefined, knownEmail: null })
}

export function setLocalOnly(on: boolean) {
  try {
    if (on) localStorage.setItem(LOCAL_ONLY_KEY, '1')
    else localStorage.removeItem(LOCAL_ONLY_KEY)
  } catch {
    /* sin almacenamiento */
  }
  set({ localOnly: on })
}

/** Abre la pantalla de inicio de sesión encima de la app */
export function openAuth() {
  set({ authOpen: true })
}

export function closeAuth() {
  set({ authOpen: false })
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './app/theme'
import { App } from './app/App'
import { seedIfEmpty } from './db/seed'
import { db } from './db/db'
import { watchPrefs } from './lib/prefs'
import { initSync } from './sync/service'
import { startLookupCache, startOpenTasks } from './db/hooks'
import { requestPersistentStorage } from './sync/authStorage'
import { rollSubscriptions } from './db/actions'
import { purgeTrash } from './db/trash'
import { interceptLinks } from './app/router'
import { watchViewport } from './lib/viewport'
import { AppCrash, Boundary } from './app/Boundary'

// Compartido desde otra app (Android, o la app instalada en el ordenador: ver
// share_target en vite.config.ts): llega en la dirección y va a la captura
try {
  const q = new URLSearchParams(location.search)
  const shared = [...new Set(['title', 'text', 'url'].map((k) => q.get(k)?.trim()).filter((v): v is string => !!v))]
  if (shared.length) {
    // Android suele mandar el enlace también dentro del texto: una vez basta
    const text = shared.filter((v, i) => !shared.some((o, j) => j !== i && o.length > v.length && o.includes(v))).join(' ')
    sessionStorage.setItem('ntab-shared', text)
    history.replaceState(null, '', `${location.pathname}#/shared`)
  }
} catch {
  /* sin almacenamiento */
}

// El piso de un compañero sin cuenta (ver src/features/house/store.ts): al
// abrir la app desde su pantalla de inicio, que no lleva el enlace, va a su piso
try {
  const piso = localStorage.getItem('ntab-guest-house')
  if (piso && !location.hash) history.replaceState(null, '', `#/piso/${piso}`)
} catch {
  /* sin almacenamiento */
}

registerSW({ immediate: true })
interceptLinks()
watchViewport()
void requestPersistentStorage()

seedIfEmpty().finally(() => {
  startLookupCache()
  // Hoy las necesita: se piden ya, mientras React arranca
  startOpenTasks()
  watchPrefs(db)
  // Los avisos con la app abierta, en cuanto haya cargado lo demás
  void import('./reminders/local').then((m) => m.startLocalReminders())
  void rollSubscriptions()
  void purgeTrash()
  initSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Boundary where="app" fallback={(crash) => <AppCrash crash={crash} />}>
        <App />
      </Boundary>
    </StrictMode>,
  )
})

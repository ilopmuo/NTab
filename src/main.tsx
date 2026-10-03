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
import { startLookupCache } from './db/hooks'
import { requestPersistentStorage } from './sync/authStorage'
import { rollSubscriptions } from './db/actions'
import { purgeTrash } from './db/trash'
import { interceptLinks } from './app/router'

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
void requestPersistentStorage()

seedIfEmpty().finally(() => {
  startLookupCache()
  watchPrefs(db)
  // Los avisos con la app abierta, en cuanto haya cargado lo demás
  void import('./reminders/local').then((m) => m.startLocalReminders())
  void rollSubscriptions()
  void purgeTrash()
  initSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

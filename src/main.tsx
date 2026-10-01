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

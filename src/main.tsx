import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './app/theme'
import { App } from './app/App'
import { seedIfEmpty } from './db/seed'
import { db } from './db/db'
import { watchPrefs } from './lib/prefs'
import { startLocalReminders } from './reminders/local'
import { initSync } from './sync/service'
import { startLookupCache } from './db/hooks'
import { requestPersistentStorage } from './sync/authStorage'
import { rollSubscriptions } from './db/actions'

registerSW({ immediate: true })
void requestPersistentStorage()

seedIfEmpty().finally(() => {
  startLookupCache()
  watchPrefs(db)
  startLocalReminders()
  void rollSubscriptions()
  initSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

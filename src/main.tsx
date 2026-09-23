import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './app/theme'
import { App } from './app/App'
import { seedIfEmpty } from './db/seed'
import { initSync } from './sync/service'

registerSW({ immediate: true })

seedIfEmpty().finally(() => {
  initSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

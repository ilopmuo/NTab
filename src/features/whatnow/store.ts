import { useSyncExternalStore } from 'react'

// ── Abrir/cerrar ──────────────────────────────────────────────
let open = false
const listeners = new Set<() => void>()
export const whatNow = {
  open: () => ((open = true), listeners.forEach((l) => l())),
  close: () => ((open = false), listeners.forEach((l) => l())),
}
export const useWhatNowOpen = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
  )

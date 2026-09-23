import { useEffect } from 'react'
import { SECTIONS } from './sections'
import { navigate } from './router'
import { getUI, ui } from './store'

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function useGlobalShortcuts() {
  useEffect(() => {
    let gPressed = 0
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.palette(!getUI().paletteOpen)
        return
      }
      if (e.key === 'Escape') {
        const s = getUI()
        if (s.selectedTaskId) ui.closeTask()
        else if (s.sidebarOpen) ui.sidebar(false)
        return
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const s = getUI()
      if (s.paletteOpen || s.quickAdd.open || s.helpOpen) return

      const k = e.key.toLowerCase()
      if (gPressed && Date.now() - gPressed < 1200) {
        gPressed = 0
        const target = SECTIONS.find((n) => n.key.toLowerCase() === k)
        if (target) {
          e.preventDefault()
          navigate(target.path)
        }
        return
      }
      if (k === 'g') {
        gPressed = Date.now()
        return
      }
      if (k === 'n' || k === 'q') {
        e.preventDefault()
        ui.quickAdd()
      } else if (e.key === '?') {
        ui.help()
      } else if (k === '/') {
        e.preventDefault()
        ui.palette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

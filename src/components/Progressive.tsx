import { startTransition, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Listas largas por tramos: se pintan las primeras filas y, al acercarse al
 * final (con margen, para que no se note), las siguientes. Una lista de 600
 * tareas abre igual de rápido que una de 40.
 */
export function useProgressive(total: number, first = 40, step = 30, root?: { current: Element | null }) {
  const [limit, setLimit] = useState(first)
  const ref = useRef<HTMLDivElement | null>(null)
  const more = limit < total
  useEffect(() => {
    const el = ref.current
    if (!more || !el) return
    // En segundo plano (React lo trocea): el scroll no se para mientras se pintan
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && startTransition(() => setLimit((l) => l + step)), {
      // Lo que se desplaza: la página o, si la lista tiene su propio scroll (Notas), esa caja
      root: root?.current ?? document.getElementById('main'),
      rootMargin: '1200px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [more, step, limit, root])
  return { limit, sentinel: more ? <div ref={ref} aria-hidden className="h-px" /> : null }
}

/** Bloques (días, grupos…) por tramos según cuántas filas lleva cada uno */
export function Progressive<T>({
  items,
  weight,
  render,
  first = 40,
  step = 30,
  root,
}: {
  items: T[]
  weight: (item: T) => number
  render: (item: T) => ReactNode
  first?: number
  step?: number
  root?: { current: Element | null }
}) {
  const total = items.reduce((n, i) => n + Math.max(1, weight(i)), 0)
  const { limit, sentinel } = useProgressive(total, first, step, root)
  const shown: T[] = []
  let used = 0
  for (const item of items) {
    if (shown.length && used >= limit) break
    shown.push(item)
    used += Math.max(1, weight(item))
  }
  return (
    <>
      {shown.map(render)}
      {shown.length < items.length && sentinel}
    </>
  )
}

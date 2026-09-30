import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDaysYmd, capitalize, fmt, fromYmd, today, weekStart, ymd } from '@/lib/dates'
import { cx, spring } from './ui'

const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Días de la cuadrícula de un mes: de lunes a domingo, semanas completas */
export function monthGrid(month: string): string[] {
  const first = ymd(startOfMonth(fromYmd(month)))
  const last = ymd(endOfMonth(fromYmd(month)))
  const days: string[] = []
  for (let d = weekStart(first); d <= last || days.length % 7 !== 0; d = addDaysYmd(d, 1)) days.push(d)
  return days
}

/** Día al que lleva cada tecla desde `day` (flechas, Inicio/Fin de la semana, Re Pág/Av Pág de mes) */
export function keyTarget(day: string, key: string): string | undefined {
  switch (key) {
    case 'ArrowLeft':
      return addDaysYmd(day, -1)
    case 'ArrowRight':
      return addDaysYmd(day, 1)
    case 'ArrowUp':
      return addDaysYmd(day, -7)
    case 'ArrowDown':
      return addDaysYmd(day, 7)
    case 'Home':
      return weekStart(day)
    case 'End':
      return addDaysYmd(weekStart(day), 6)
    case 'PageUp':
      return ymd(addMonths(fromYmd(day), -1))
    case 'PageDown':
      return ymd(addMonths(fromYmd(day), 1))
  }
  return undefined
}

/**
 * Calendario de un mes para elegir un día, con el estilo de la app (en vez del
 * selector del navegador). Se maneja con el teclado como una cuadrícula.
 */
export function DatePicker({ value, onChange, className }: { value?: string; onChange: (day: string) => void; className?: string }) {
  const t = today()
  const [month, setMonth] = useState((value ?? t).slice(0, 7) + '-01')
  const [focus, setFocus] = useState(value ?? t)
  const [dir, setDir] = useState(0)
  const grid = useRef<HTMLDivElement>(null)
  const byKeyboard = useRef(false)

  // Al moverse con el teclado, el foco sigue al día (también al cambiar de mes)
  useEffect(() => {
    if (!byKeyboard.current) return
    byKeyboard.current = false
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus()
  }, [focus, month])

  const go = (n: number) => {
    setDir(n)
    setMonth(ymd(addMonths(fromYmd(month), n)))
  }
  const days = monthGrid(month)
  const inMonth = (d: string) => d.slice(0, 7) === month.slice(0, 7)
  const tabbable = inMonth(focus) ? focus : days.find(inMonth)!

  return (
    <div className={cx('w-full max-w-[320px] select-none', className)}>
      <div className="mb-1 flex items-center">
        <p className="flex-1 pl-1 text-[15px] font-semibold" aria-live="polite">
          {capitalize(fmt(month, 'MMMM'))} <span className="font-num text-muted">{fmt(month, 'yyyy')}</span>
        </p>
        <button type="button" aria-label="Mes anterior" onClick={() => go(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-blue hover:bg-hover">
          <ChevronLeft size={18} strokeWidth={2.4} />
        </button>
        <button type="button" aria-label="Mes siguiente" onClick={() => go(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-blue hover:bg-hover">
          <ChevronRight size={18} strokeWidth={2.4} />
        </button>
      </div>
      <div className="grid grid-cols-7" aria-hidden>
        {HEAD.map((h) => (
          <span key={h} className="py-1 text-center text-[11px] font-semibold text-muted">
            {h}
          </span>
        ))}
      </div>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={month}
            ref={grid}
            role="group"
            aria-label={capitalize(fmt(month, "MMMM 'de' yyyy"))}
            initial={{ opacity: 0, x: dir * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -30 }}
            transition={spring}
            className="grid grid-cols-7 gap-y-0.5"
            onKeyDown={(e) => {
              const to = keyTarget(focus, e.key)
              if (!to) return
              e.preventDefault()
              byKeyboard.current = true
              if (to.slice(0, 7) !== month.slice(0, 7)) {
                setDir(to < month ? -1 : 1)
                setMonth(to.slice(0, 7) + '-01')
              }
              setFocus(to)
            }}
          >
            {days.map((d) => {
              const selected = d === value
              const isToday = d === t
              return (
                <button
                  key={d}
                  type="button"
                  data-day={d}
                  tabIndex={d === tabbable ? 0 : -1}
                  aria-label={capitalize(fmt(d, "EEEE, d 'de' MMMM"))}
                  aria-pressed={selected}
                  aria-current={isToday ? 'date' : undefined}
                  onFocus={() => setFocus(d)}
                  onClick={() => onChange(d)}
                  className={cx(
                    'font-num mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[15px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue',
                    selected
                      ? 'bg-accent-fill font-bold text-white'
                      : isToday
                        ? 'font-bold text-blue hover:bg-hover'
                        : inMonth(d)
                          ? cx('hover:bg-hover', d < t && 'text-muted')
                          : 'text-muted hover:bg-hover',
                  )}
                >
                  {fromYmd(d).getDate()}
                </button>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

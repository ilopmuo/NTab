import { deleteTask, mutateTasks, restoreTasks } from '@/db/actions'
import { addDaysYmd, today } from '@/lib/dates'
import { toastTrashed } from '@/features/trash/undo'
import { toast } from './store'

/**
 * Teclado sobre las listas de tareas (para no depender del ratón):
 * j / ↓ y k / ↑ pasan de una tarea a otra; con una tarea enfocada, T la pasa a
 * hoy, M a mañana, S a «algún día» y Supr la borra (Intro la abre y Espacio la completa, en el
 * propio título). Todo con «Deshacer» (o ⌘Z).
 */
const titles = () => [...document.querySelectorAll<HTMLElement>('#main [data-task-id] .task-title')]

function focusAt(i: number) {
  const list = titles()
  if (!list.length) return
  const el = list[Math.max(0, Math.min(list.length - 1, i))]
  el.focus()
  el.scrollIntoView({ block: 'nearest' })
}

/**
 * Tras quitar una tarea de la lista, el foco se queda en la que ocupa su sitio.
 * La fila que sale tarda un momento en irse (se pliega): se espera a que se
 * haya ido y, si aun así el foco se ha perdido, se vuelve a poner.
 */
function refocusAfter(index: number) {
  setTimeout(() => focusAt(index), 350)
  setTimeout(() => {
    if (!document.activeElement || document.activeElement === document.body) focusAt(index)
  }, 700)
}

async function moveTo(id: string, day: string, label: string, index: number) {
  const before = await mutateTasks([id], (x) => {
    if (x.dueDate !== day) delete x.dueTime
    x.dueDate = day
  })
  toast(`→ ${label}`, { label: 'Deshacer', run: () => void restoreTasks(before) })
  refocusAfter(index)
}

/** Devuelve true si la tecla era para la lista de tareas */
export function handleTaskKey(e: KeyboardEvent): boolean {
  const active = document.activeElement as HTMLElement | null
  const onTitle = !!active?.classList.contains('task-title')
  const k = e.key
  if (k === 'j' || k === 'k' || (onTitle && (k === 'ArrowDown' || k === 'ArrowUp'))) {
    const list = titles()
    if (!list.length) return false
    e.preventDefault()
    const i = onTitle ? list.indexOf(active!) : -1
    const down = k === 'j' || k === 'ArrowDown'
    focusAt(i < 0 ? (down ? 0 : list.length - 1) : i + (down ? 1 : -1))
    return true
  }
  if (!onTitle) return false
  const id = active!.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
  if (!id) return false
  const index = titles().indexOf(active!)
  const lower = k.toLowerCase()
  if (lower === 't') {
    e.preventDefault()
    void moveTo(id, today(), 'hoy', index)
    return true
  }
  if (lower === 'm') {
    e.preventDefault()
    void moveTo(id, addDaysYmd(today(), 1), 'mañana', index)
    return true
  }
  if (lower === 's') {
    e.preventDefault()
    void (async () => {
      const before = await mutateTasks([id], (x) => {
        x.someday = true
        delete x.dueDate
        delete x.dueTime
      })
      toast('→ algún día', { label: 'Deshacer', run: () => void restoreTasks(before) })
      refocusAfter(index)
    })()
    return true
  }
  if (k === 'Delete' || k === 'Backspace') {
    e.preventDefault()
    void deleteTask(id).then(() => {
      toastTrashed('Tarea a la papelera', 'tasks', id)
      refocusAfter(index)
    })
    return true
  }
  return false
}

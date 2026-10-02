import { Star } from 'lucide-react'
import type { Task } from '@/db/types'
import { MAX_IMPORTANT } from '@/lib/day'
import { TaskList } from '@/components/TaskList'
import { Button, Section } from '@/components/ui'

/** Arriba del todo en Hoy */
export function ImportantSection({ tasks, onPick }: { tasks: Task[]; onPick: () => void }) {
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <Star size={18} strokeWidth={2.4} className="text-blue" fill="currentColor" aria-hidden />
          Lo importante
        </span>
      }
      count={tasks.length}
      action={
        <Button size="sm" variant="ghost" onClick={onPick}>
          Cambiar
        </Button>
      }
    >
      <TaskList tasks={tasks} hideImportant />
    </Section>
  )
}

/** Cuando aún no se ha elegido y hay varias cosas para hoy */
export function ImportantPrompt({ onPick }: { onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="glass mb-6 flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left text-[14px] transition-transform active:scale-[0.99]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-blue">
        <Star size={16} strokeWidth={2.4} />
      </span>
      <span className="flex-1">
        <b className="font-semibold">¿Qué es lo importante hoy?</b>
        <span className="block text-[13px] text-muted">Elige hasta {MAX_IMPORTANT} tareas y van arriba del todo</span>
      </span>
    </button>
  )
}

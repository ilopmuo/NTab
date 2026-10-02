import { m as motion } from 'motion/react'
import { toggleTask } from '@/db/actions'
import type { Task } from '@/db/types'
import { ui } from '@/app/store'
import { Checkbox } from '@/components/TaskItem'
import { cx, softSpring } from '@/components/ui'

const PRIO = ['', '!', '!!', '!!!']

export type Action = { label: string; icon?: React.ReactNode; run: (t: Task) => void; primary?: boolean }

export function Row({ task, meta, actions }: { task: Task; meta?: string; actions: Action[] }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      transition={softSpring}
      className="overflow-hidden"
    >
      <div role="group" aria-label={task.title} className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)]">
        <Checkbox checked={false} priority={task.priority} onChange={() => void toggleTask(task)} />
        <button type="button" onClick={() => ui.openTask(task.id)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px]">
            {task.priority > 0 && <b className="mr-1 font-bold text-blue">{PRIO[task.priority]}</b>}
            {task.title}
          </span>
          {meta && <span className="block truncate text-[12.5px] text-muted">{meta}</span>}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              aria-label={a.label}
              title={a.label}
              onClick={() => a.run(task)}
              className={cx(
                'flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-transform active:scale-95',
                a.primary ? 'bg-accent-fill text-white' : 'bg-fill text-fg',
                !!a.icon && !a.primary && 'w-8 justify-center px-0',
              )}
            >
              {a.icon ?? a.label}
              {a.icon && a.primary && a.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

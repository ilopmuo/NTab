import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Flame, Folder, RotateCcw, StickyNote, Target, Trash2, User, Wallet } from 'lucide-react'
import { db } from '@/db/db'
import { TRASH_DAYS, deleteForever, emptyTrash, restoreFromTrash } from '@/db/trash'
import type { TrashItem } from '@/db/types'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty, Group, IconButton, PageHeader, Section, softSpring } from '@/components/ui'
import { Page } from '../Page'

const KIND: Record<TrashItem['tbl'], { label: string; icon: typeof CheckCircle2 }> = {
  tasks: { label: 'Tarea', icon: CheckCircle2 },
  notes: { label: 'Nota', icon: StickyNote },
  projects: { label: 'Proyecto', icon: Folder },
  people: { label: 'Persona', icon: User },
  habits: { label: 'Hábito', icon: Flame },
  subscriptions: { label: 'Pago', icon: Wallet },
  goals: { label: 'Objetivo', icon: Target },
}

const dayKey = (ms: number) => new Date(ms).toDateString()
function dayTitle(ms: number) {
  const d = new Date(ms)
  const today = new Date()
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())
}

function daysLeft(item: TrashItem) {
  return Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - item.deletedAt) / 864e5))
}

function Row({ item }: { item: TrashItem }) {
  const k = KIND[item.tbl]
  const extra = item.related?.length ? ` · con ${item.related.length} ${item.tbl === 'projects' ? (item.related.length === 1 ? 'tarea' : 'tareas') : 'registros'}` : ''
  const left = daysLeft(item)
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={softSpring} className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-muted">
          <k.icon size={15} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{item.title}</span>
          <span className="block truncate text-[12.5px] text-muted">
            {k.label}
            {extra} · {left <= 1 ? 'se borra mañana' : `se borra en ${left} días`}
          </span>
        </span>
        <Button
          size="sm"
          variant="tinted"
          onClick={async () => {
            await restoreFromTrash(item.id)
            toast(`${k.label} recuperad${item.tbl === 'people' || item.tbl === 'notes' || item.tbl === 'tasks' ? 'a' : 'o'}: ${item.title}`)
          }}
        >
          <RotateCcw size={13} strokeWidth={2.6} /> Recuperar
        </Button>
        <IconButton
          label="Borrar para siempre"
          className="h-8 w-8 hover:!text-red"
          onClick={() => {
            if (window.confirm(`¿Borrar «${item.title}» para siempre?`)) void deleteForever(item.id)
          }}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </motion.div>
  )
}

export function TrashView() {
  const items = useLiveQuery(() => db.trash.orderBy('deletedAt').reverse().toArray(), [])
  if (!items) return null
  const groups: { key: string; title: string; items: TrashItem[] }[] = []
  for (const it of items) {
    const key = dayKey(it.deletedAt)
    const g = groups.find((x) => x.key === key)
    if (g) g.items.push(it)
    else groups.push({ key, title: dayTitle(it.deletedAt), items: [it] })
  }
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('trash')} size={40} />}
        title="Papelera"
        subtitle={`Lo que borras se guarda ${TRASH_DAYS} días, por si acaso.`}
        actions={
          items.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm(`¿Vaciar la papelera? Se borrarán para siempre ${items.length} elementos.`)) void emptyTrash()
              }}
            >
              Vaciar
            </Button>
          )
        }
      />
      {items.length === 0 ? (
        <Group>
          <Empty icon={<Trash2 size={28} strokeWidth={2.2} />} title="La papelera está vacía" hint="Si borras algo sin querer, aquí podrás recuperarlo durante 30 días." />
        </Group>
      ) : (
        groups.map((g) => (
          <Section key={g.key} title={g.title} count={g.items.length}>
            <Group>
              <AnimatePresence initial={false}>
                {g.items.map((it) => (
                  <Row key={it.id} item={it} />
                ))}
              </AnimatePresence>
            </Group>
          </Section>
        ))
      )}
    </Page>
  )
}

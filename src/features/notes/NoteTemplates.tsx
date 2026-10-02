import { CalendarDays, Lightbulb, ListChecks, Luggage, Users } from 'lucide-react'
import { db } from '@/db/db'
import { createNote } from '@/db/actions'
import { capitalize, fmt, today } from '@/lib/dates'
import { navigate } from '@/app/router'
import { Modal, ModalHeader } from '@/components/ui'

interface Template {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  title: (t: string) => string
  content: (t: string) => string
}

const date = (t: string) => capitalize(fmt(t, "EEEE, d 'de' MMMM"))

/**
 * Plantillas de notas (como las de Craft o Notion) y la nota del día (como
 * las «daily notes» de Obsidian: si ya existe, se abre la de hoy).
 */
export const TEMPLATES: Template[] = [
  {
    id: 'day',
    label: 'Nota del día',
    hint: 'Una por día: lo importante, apuntes y lo de mañana',
    icon: <CalendarDays size={18} strokeWidth={2.2} />,
    title: date,
    content: () => '## Lo importante\n- [ ] \n\n## Apuntes\n\n\n## Para mañana\n- [ ] ',
  },
  {
    id: 'meeting',
    label: 'Reunión',
    hint: 'Asistentes, temas, acuerdos y tareas',
    icon: <Users size={18} strokeWidth={2.2} />,
    title: () => 'Reunión: ',
    content: (t) => `**Fecha:** ${date(t)}\n**Asistentes:** \n\n## Temas\n- \n\n## Acuerdos\n- \n\n## Tareas\n- [ ] `,
  },
  {
    id: 'packing',
    label: 'Maleta',
    hint: 'Lo que no se puede olvidar; «Desmarcar todo» para la próxima',
    icon: <Luggage size={18} strokeWidth={2.2} />,
    title: () => 'Maleta',
    content: () =>
      ['DNI o pasaporte', 'Cargador del móvil', 'Auriculares', 'Cepillo de dientes', 'Medicinas', 'Ropa interior', 'Pijama', 'Gafas de sol'].map((x) => `- [ ] ${x}`).join('\n'),
  },
  {
    id: 'idea',
    label: 'Idea',
    hint: 'Qué es, por qué y el siguiente paso',
    icon: <Lightbulb size={18} strokeWidth={2.2} />,
    title: () => '',
    content: () => '## La idea\n\n\n## Por qué\n\n\n## Siguiente paso\n- [ ] ',
  },
  {
    id: 'list',
    label: 'Lista',
    hint: 'Una lista de casillas para ir marcando',
    icon: <ListChecks size={18} strokeWidth={2.2} />,
    title: () => '',
    content: () => '- [ ] ',
  },
]

/** Crea la nota con la plantilla (la del día, solo si aún no existe) y la abre */
export async function fromTemplate(id: string) {
  const tpl = TEMPLATES.find((x) => x.id === id)
  if (!tpl) return
  const t = today()
  const title = tpl.title(t)
  if (id === 'day') {
    const existing = (await db.notes.toArray()).find((n) => n.title.trim() === title)
    if (existing) return navigate(`/notes/${existing.id}`)
  }
  const n = await createNote({ title, content: tpl.content(t) })
  navigate(`/notes/${n.id}`)
}

export function TemplatePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      <ModalHeader title="Nueva nota con plantilla" onClose={onClose} />
      <ul className="space-y-1 px-3 pb-4">
        {TEMPLATES.map((tpl) => (
          <li key={tpl.id}>
            <button
              type="button"
              onClick={() => {
                onClose()
                void fromTemplate(tpl.id)
              }}
              className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:bg-hover"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-fill text-fg">{tpl.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{tpl.label}</span>
                <span className="block truncate text-[13px] text-muted">{tpl.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

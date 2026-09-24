import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Cake, ChevronLeft, Mail, MessageSquare, Phone, Plus, Trash2, Users, Video, X } from 'lucide-react'
import { db } from '@/db/db'
import { createTask, deletePerson, logInteraction } from '@/db/actions'
import { toastTrashed } from '../trash/undo'
import type { Interaction, Person } from '@/db/types'
import { addDaysYmd, dateLabel, diffDays, relativeDays, today } from '@/lib/dates'
import { nextBirthday } from '@/lib/people'
import { href, navigate } from '@/app/router'
import { toast, ui } from '@/app/store'
import { Button, Card, Empty, Field, Group, IconButton, Input, Section, Select, Textarea, bouncy, cx } from '@/components/ui'
import { Page } from '../Page'
import { Avatar } from './Avatar'
import { CONTACT_OPTIONS } from './PeopleView'

const KINDS: { value: Interaction['kind']; label: string; icon: typeof Phone }[] = [
  { value: 'call', label: 'Llamada', icon: Phone },
  { value: 'message', label: 'Mensaje', icon: MessageSquare },
  { value: 'meeting', label: 'Quedada', icon: Users },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'other', label: 'Videollamada', icon: Video },
]

export function PersonView({ id }: { id: string }) {
  const person = useLiveQuery(() => db.people.get(id), [id])
  const interactions = useLiveQuery(() => db.interactions.where('personId').equals(id).reverse().sortBy('date'), [id]) ?? []
  if (person === undefined) return null
  if (person === null)
    return (
      <Page>
        <Empty icon={<Users size={22} />} title="Persona no encontrada" />
      </Page>
    )
  return <PersonDetail key={person.id} person={person} interactions={interactions} />
}

function useField(person: Person, key: keyof Person) {
  const [value, setValue] = useState(String(person[key] ?? ''))
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => db.people.update(person.id, { [key]: value }), 350)
    return () => clearTimeout(t)
  }, [value, key, person.id])
  return [value, setValue] as const
}

function PersonDetail({ person, interactions }: { person: Person; interactions: Interaction[] }) {
  const t = today()
  const [name, setName] = useField(person, 'name')
  const [company, setCompany] = useField(person, 'company')
  const [role, setRole] = useField(person, 'role')
  const [email, setEmail] = useField(person, 'email')
  const [phone, setPhone] = useField(person, 'phone')
  const [notes, setNotes] = useField(person, 'notes')
  const [kind, setKind] = useState<Interaction['kind']>('call')
  const [summary, setSummary] = useState('')
  const [tagDraft, setTagDraft] = useState('')

  const since = person.lastContact ? diffDays(t, person.lastContact) : undefined
  const overdue = person.contactEvery && (since === undefined || since >= person.contactEvery)
  const bday = person.birthday ? nextBirthday(person.birthday, t) : undefined

  const log = async () => {
    await logInteraction({ personId: person.id, date: t, kind, summary: summary.trim() })
    setSummary('')
    toast(`Contacto con ${person.name} registrado`)
  }

  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#/, '').toLowerCase()
    if (tag && !person.tags.includes(tag)) db.people.update(person.id, { tags: [...person.tags, tag] })
    setTagDraft('')
  }

  const followUp = async () => {
    const task = await createTask({ title: `Hablar con ${person.name}`, dueDate: addDaysYmd(t, 1), tags: ['personas'] })
    ui.openTask(task.id)
  }
  const actions = [
    { label: 'Llamar', icon: Phone, href: phone ? `tel:${phone}` : undefined },
    { label: 'Mensaje', icon: MessageSquare, href: phone ? `sms:${phone}` : undefined },
    { label: 'Email', icon: Mail, href: email ? `mailto:${email}` : undefined },
    { label: 'Seguimiento', icon: Plus, onClick: followUp },
  ]

  return (
    <Page>
      <div className="mb-4 flex items-center">
        <a href={href('/people')} className="inline-flex items-center gap-1 text-[16px] font-medium text-blue">
          <ChevronLeft size={20} strokeWidth={2.4} /> Personas
        </a>
        <IconButton
          label="Eliminar persona"
          filled
          className="ml-auto hover:!text-red"
          onClick={async () => {
            await deletePerson(person.id)
            navigate('/people')
            toastTrashed(`${person.name} en la papelera`, 'people', person.id)
          }}
        >
          <Trash2 size={15} strokeWidth={2.3} />
        </IconButton>
      </div>

      <header className="mb-6 flex flex-col items-center text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={bouncy}>
          <Avatar name={name || '?'} size={96} />
        </motion.div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-3 w-full bg-transparent text-center text-[30px] font-bold tracking-[-0.02em]"
          placeholder="Nombre"
        />
        <p className={cx('text-[14px] font-medium', overdue ? 'text-purple' : 'text-muted')}>
          {person.lastContact ? `Último contacto ${relativeDays(person.lastContact, t)}` : 'Sin contactos registrados'}
          {person.contactEvery ? ` · cada ${person.contactEvery} días` : ''}
        </p>
        <div className="mt-5 grid w-full max-w-md grid-cols-4 gap-2">
          {actions.map((a) => {
            const inner = (
              <>
                <a.icon size={20} strokeWidth={2.2} />
                <span className="text-[12px] font-semibold">{a.label}</span>
              </>
            )
            const cls = cx(
              'glass flex flex-col items-center gap-1 rounded-[16px] py-2.5 transition-transform active:scale-95',
              a.href || a.onClick ? 'text-blue' : 'pointer-events-none text-faint',
            )
            return a.onClick ? (
              <button key={a.label} type="button" onClick={a.onClick} className={cls}>
                {inner}
              </button>
            ) : (
              <a key={a.label} href={a.href} className={cls}>
                {inner}
              </a>
            )
          })}
        </div>
      </header>

      <div className="grid gap-6 @[760px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <Section title="Registrar contacto de hoy" tone="purple">
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={cx(
                      'flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-all active:scale-95',
                      kind === k.value ? 'bg-accent text-white' : 'bg-fill text-fg hover:bg-press',
                    )}
                  >
                    <k.icon size={14} strokeWidth={2.3} /> {k.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={summary} onChange={(e) => setSummary(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && log()} placeholder="¿De qué hablasteis? (opcional)" />
                <Button variant="primary" onClick={log}>
                  Guardar
                </Button>
              </div>
            </Card>
          </Section>

          <Section title="Historial" count={interactions.length}>
            {interactions.length === 0 ? (
              <p className="px-1 text-[14px] text-muted">Aún no hay nada registrado.</p>
            ) : (
              <Group>
                {interactions.map((i) => {
                  const K = KINDS.find((k) => k.value === i.kind) ?? KINDS[4]
                  return (
                    <div key={i.id} className="group relative flex items-start gap-3 px-4 py-3 after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-px after:bg-line last:after:hidden">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--c-purple)_16%,transparent)] text-purple">
                        <K.icon size={15} strokeWidth={2.3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px]">
                          <span className="font-semibold">{K.label}</span>
                          <span className="ml-2 text-[13px] text-muted">{dateLabel(i.date)}</span>
                        </p>
                        {i.summary && <p className="mt-0.5 text-[14px] text-muted">{i.summary}</p>}
                      </div>
                      <button
                        type="button"
                        aria-label="Eliminar"
                        onClick={() => db.interactions.delete(i.id)}
                        className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )
                })}
              </Group>
            )}
          </Section>

          <Section title="Notas" tone="yellow">
            <Group>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Gustos, nombres de hijos, regalos, temas pendientes…"
                rows={4}
                className="px-4 py-3"
              />
            </Group>
          </Section>
        </div>

        <aside className="space-y-4">
          <Card className="space-y-3 p-4">
            <Field label="Empresa o relación">
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </Field>
            <Field label="Cargo">
              <Input value={role} onChange={(e) => setRole(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Cumpleaños">
              <Input type="date" value={person.birthday ?? ''} onChange={(e) => db.people.update(person.id, { birthday: e.target.value || undefined })} />
            </Field>
            {bday && (
              <p className="flex items-center gap-1.5 px-1 text-[13px] font-semibold text-pink">
                <Cake size={14} strokeWidth={2.4} /> {dateLabel(bday.date)} ({relativeDays(bday.date, t)}){bday.age ? ` · cumple ${bday.age}` : ''}
              </p>
            )}
            <Field label="Recordar contactar">
              <Select value={person.contactEvery ?? 0} onChange={(e) => db.people.update(person.id, { contactEvery: Number(e.target.value) || undefined })}>
                {CONTACT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
          <Card className="p-4">
            <p className="mb-2 px-1 text-[12px] font-medium tracking-wide text-muted uppercase">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5">
              {person.tags.map((tag) => (
                <span key={tag} className="inline-flex h-8 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--c-purple)_16%,transparent)] pr-1.5 pl-3 text-[13px] font-semibold text-purple">
                  {tag}
                  <button type="button" aria-label={`Quitar ${tag}`} onClick={() => db.people.update(person.id, { tags: person.tags.filter((x) => x !== tag) })} className="flex h-5 w-5 items-center justify-center rounded-full">
                    <X size={12} strokeWidth={2.6} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                onBlur={addTag}
                placeholder="familia, cliente…"
                className="h-8 w-32 bg-transparent px-1 text-[14px] placeholder:text-faint"
              />
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  )
}

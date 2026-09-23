import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Briefcase, Cake, Mail, MessageSquare, Phone, Plus, Trash2, Users, Video, X } from 'lucide-react'
import { db } from '@/db/db'
import { createTask, deletePerson, logInteraction } from '@/db/actions'
import type { Interaction, Person } from '@/db/types'
import { addDaysYmd, dateLabel, diffDays, relativeDays, today } from '@/lib/dates'
import { nextBirthday } from '@/lib/people'
import { href, navigate } from '@/app/router'
import { toast, ui } from '@/app/store'
import { Button, Card, Empty, Field, IconButton, Input, Select, Textarea, cx } from '@/components/ui'
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

  return (
    <Page>
      <a href={href('/people')} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} /> Personas
      </a>
      <header className="mb-8 flex items-center gap-4 animate-fade-in">
        <Avatar name={name || '?'} size={64} />
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent text-[28px] font-bold tracking-tight"
            placeholder="Nombre"
          />
          <p className={cx('text-[13px]', overdue ? 'text-danger' : 'text-muted')}>
            {person.lastContact ? `Último contacto: ${relativeDays(person.lastContact, t)}` : 'Sin contactos registrados'}
            {person.contactEvery ? ` · objetivo cada ${person.contactEvery} días` : ''}
          </p>
        </div>
        <IconButton
          label="Eliminar persona"
          className="hover:text-danger"
          onClick={async () => {
            if (!confirm(`¿Eliminar a ${person.name}?`)) return
            await deletePerson(person.id)
            navigate('/people')
          }}
        >
          <Trash2 size={16} />
        </IconButton>
      </header>

      <div className="grid gap-6 @[760px]:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-4">
            <h3 className="mb-3 text-[12px] font-semibold tracking-wider text-muted uppercase">Registrar contacto de hoy</h3>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cx(
                    'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors',
                    kind === k.value ? 'bg-accent text-white' : 'bg-hover text-muted hover:text-fg',
                  )}
                >
                  <k.icon size={13} /> {k.label}
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

          <div>
            <div className="mb-2 flex items-center px-1">
              <h3 className="text-[12px] font-semibold tracking-wider text-muted uppercase">Historial</h3>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  const task = await createTask({ title: `Hablar con ${person.name}`, dueDate: addDaysYmd(t, 1), tags: ['personas'] })
                  ui.openTask(task.id)
                }}
              >
                <Plus size={14} /> Tarea de seguimiento
              </Button>
            </div>
            {interactions.length === 0 ? (
              <p className="px-1 text-[13px] text-faint">Aún no hay nada registrado.</p>
            ) : (
              <ol className="relative ml-4 border-l border-line">
                {interactions.map((i) => {
                  const K = KINDS.find((k) => k.value === i.kind) ?? KINDS[4]
                  return (
                    <li key={i.id} className="group relative mb-4 pl-6">
                      <span className="absolute top-0.5 -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted">
                        <K.icon size={12} />
                      </span>
                      <p className="text-[13px]">
                        <span className="font-medium">{K.label}</span>
                        <span className="ml-2 text-muted">{dateLabel(i.date)}</span>
                        <button
                          type="button"
                          aria-label="Eliminar"
                          onClick={() => db.interactions.delete(i.id)}
                          className="ml-2 align-middle text-faint opacity-0 group-hover:opacity-100 hover:text-danger"
                        >
                          <X size={12} />
                        </button>
                      </p>
                      {i.summary && <p className="mt-0.5 text-[13.5px] text-muted">{i.summary}</p>}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div>
            <h3 className="mb-2 px-1 text-[12px] font-semibold tracking-wider text-muted uppercase">Notas</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Gustos, nombres de hijos, regalos, temas pendientes…"
              rows={4}
              className="rounded-xl border border-line bg-surface p-3"
            />
          </div>
        </div>

        <aside className="space-y-4">
          <Card className="space-y-3 p-4">
            <Field label="Empresa / relación">
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </Field>
            <Field label="Cargo">
              <Input value={role} onChange={(e) => setRole(e.target.value)} />
            </Field>
            <Field label="Email">
              <div className="flex gap-1">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                {email && (
                  <a href={`mailto:${email}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hover text-muted hover:text-accent" aria-label="Enviar email">
                    <Mail size={15} />
                  </a>
                )}
              </div>
            </Field>
            <Field label="Teléfono">
              <div className="flex gap-1">
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {phone && (
                  <a href={`tel:${phone}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hover text-muted hover:text-accent" aria-label="Llamar">
                    <Phone size={15} />
                  </a>
                )}
              </div>
            </Field>
            <Field label="Cumpleaños">
              <Input type="date" value={person.birthday ?? ''} onChange={(e) => db.people.update(person.id, { birthday: e.target.value || undefined })} />
            </Field>
            {bday && (
              <p className="flex items-center gap-1.5 text-[12px] text-warn">
                <Cake size={12} /> {dateLabel(bday.date)} ({relativeDays(bday.date, t)}){bday.age ? ` · cumple ${bday.age}` : ''}
              </p>
            )}
            <Field label="Recordar contactar">
              <Select
                value={person.contactEvery ?? 0}
                onChange={(e) => db.people.update(person.id, { contactEvery: Number(e.target.value) || undefined })}
              >
                {CONTACT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-muted uppercase">
              <Briefcase size={12} /> Etiquetas
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {person.tags.map((tag) => (
                <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-lg bg-hover pr-1 pl-2 text-[12.5px]">
                  {tag}
                  <button type="button" aria-label={`Quitar ${tag}`} onClick={() => db.people.update(person.id, { tags: person.tags.filter((x) => x !== tag) })} className="text-muted hover:text-fg">
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                onBlur={addTag}
                placeholder="familia, cliente…"
                className="h-7 w-28 bg-transparent text-[12.5px] placeholder:text-faint"
              />
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  )
}

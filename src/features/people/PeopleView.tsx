import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cake, Plus, Search, Users } from 'lucide-react'
import { db } from '@/db/db'
import { createPerson } from '@/db/actions'
import type { Person } from '@/db/types'
import { dateLabel, relativeDays, today } from '@/lib/dates'
import { dueForContact, upcomingBirthdays } from '@/lib/people'
import { href, navigate } from '@/app/router'
import { setUI, useUI } from '@/app/store'
import { Button, Empty, Field, Input, Modal, ModalHeader, PageHeader, Section, Select } from '@/components/ui'
import { Page } from '../Page'
import { Avatar } from './Avatar'

export const CONTACT_OPTIONS = [
  { value: 0, label: 'Sin recordatorio' },
  { value: 7, label: 'Cada semana' },
  { value: 14, label: 'Cada 2 semanas' },
  { value: 30, label: 'Cada mes' },
  { value: 60, label: 'Cada 2 meses' },
  { value: 90, label: 'Cada 3 meses' },
  { value: 180, label: 'Cada 6 meses' },
  { value: 365, label: 'Cada año' },
]

function PersonRow({ person, right }: { person: Person; right?: React.ReactNode }) {
  return (
    <a href={href(`/people/${person.id}`)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover">
      <Avatar name={person.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{person.name}</p>
        {(person.role || person.company) && (
          <p className="truncate text-[12.5px] text-muted">{[person.role, person.company].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      {right}
    </a>
  )
}

export function PeopleView() {
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), [])
  const creating = useUI((s) => s.creating === 'person')
  const [q, setQ] = useState('')
  const t = today()
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (people ?? []).filter((p) => !s || `${p.name} ${p.company} ${p.role} ${p.tags.join(' ')}`.toLowerCase().includes(s))
  }, [people, q])
  if (!people) return null

  const due = dueForContact(people, t)
  const birthdays = upcomingBirthdays(people, t, 30)

  return (
    <Page>
      <PageHeader
        icon={<Users size={26} className="text-accent" />}
        title="Personas"
        subtitle="Tu gente: familia, amigos, clientes. Que nadie se quede olvidado."
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'person' })}>
            <Plus size={15} /> Nueva
          </Button>
        }
      />

      {people.length === 0 ? (
        <Empty
          icon={<Users size={22} />}
          title="Añade a tu gente"
          hint="Guarda contactos, cumpleaños y cada cuánto quieres hablar con cada uno. NTab te avisará cuando toque."
        />
      ) : (
        <>
          {due.length > 0 && (
            <Section title="Toca contactar" count={due.length} tone="danger">
              {due.map(({ person, days }) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  right={<span className="text-[12px] text-danger">{days === Infinity ? 'Nunca' : `Hace ${days} días`}</span>}
                />
              ))}
            </Section>
          )}
          {birthdays.length > 0 && (
            <Section title="Cumpleaños próximos" count={birthdays.length}>
              {birthdays.map(({ person, date, age }) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  right={
                    <span className="flex items-center gap-1.5 text-[12px] text-warn">
                      <Cake size={13} /> {dateLabel(date)}
                      {age ? ` · cumple ${age}` : ''}
                    </span>
                  }
                />
              ))}
            </Section>
          )}
          <Section title="Todas" count={people.length}>
            <div className="relative mb-2">
              <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, empresa, etiqueta…"
                className="h-9 w-full rounded-lg bg-hover pr-3 pl-8 text-[13.5px] placeholder:text-faint"
              />
            </div>
            {filtered.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                right={p.lastContact && <span className="text-[12px] text-faint">{relativeDays(p.lastContact, t)}</span>}
              />
            ))}
          </Section>
        </>
      )}

      <NewPersonModal open={creating} onClose={() => setUI({ creating: null })} />
    </Page>
  )
}

function NewPersonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <NewPersonForm onClose={onClose} />}
    </Modal>
  )
}

function NewPersonForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [contactEvery, setContactEvery] = useState(0)
  const [birthday, setBirthday] = useState('')
  const save = async () => {
    if (!name.trim()) return
    const p = await createPerson({ name: name.trim(), company, contactEvery: contactEvery || undefined, birthday: birthday || undefined })
    onClose()
    navigate(`/people/${p.id}`)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title="Nueva persona" onClose={onClose} />
      <div className="space-y-4 p-5">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="h-11 text-[15px]" />
        <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Empresa o relación (familia, amigo…)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recordar contactar">
            <Select value={contactEvery} onChange={(e) => setContactEvery(Number(e.target.value))}>
              {CONTACT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cumpleaños">
            <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Crear
        </Button>
      </div>
    </form>
  )
}

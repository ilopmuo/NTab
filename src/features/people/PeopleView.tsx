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
import { Button, Empty, Field, Group, Input, Modal, ModalHeader, PageHeader, Section, Select } from '@/components/ui'
import { SectionIcon, section } from '@/app/sections'
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
    <a
      href={href(`/people/${person.id}`)}
      className="relative flex items-center gap-3 px-4 py-2.5 transition-colors after:absolute after:right-0 after:bottom-0 after:left-[62px] after:h-px after:bg-line last:after:hidden hover:bg-hover active:bg-press"
    >
      <Avatar name={person.name} size={38} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{person.name}</p>
        {(person.role || person.company) && (
          <p className="truncate text-[13px] text-muted">{[person.role, person.company].filter(Boolean).join(' · ')}</p>
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
        icon={<SectionIcon def={section('people')} size={40} />}
        title="Personas"
        subtitle="Tu gente: familia, amigos, clientes. Que nadie se quede olvidado."
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'person' })} className="!bg-purple">
            <Plus size={16} strokeWidth={2.6} /> Nueva
          </Button>
        }
      />

      {people.length === 0 ? (
        <Empty
          color="var(--c-purple)"
          icon={<Users size={28} strokeWidth={2.2} />}
          title="Añade a tu gente"
          hint="Guarda contactos, cumpleaños y cada cuánto quieres hablar con cada uno. NTab te avisará cuando toque."
        />
      ) : (
        <>
          {due.length > 0 && (
            <Section title="Toca hablar con…" count={due.length} tone="purple">
              <Group>
              {due.map(({ person, days }) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  right={<span className="text-[13px] font-semibold text-purple">{days === Infinity ? 'Nunca' : `Hace ${days} días`}</span>}
                />
              ))}
              </Group>
            </Section>
          )}
          {birthdays.length > 0 && (
            <Section title="Cumpleaños" count={birthdays.length} tone="pink">
              <Group>
              {birthdays.map(({ person, date, age }) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  right={
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-pink">
                      <Cake size={14} strokeWidth={2.4} /> {dateLabel(date)}
                      {age ? ` · ${age}` : ''}
                    </span>
                  }
                />
              ))}
              </Group>
            </Section>
          )}
          <Section title="Todas" count={people.length}>
            <div className="relative mb-3">
              <Search size={15} strokeWidth={2.3} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, empresa, etiqueta…"
                className="h-10 w-full rounded-[12px] bg-fill pr-3 pl-9 text-[15px] placeholder:text-muted"
              />
            </div>
            <Group>
              {filtered.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  right={p.lastContact && <span className="text-[13px] text-muted">{relativeDays(p.lastContact, t)}</span>}
                />
              ))}
            </Group>
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
      <div className="flex justify-end gap-2 px-5 pt-1 pb-5">
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

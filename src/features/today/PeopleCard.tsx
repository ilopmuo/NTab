import { Cake, Users } from 'lucide-react'
import type { Person } from '@/db/types'
import { dateLabel, today } from '@/lib/dates'
import { dueForContact, upcomingBirthdays } from '@/lib/people'
import { href } from '@/app/router'
import { Card } from '@/components/ui'
import { Avatar } from '../people/Avatar'

/** Cumpleaños cercanos y gente con la que toca hablar (morado = personas) */
export function PeopleCard({ people }: { people: Person[] }) {
  const t = today()
  const contact = dueForContact(people, t)
  const birthdays = upcomingBirthdays(people, t, 7)
  if (!contact.length && !birthdays.length) return null
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Users size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Personas</h3>
      </div>
      <div className="space-y-0.5">
        {birthdays.map(({ person, date, age }) => (
          <a key={`b-${person.id}`} href={href(`/people/${person.id}`)} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-hover">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-fg">
              <Cake size={15} strokeWidth={2.3} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px]">
              Cumpleaños de <b className="font-semibold">{person.name}</b>
            </span>
            <span className="text-[12px] font-medium text-muted">
              {dateLabel(date)}
              {age ? ` · ${age}` : ''}
            </span>
          </a>
        ))}
        {contact.slice(0, 4).map(({ person, days }) => (
          <a key={person.id} href={href(`/people/${person.id}`)} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-hover">
            <Avatar name={person.name} size={28} />
            <span className="min-w-0 flex-1 truncate text-[14px]">Hablar con {person.name}</span>
            <span className="text-[12px] font-medium text-purple">{days === Infinity ? 'nunca' : `hace ${days} d`}</span>
          </a>
        ))}
      </div>
    </Card>
  )
}

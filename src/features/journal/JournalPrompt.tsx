import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen } from 'lucide-react'
import { db } from '@/db/db'
import { saveJournal } from '@/db/actions'
import { today } from '@/lib/dates'
import { hasContent, moodLabel } from '@/lib/journal'
import { href } from '@/app/router'
import { toast } from '@/app/store'
import { Card } from '@/components/ui'
import { MoodPicker } from './MoodPicker'

/** En Hoy, por la tarde-noche: «¿Qué tal el día?» con un toque */
export function JournalPrompt() {
  const t = today()
  const entry = useLiveQuery(() => db.journal.get(t).then((e) => e ?? null), [t])
  if (entry === undefined || new Date().getHours() < 18 || hasContent(entry ?? undefined)) return null
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">¿Qué tal el día?</h3>
        <a href={href('/journal')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Escribir
        </a>
      </div>
      <MoodPicker
        size="sm"
        onChange={(m) => {
          void saveJournal(t, { mood: m })
          toast(`Apuntado: ${moodLabel(m)?.toLowerCase()}`, { label: 'Escribir algo', run: () => (window.location.hash = '/journal') })
        }}
      />
    </Card>
  )
}

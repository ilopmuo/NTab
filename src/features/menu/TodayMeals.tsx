import { useLiveQuery } from 'dexie-react-hooks'
import { CookingPot } from 'lucide-react'
import { db } from '@/db/db'
import { today } from '@/lib/dates'
import { href } from '@/app/router'
import { Card } from '@/components/ui'

/** En Hoy: qué toca comer y cenar según el menú */
export function TodayMeals() {
  const t = today()
  const data = useLiveQuery(async () => {
    const slots = await db.menu.where('date').equals(t).toArray()
    const recipes = await db.recipes.bulkGet(slots.map((s) => s.recipeId ?? ''))
    return slots.map((s, i) => ({ meal: s.meal, name: recipes[i]?.name ?? s.text ?? '' }))
  }, [t])
  if (!data?.length) return null
  const get = (m: string) => data.find((d) => d.meal === m)?.name
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <CookingPot size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Hoy se come</h3>
        <a href={href('/menu')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Menú
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['comida', 'cena'] as const).map((m) => (
          <div key={m} className="rounded-[12px] bg-fill-2 px-3 py-2">
            <p className="text-[11.5px] font-semibold text-muted">{m === 'comida' ? 'Comida' : 'Cena'}</p>
            <p className="truncate text-[14px] font-semibold">{get(m) ?? '—'}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Flame, Gauge, Lightbulb, Repeat, Scissors, TrendingUp, X } from 'lucide-react'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { createTracker } from '@/db/moreActions'
import { today } from '@/lib/dates'
import { money, type Budget } from '@/lib/expenses'
import { spendingAdvice, type Tip } from '@/lib/advice'
import { averageFlow } from '@/lib/money'
import type { MoneyData } from './data'
import { navigate } from '@/app/router'
import { toast } from '@/app/store'
import { Button, Group } from '@/components/ui'

/** Ajuste `adviceDismissed`: consejo → día en que se descartó */
export type Dismissed = Record<string, string>

const ICON: Record<Tip['kind'], typeof Lightbulb> = {
  pace: Gauge,
  rising: TrendingUp,
  frequent: Repeat,
  small: Scissors,
  limit: Gauge,
  overlap: Repeat,
  savings: Lightbulb,
  weekend: Lightbulb,
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Poner el límite que propone un consejo (con «Deshacer») */
async function applyLimit(budget: Budget, category: string, amount: number, label: string) {
  await setSetting('budget', { ...budget, categories: { ...(budget.categories ?? {}), [category]: amount } } satisfies Budget)
  toast(`Límite de ${label.toLowerCase()}: ${money(amount)} al mes. Te aviso al 80 %`, { label: 'Deshacer', run: () => void setSetting('budget', budget) }, 6000)
}

/** Empezar un reto «Días sin…» (en Hábitos → Última vez, con lo que ahorras cada día) */
async function startChallenge(name: string, costPerDay: number) {
  const exists = (await db.trackers.toArray()).find((t) => t.avoid && !t.archived && t.name.toLowerCase() === name.toLowerCase())
  if (exists) {
    navigate('/trackers')
    return
  }
  const t = await createTracker({ name: cap(name), icon: 'flame', avoid: true, costPerDay })
  toast(`Reto empezado: ${t.name}. Cada día suma ${money(costPerDay)} ahorrados`, { label: 'Ver', run: () => navigate('/trackers') }, 6000)
}

/**
 * Los consejos para gastar menos, cada uno con lo que ahorrarías y su botón:
 * poner el límite, empezar un reto, ver el análisis de esa categoría o los
 * pagos fijos. «No me interesa» lo quita.
 */
export function TipList({ tips, budget, dismissed, labels, linkCategory = true }: { tips: Tip[]; budget: Budget; dismissed: Dismissed; labels: (id: string) => string; /** el enlace al análisis de la categoría (no dentro de ella) */ linkCategory?: boolean }) {
  const dismiss = (t: Tip) => {
    void setSetting('adviceDismissed', { ...dismissed, [t.id]: today() } satisfies Dismissed)
    toast('Consejo quitado', { label: 'Deshacer', run: () => void setSetting('adviceDismissed', dismissed) })
  }
  return (
    <Group>
      {tips.map((t) => {
        const I = ICON[t.kind]
        const a = t.action
        return (
          <div key={t.id} className="px-4 py-3.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
                <I size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{t.title}</p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{t.body}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {a?.kind === 'limit' && (
                    <Button size="sm" variant="secondary" onClick={() => void applyLimit(budget, a.category, a.amount, labels(a.category))}>
                      Poner límite de {money(a.amount)}
                    </Button>
                  )}
                  {a?.kind === 'challenge' && (
                    <Button size="sm" variant="secondary" onClick={() => void startChallenge(a.name, a.costPerDay)}>
                      <Flame size={13} /> Empezar el reto
                    </Button>
                  )}
                  {a?.kind === 'subs' && (
                    <Button size="sm" variant="secondary" onClick={() => navigate('/finance')}>
                      Ver los pagos fijos
                    </Button>
                  )}
                  {linkCategory && t.category && (
                    <button type="button" onClick={() => navigate(`/insights/${t.category}`)} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-blue">
                      Ver {labels(t.category).toLowerCase()} a fondo <ChevronRight size={14} />
                    </button>
                  )}
                  {t.saving !== undefined && t.saving >= 1 && t.kind !== 'pace' && <span className="font-num ml-auto text-[12.5px] font-semibold text-muted">~{money(Math.round(t.saving))}/mes</span>}
                </div>
              </div>
              <button type="button" onClick={() => dismiss(t)} aria-label={`No me interesa: ${t.title}`} title="No me interesa" className="-mt-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg">
                <X size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </Group>
  )
}

/** Los consejos descartados, en vivo */
export function useDismissed(): Dismissed | undefined {
  return useLiveQuery(() => db.settings.get('adviceDismissed').then((r) => (r?.value as Dismissed | undefined) ?? {}), [])
}

/** Los consejos con todo lo del dinero (los pagos fijos, si la función está encendida) */
export function adviceFor(d: MoneyData, t: string, withFixed: boolean) {
  const fixed = withFixed ? d.fixed.total : 0
  const avg = averageFlow(d.expenses, d.incomes, t.slice(0, 7), fixed)
  return spendingAdvice({ expenses: d.expenses, today: t, budget: d.budget, subs: withFixed ? d.subs : [], flow: avg && avg.income > 0 ? avg : undefined })
}

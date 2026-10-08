import { useState } from 'react'
import { m as motion } from 'motion/react'
import { ChevronRight, Lightbulb } from 'lucide-react'
import { setSetting } from '@/db/actions'
import { fmt, today } from '@/lib/dates'
import { CATEGORIES, money, type Budget } from '@/lib/expenses'
import { categoryReport, totalSaving, type Spent } from '@/lib/advice'
import { shiftMonth } from '@/lib/money'
import { navigate } from '@/app/router'
import { toast } from '@/app/store'
import { useFeatures } from '@/app/features'
import { SectionIcon, section } from '@/app/sections'
import { Button, Card, Empty, Group, PageHeader, Section, cx, softSpring } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Page } from '../Page'
import { useMoneyData } from './data'
import { TipList, adviceFor, useDismissed } from './Tips'
import { cat } from '../expenses/ExpenseParts'

const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros'

/**
 * Análisis de gastos: los consejos para gastar menos, cada categoría este mes
 * frente a lo normal y, al tocar una, todo sobre ella (meses, en qué se va,
 * qué días y su límite).
 */
export function InsightsView({ category }: { category?: string }) {
  const data = useMoneyData()
  const dismissed = useDismissed()
  const features = useFeatures()
  const t = today()
  if (!data || !dismissed) return null
  const tips = adviceFor(data, t, features.on('finance'))
  if (category && CATEGORIES.some((c) => c.id === category)) return <CategoryDetail category={category} expenses={data.expenses} budget={data.budget} tips={tips.filter((x) => x.category === category && !dismissed[x.id])} dismissed={dismissed} t={t} />

  const visible = tips.filter((x) => !dismissed[x.id])
  const hidden = tips.filter((x) => dismissed[x.id])
  const save = totalSaving(visible)
  const month = t.slice(0, 7)
  const rows = CATEGORIES.map((c) => {
    const r = categoryReport(data.expenses, c.id, t)
    return { id: c.id, now: r.thisMonth, normal: r.normal }
  })
    .filter((r) => r.now > 0 || r.normal > 0)
    .sort((a, b) => b.now - a.now || b.normal - a.normal)
  const top = Math.max(1, ...rows.map((r) => Math.max(r.now, r.normal)))
  const late = Number(t.slice(8, 10)) >= 25

  return (
    <Page>
      <PageHeader icon={<SectionIcon def={section('insights')} size={40} />} title="Análisis de gastos" subtitle="Dónde se te va el dinero y cómo gastar menos." />
      {!data.expenses.length ? (
        <Group>
          <Empty icon={<Lightbulb size={28} strokeWidth={2.2} />} color="var(--c-blue)" title="Aún no hay gastos que analizar" hint="Con unas semanas de gastos apuntados (o traídos del banco), LUNO te dirá en qué se te va el dinero y cómo gastar menos." />
        </Group>
      ) : (
        <>
          {save >= 10 && (
            <Card className="mb-8 p-5">
              <p className="text-[13px] font-semibold text-muted">Con estos consejos podrías ahorrar</p>
              <p className="font-num mt-1 text-[36px] leading-none font-bold tracking-tight">{money(save)} al mes</p>
              <p className="mt-2 text-[13px] text-muted">Unos {money(save * 12)} al año, sin contar lo que dejes de pasarte de los límites.</p>
            </Card>
          )}
          <Section title="Consejos" count={visible.length}>
            {visible.length ? (
              <TipList tips={visible} budget={data.budget} dismissed={dismissed} labels={label} />
            ) : (
              <p className="px-1 text-[14px] text-muted">Nada que mejorar ahora mismo. Vas bien 👏</p>
            )}
            {hidden.length > 0 && (
              <button
                type="button"
                onClick={() => void setSetting('adviceDismissed', Object.fromEntries(Object.entries(dismissed).filter(([id]) => !hidden.some((h) => h.id === id))))}
                className="mt-2 px-1 text-[13px] font-semibold text-blue"
              >
                Volver a ver {hidden.length === 1 ? 'el descartado' : `los ${hidden.length} descartados`}
              </button>
            )}
          </Section>
          <Section title="Este mes frente a lo normal" action={<span className="text-[13px] text-muted capitalize">{fmt(`${month}-01`, 'MMMM')}</span>}>
            <Group>
              {rows.map((r) => {
                const diff = r.normal > 0 ? Math.round(((r.now - r.normal) / r.normal) * 100) : undefined
                return (
                  <button key={r.id} type="button" onClick={() => navigate(`/insights/${r.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill">
                      <Icon name={cat(r.id).icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 text-[14.5px]">
                        <span className="truncate font-medium">{label(r.id)}</span>
                        <span className="font-num shrink-0 font-semibold">{money(Math.round(r.now))}</span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-fill">
                        <motion.span className={cx('block h-full rounded-full', r.now > r.normal * 1.2 && r.normal > 0 ? 'bg-fg' : 'bg-blue')} initial={{ width: 0 }} animate={{ width: `${(r.now / top) * 100}%` }} transition={softSpring} />
                      </span>
                      <span className="mt-1 block text-[12.5px] text-muted">
                        {/* A mitad de mes, «menos que lo normal» no dice nada: solo lo que ya se pasa, o al final */}
                        {r.normal > 0 ? `Lo normal: ${money(Math.round(r.normal))} al mes${diff !== undefined && Math.abs(diff) >= 10 && (diff > 0 || late) ? ` · ${diff > 0 ? '+' : '−'}${Math.abs(diff)} %` : ''}` : 'Nuevo este mes'}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-faint" />
                  </button>
                )
              })}
            </Group>
          </Section>
        </>
      )}
    </Page>
  )
}

function CategoryDetail({ category, expenses, budget, tips, dismissed, t }: { category: string; expenses: Spent[]; budget: Budget; tips: ReturnType<typeof adviceFor>; dismissed: Record<string, string>; t: string }) {
  const r = categoryReport(expenses, category, t)
  const limit = budget.categories?.[category] ?? 0
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(limit ? String(limit) : String(Math.max(10, Math.round((r.normal * 0.9) / 10) * 10)))
  const max = Math.max(1, ...r.months.map((m) => m.total), limit)
  const topNote = Math.max(1, ...r.notes.map((n) => n.total))
  const topDay = Math.max(1, ...r.days.map((d) => d.total))
  const saveLimit = async () => {
    const n = Math.round(Number(value.replace(',', '.')))
    const categories = { ...(budget.categories ?? {}) }
    if (n > 0) categories[category] = n
    else delete categories[category]
    await setSetting('budget', { ...budget, categories } satisfies Budget)
    setEditing(false)
    toast(n > 0 ? `Límite de ${r.label.toLowerCase()}: ${money(n)} al mes` : 'Límite quitado', { label: 'Deshacer', run: () => void setSetting('budget', budget) })
  }
  return (
    <Page>
      <PageHeader
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill">
            <Icon name={cat(category).icon} size={20} />
          </span>
        }
        title={r.label}
        subtitle={`Este mes ${money(Math.round(r.thisMonth))}${r.normal ? ` · lo normal, ${money(Math.round(r.normal))}` : ''}`}
      />
      <Card className="mb-8 p-4">
        <div className="relative flex h-32 items-end gap-2" role="img" aria-label={`Últimos meses: ${r.months.map((m) => `${fmt(`${m.month}-01`, 'MMMM')} ${money(Math.round(m.total))}`).join(', ')}`}>
          {limit > 0 && <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-fg/40" style={{ bottom: `calc(20px + (100% - 20px) * ${limit / max})` }} />}
          {r.months.map((m, i) => (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <motion.span
                className={cx('w-full max-w-10 rounded-[6px]', i === r.months.length - 1 ? (limit && m.total > limit ? 'bg-fg' : 'bg-blue') : 'bg-fill-2')}
                style={{ minHeight: m.total > 0 ? 4 : 2 }}
                initial={{ height: 0 }}
                animate={{ height: `calc((100% - 20px) * ${m.total / max})` }}
                transition={{ ...softSpring, delay: i * 0.03 }}
              />
              <span className={cx('h-4 text-[11.5px] capitalize', i === r.months.length - 1 ? 'font-bold text-fg' : 'text-muted')}>{fmt(`${m.month}-01`, 'MMM').replace('.', '')}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
          <div>
            <p className="text-[12px] font-semibold text-muted">Compras (90 días)</p>
            <p className="font-num text-[18px] font-bold">{r.count}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-muted">De media</p>
            <p className="font-num text-[18px] font-bold">{money(r.ticket)}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-muted">Límite</p>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveLimit()
                }}
                className="mt-0.5 flex items-center justify-center gap-1"
              >
                <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" aria-label={`Límite de ${r.label} al mes (€)`} className="font-num h-8 w-16 rounded-lg bg-fill px-2 text-right text-[14px] font-semibold" />
                <Button size="sm" variant="primary" type="submit">
                  OK
                </Button>
              </form>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="font-num text-[18px] font-bold text-blue">
                {limit ? money(limit) : 'Poner'}
              </button>
            )}
          </div>
        </div>
      </Card>

      {tips.length > 0 && (
        <Section title="Consejos">
          <TipList tips={tips} budget={budget} dismissed={dismissed} labels={label} linkCategory={false} />
        </Section>
      )}

      {r.notes.length > 0 && (
        <Section title="En qué se va" action={<span className="text-[13px] text-muted">Últimos 90 días</span>}>
          <Card className="space-y-3 p-4">
            {r.notes.map((n) => (
              <div key={n.note}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[14px]">
                  <span className="min-w-0 truncate">{n.note}</span>
                  <span className="font-num shrink-0">
                    <span className="font-semibold">{money(Math.round(n.total))}</span> <span className="text-[12.5px] text-muted">· {n.count === 1 ? 'una vez' : `${n.count} veces`}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                  <motion.div className="h-full rounded-full bg-blue" initial={{ width: 0 }} animate={{ width: `${(n.total / topNote) * 100}%` }} transition={softSpring} />
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {r.count >= 4 && (
        <Section title="Qué días">
          <Card className="p-4">
            <div className="flex h-24 items-end gap-2" role="img" aria-label={`Por día de la semana: ${r.days.map((d) => `${d.day} ${money(Math.round(d.total))}`).join(', ')}`}>
              {r.days.map((d) => (
                <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <motion.span className="w-full max-w-8 rounded-[5px] bg-fill-2" style={{ minHeight: d.total > 0 ? 3 : 2 }} initial={{ height: 0 }} animate={{ height: `calc((100% - 20px) * ${d.total / topDay})` }} transition={softSpring} />
                  <span className="h-4 text-[11px] text-muted capitalize">{d.day}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      )}
      <p className="px-1 text-[12.5px] text-muted">
        Mes anterior: {money(Math.round(r.months[4].total))} en {fmt(`${shiftMonth(t.slice(0, 7), -1)}-01`, 'MMMM')}.
      </p>
    </Page>
  )
}

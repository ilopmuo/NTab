import { useState } from 'react'
import { m as motion } from 'motion/react'
import { Landmark, Plus } from 'lucide-react'
import type { Account } from '@/db/types'
import { setSetting } from '@/db/actions'
import { diffDays, fmt, today } from '@/lib/dates'
import { money } from '@/lib/expenses'
import { averageFlow } from '@/lib/money'
import { GROUPS, debtPlan, emergencyFund, financialIndependence, groupOf, investable, isDebt, kindOf, monthsFrom, netWorth, netWorthSeries, type DebtMethod } from '@/lib/wealth'
import { setUI, useUI, ui } from '@/app/store'
import { useFeatures } from '@/app/features'
import { SectionIcon, section } from '@/app/sections'
import { Button, Card, Empty, Group, PageHeader, Section, Segmented, cx, softSpring } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Page } from '../Page'
import { useMoneyData, readEuros, type MoneyData, type MoneyPrefs } from './data'
import { AccountForm, BalancesForm } from './AccountForm'
import { shiftMonth, signed } from './MoneyParts'

const years = (months: number) => {
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y && `${y} ${y === 1 ? 'año' : 'años'}`, m && `${m} ${m === 1 ? 'mes' : 'meses'}`].filter(Boolean).join(' y ') || 'ya'
}
const monthName = (ym: string) => fmt(`${ym}-01`, "MMMM 'de' yyyy")

/**
 * Cuentas y patrimonio (como el balance de Monarch o la pestaña de
 * patrimonio de las plantillas de Excel): lo que tienes y lo que debes, cómo
 * crece, el colchón para imprevistos, el plan para salir de deudas y cuánto
 * te falta para vivir de tus ahorros.
 */
export function AccountsView() {
  const data = useMoneyData()
  const creating = useUI((s) => s.creating === 'account')
  const [editing, setEditing] = useState<Account | undefined>()
  const [balances, setBalances] = useState(false)
  const t = today()
  if (!data) return null
  const accounts = data.accounts.filter((a) => !a.archived)

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('accounts')} size={40} />}
        title="Cuentas"
        subtitle="Lo que tienes, lo que debes y cómo crece tu patrimonio."
        actions={
          <>
            {accounts.length > 0 && (
              <Button variant="secondary" onClick={() => setBalances(true)}>
                Saldos de hoy
              </Button>
            )}
            <Button variant="primary" onClick={() => ui.create('account')}>
              <Plus size={15} /> Nueva
            </Button>
          </>
        }
      />

      {accounts.length === 0 ? (
        <Group>
          <Empty
            icon={<Landmark size={28} strokeWidth={2.2} />}
            color="var(--c-blue)"
            title="Todo lo que tienes y lo que debes"
            hint="Apunta tus cuentas, inversiones, la casa o el coche y tus deudas (hipoteca, préstamos, tarjetas): verás tu patrimonio neto, cómo crece cada mes, tu colchón y el plan para salir de deudas."
          >
            <Button variant="primary" onClick={() => ui.create('account')}>
              Añadir la primera
            </Button>
          </Empty>
        </Group>
      ) : (
        <div className="grid gap-x-8 @[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <NetWorthCard accounts={accounts} t={t} />
            {GROUPS.map((g) => {
              const list = accounts.filter((a) => groupOf(a.kind) === g.id)
              if (!list.length) return null
              const total = list.reduce((s, a) => s + a.balance, 0)
              return (
                <Section key={g.id} title={g.label} action={<span className="font-num text-[14px] font-semibold text-muted">{money(Math.round(total))}</span>}>
                  <Group>
                    {list.map((a) => (
                      <AccountRow key={a.id} a={a} t={t} onClick={() => setEditing(a)} />
                    ))}
                  </Group>
                </Section>
              )
            })}
          </div>
          <div className="min-w-0">
            <Plans data={data} accounts={accounts} t={t} />
          </div>
        </div>
      )}

      <AccountForm open={creating} onClose={() => setUI({ creating: null })} />
      <AccountForm open={!!editing} account={editing} onClose={() => setEditing(undefined)} />
      <BalancesForm open={balances} accounts={accounts} onClose={() => setBalances(false)} />
    </Page>
  )
}

function AccountRow({ a, t, onClick }: { a: Account; t: string; onClick: () => void }) {
  const k = kindOf(a.kind)
  const last = a.history?.at(-1)?.date
  const old = last ? diffDays(t, last) : 0
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill">
        <Icon name={k.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{a.name}</span>
        <span className="block truncate text-[12.5px] text-muted">
          {[k.label, isDebt(a.kind) && a.rate !== undefined && `${String(a.rate).replace('.', ',')} %`, isDebt(a.kind) && a.payment && `${money(a.payment)}/mes`, old > 45 && `sin actualizar desde ${fmt(last!, 'd MMM')}`].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="font-num text-[15px] font-semibold">{isDebt(a.kind) ? `−${money(a.balance)}` : money(a.balance)}</span>
    </button>
  )
}

/** Patrimonio neto con su evolución de los últimos 12 meses */
function NetWorthCard({ accounts, t }: { accounts: Account[]; t: string }) {
  const nw = netWorth(accounts)
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(t.slice(0, 7), i - 11))
  const series = netWorthSeries(accounts, months, t)
  const prev = series.at(-2)
  const first = series[0]
  const max = Math.max(...series.map((s) => s.net), 0)
  const min = Math.min(...series.map((s) => s.net), 0)
  const span = max - min || 1
  const zero = (max / span) * 100
  return (
    <Card className="mb-8 p-5">
      <p className="text-[13px] font-semibold text-muted">Patrimonio neto</p>
      <motion.p key={nw.net} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className={cx('font-num mt-1 text-[40px] leading-none font-bold tracking-tight', nw.net < 0 && 'text-red')}>
        {money(Math.round(nw.net))}
      </motion.p>
      <p className="mt-2 text-[13px] text-muted">
        {[prev && `${signed(nw.net - prev.net)} este mes`, first && series.length > 2 && first !== prev && `${signed(nw.net - first.net)} desde ${fmt(`${first.month}-01`, 'MMMM')}`].filter(Boolean).join(' · ') || 'Actualiza los saldos cada mes para ver cómo crece'}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <div>
          <p className="text-[12px] font-semibold text-muted">Tienes</p>
          <p className="font-num text-[19px] font-bold">{money(Math.round(nw.assets))}</p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-muted">Debes</p>
          <p className="font-num text-[19px] font-bold">{money(Math.round(nw.debts))}</p>
        </div>
      </div>
      {series.length >= 2 && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="relative flex h-24 items-stretch gap-1" role="img" aria-label={`Patrimonio de los últimos meses: ${series.map((s) => `${fmt(`${s.month}-01`, 'MMMM')} ${money(Math.round(s.net))}`).join(', ')}`}>
            {min < 0 && <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${zero}%` }} />}
            {series.map((s, i) => {
              const h = (Math.abs(s.net) / span) * 100
              const last = i === series.length - 1
              return (
                <div key={s.month} className="relative min-w-0 flex-1">
                  <motion.span
                    className={cx('absolute inset-x-0 mx-auto max-w-7 rounded-[4px]', last ? 'bg-blue' : s.net < 0 ? 'bg-red/50' : 'bg-fill-2')}
                    style={s.net >= 0 ? { bottom: `${100 - zero}%` } : { top: `${zero}%` }}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(h, 2)}%` }}
                    transition={{ ...softSpring, delay: i * 0.03 }}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex gap-1">
            {series.map((s, i) => (
              <span key={s.month} className={cx('min-w-0 flex-1 text-center text-[10.5px] capitalize', i === series.length - 1 ? 'font-bold text-fg' : 'text-muted')}>
                {fmt(`${s.month}-01`, 'MMM').replace('.', '').slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/** Colchón, deudas e independencia financiera */
function Plans({ data, accounts, t }: { data: MoneyData; accounts: Account[]; t: string }) {
  const features = useFeatures()
  const prefs = data.prefs
  const setPrefs = (p: MoneyPrefs) => void setSetting('moneyPrefs', { ...prefs, ...p })
  const fixed = features.on('finance') ? data.fixed.total : 0
  const avg = averageFlow(data.expenses, data.incomes, t.slice(0, 7), fixed)
  // Lo que se va en un mes normal: la media de los últimos meses o, sin datos, el presupuesto y los fijos
  const monthlyOut = avg?.out || (data.budget.monthly ? data.budget.monthly + fixed : 0)
  const fund = emergencyFund(accounts, monthlyOut)
  const debts = accounts.filter((a) => isDebt(a.kind) && a.balance > 0)
  return (
    <>
      {fund.liquid > 0 || monthlyOut > 0 ? <EmergencyCard fund={fund} hasSpend={monthlyOut > 0} /> : null}
      {debts.length > 0 && <DebtCard debts={debts} prefs={prefs} setPrefs={setPrefs} t={t} />}
      <FireCard accounts={accounts} avg={avg} monthlyOut={monthlyOut} prefs={prefs} setPrefs={setPrefs} t={t} />
    </>
  )
}

function EmergencyCard({ fund, hasSpend }: { fund: ReturnType<typeof emergencyFund>; hasSpend: boolean }) {
  const months = fund.months ?? 0
  const pct = Math.min(1, months / fund.goal)
  const ok = months >= 3
  return (
    <Section title="Colchón para imprevistos">
      <Card className="p-4">
        {hasSpend ? (
          <>
            <p className="text-[14px]">
              Con lo que tienes disponible (<span className="font-num font-semibold">{money(Math.round(fund.liquid))}</span>) podrías vivir{' '}
              <span className="font-num text-[17px] font-bold">{months >= 10 ? Math.round(months) : months.toFixed(1).replace('.', ',')} meses</span> sin ingresos.
            </p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fill" role="meter" aria-label="Meses de colchón" aria-valuemin={0} aria-valuemax={fund.goal} aria-valuenow={Math.round(months * 10) / 10}>
              <motion.div className={cx('h-full rounded-full', pct >= 1 ? 'bg-green' : 'bg-blue')} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={softSpring} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-faint">
              <span>0</span>
              <span>3 meses</span>
              <span>6 meses</span>
            </div>
            <p className="mt-2 text-[13px] text-muted">
              {pct >= 1 ? 'Tienes el colchón completo: lo que pase de aquí puede ir a invertir.' : `Para 6 meses te faltan ${money(Math.round(fund.missing))}${ok ? ' (lo mínimo, 3, ya lo tienes).' : '. Lo aconsejable es tener entre 3 y 6.'}`}
            </p>
          </>
        ) : (
          <p className="text-[14px] text-muted">Apunta tus gastos (o pon un presupuesto) para saber cuántos meses te cubre el dinero disponible.</p>
        )}
      </Card>
    </Section>
  )
}

function DebtCard({ debts, prefs, setPrefs, t }: { debts: Account[]; prefs: MoneyPrefs; setPrefs: (p: MoneyPrefs) => void; t: string }) {
  const method: DebtMethod = prefs.debtMethod ?? 'snowball'
  const [extra, setExtra] = useState(prefs.debtExtra ? String(prefs.debtExtra) : '')
  const extraValue = Math.max(0, readEuros(extra || '0') || 0)
  const plan = debtPlan(debts, extraValue, method)
  const other = debtPlan(debts, extraValue, method === 'snowball' ? 'avalanche' : 'snowball')
  const minimum = debtPlan(debts, 0, method, false)
  const missing = debts.filter((d) => !d.payment)
  const total = debts.reduce((s, d) => s + d.balance, 0)
  return (
    <Section title="Salir de deudas" action={<span className="font-num text-[14px] font-semibold text-muted">{money(Math.round(total))}</span>}>
      <Card className="p-4">
        <Segmented<DebtMethod>
          value={method}
          onChange={(v) => setPrefs({ debtMethod: v })}
          options={[
            { value: 'snowball', label: 'Bola de nieve' },
            { value: 'avalanche', label: 'Avalancha' },
          ]}
          className="w-full"
        />
        <p className="mt-2 text-[12.5px] text-muted">{method === 'snowball' ? 'Primero la más pequeña: cada deuda que acabas te anima y su cuota pasa a la siguiente.' : 'Primero la de interés más alto: es la que menos intereses te hace pagar.'}</p>
        <label className="mt-3 flex items-center gap-3 rounded-xl bg-fill-2 py-1 pr-1 pl-3 text-[14px]">
          <span className="flex-1">Además de las cuotas, al mes</span>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onBlur={() => setPrefs({ debtExtra: extraValue || undefined })}
            inputMode="decimal"
            placeholder="0 €"
            aria-label="Dinero de más al mes para las deudas (€)"
            className="font-num h-9 w-24 rounded-lg bg-surface px-3 text-right font-semibold"
          />
        </label>
        {plan.payoffs.length ? (
          <>
            <p className="mt-4 text-[14px]">
              {plan.months !== undefined ? (
                <>
                  Sin deudas en <span className="font-semibold">{monthName(monthsFrom(t, plan.months))}</span> ({years(plan.months)}), con <span className="font-num font-semibold">{money(Math.round(plan.interest))}</span> de intereses.
                </>
              ) : (
                'Con estas cuotas alguna deuda no se acaba nunca: la cuota no cubre los intereses.'
              )}
            </p>
            {plan.months !== undefined && minimum.months !== undefined && minimum.interest - plan.interest >= 1 && (
              <p className="mt-1 text-[13px] text-muted">
                Pagando solo las cuotas: {years(minimum.months)} y {money(Math.round(minimum.interest))} de intereses. Te ahorras {money(Math.round(minimum.interest - plan.interest))}
                {minimum.months > plan.months ? ` y ${years(minimum.months - plan.months)}` : ''}.
              </p>
            )}
            {other.months !== undefined && plan.months !== undefined && plan.interest - other.interest >= 5 && (
              <p className="mt-1 text-[13px] text-muted">Con la {method === 'snowball' ? 'avalancha' : 'bola de nieve'} pagarías {money(Math.round(plan.interest - other.interest))} menos de intereses.</p>
            )}
            <ol className="mt-3 space-y-1.5 border-t border-line pt-3">
              {plan.payoffs.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 text-[14px]">
                  <span className="font-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill text-[12px] font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-[13px] text-muted">{fmt(`${monthsFrom(t, p.month)}-01`, 'MMM yyyy').replace('.', '')}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-4 text-[14px] text-muted">Pon la cuota al mes de cada deuda para ver cuándo acabas.</p>
        )}
        {missing.length > 0 && plan.payoffs.length > 0 && <p className="mt-3 text-[12.5px] text-muted">Sin cuota, fuera del plan: {missing.map((d) => d.name).join(', ')}.</p>}
      </Card>
    </Section>
  )
}

function FireCard({ accounts, avg, monthlyOut, prefs, setPrefs, t }: { accounts: Account[]; avg: ReturnType<typeof averageFlow>; monthlyOut: number; prefs: MoneyPrefs; setPrefs: (p: MoneyPrefs) => void; t: string }) {
  const ret = prefs.fireReturn ?? 0.05
  const invested = investable(accounts)
  if (!monthlyOut)
    return (
      <Section title="Independencia financiera">
        <Card className="p-4">
          <p className="text-[14px] text-muted">Con tus gastos y tus ingresos de unos meses, LUNO calcula cuánto necesitarías para vivir de tus ahorros (la regla del 4 %) y cuándo llegarías.</p>
        </Card>
      </Section>
    )
  const saving = avg && avg.income > 0 ? avg.saved : 0
  const f = financialIndependence({ annualSpend: monthlyOut * 12, invested, monthlySaving: saving, realReturn: ret })
  return (
    <Section title="Independencia financiera">
      <Card className="p-4">
        <p className="text-[14px]">
          Para vivir de tus ahorros necesitarías unos <span className="font-num font-bold">{money(Math.round(f.target / 1000) * 1000)}</span>: 25 veces lo que gastas al año.
        </p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fill" role="meter" aria-label="Camino a la independencia financiera" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.progress * 100)}>
          <motion.div className="h-full rounded-full bg-blue" initial={{ width: 0 }} animate={{ width: `${Math.min(100, f.progress * 100)}%` }} transition={softSpring} />
        </div>
        <p className="mt-1.5 text-[13px] text-muted">
          Llevas el <span className="font-num font-semibold text-fg">{Math.round(f.progress * 100)} %</span> ({money(Math.round(invested))} sin contar casa ni coche)
        </p>
        <p className="mt-3 text-[14px]">
          {f.months === 0
            ? '¡Ya podrías vivir de tus ahorros!'
            : f.months !== undefined
              ? (
                <>
                  Ahorrando {money(Math.round(saving))} al mes (tu media) llegarías en <span className="font-semibold">{monthName(monthsFrom(t, f.months))}</span> ({years(f.months)}).
                  {f.gainPer100 ? ` Cada 100 € más al mes lo adelanta ${years(f.gainPer100)}.` : ''}
                </>
              )
              : saving > 0
                ? 'A este ritmo no llegarías: prueba a ahorrar algo más cada mes.'
                : 'Apunta tus ingresos para saber cuánto ahorras al mes y cuándo llegarías.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12.5px] text-muted">
          <span>Rentabilidad por encima de la inflación:</span>
          <Segmented<number>
            value={ret}
            onChange={(v) => setPrefs({ fireReturn: v })}
            options={[
              { value: 0.03, label: '3 %' },
              { value: 0.05, label: '5 %' },
              { value: 0.07, label: '7 %' },
            ]}
          />
        </div>
      </Card>
    </Section>
  )
}

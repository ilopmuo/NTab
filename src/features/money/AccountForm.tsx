import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import type { Account, AccountKind } from '@/db/types'
import { saveAccount, setBalances } from './accountActions'
import { fmt } from '@/lib/dates'
import { money } from '@/lib/expenses'
import { ACCOUNT_KINDS, GROUPS, isDebt, kindOf } from '@/lib/wealth'
import { toast } from '@/app/store'
import { Button } from '@/components/ui'
import { Field, Input, Select } from '@/components/form'
import { Modal, ModalHeader } from '@/components/Modal'
import { readEuros } from './data'

/** Nueva cuenta, bien o deuda, o editar una */
export function AccountForm({ open, account, onClose }: { open: boolean; account?: Account; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Fields key={account?.id ?? 'new'} account={account} onClose={onClose} />}
    </Modal>
  )
}

const num = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','))

function Fields({ account, onClose }: { account?: Account; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank')
  const [balance, setBalance] = useState(num(account?.balance))
  const [rate, setRate] = useState(num(account?.rate))
  const [payment, setPayment] = useState(num(account?.payment))
  const [notes, setNotes] = useState(account?.notes ?? '')
  const debt = isDebt(kind)
  const value = readEuros(balance || '0')
  const valid = Number.isFinite(value) && value >= 0
  const save = async () => {
    if (!valid) return
    const r = readEuros(rate)
    const p = readEuros(payment)
    await saveAccount(
      {
        name: name.trim() || kindOf(kind).label,
        kind,
        balance: Math.round(value * 100) / 100,
        rate: debt && r >= 0 && Number.isFinite(r) && rate.trim() ? r : undefined,
        payment: debt && p > 0 ? Math.round(p * 100) / 100 : undefined,
        notes: notes.trim() || undefined,
      },
      account?.id,
    )
    onClose()
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={account ? account.name : 'Nueva cuenta, bien o deuda'} onClose={onClose} />
      <div className="max-h-[68vh] space-y-4 overflow-y-auto p-5">
        <Field label="Qué es">
          <Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {GROUPS.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {ACCOUNT_KINDS.filter((k) => k.group === g.id).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Nombre">
          <Input autoFocus={!account} value={name} onChange={(e) => setName(e.target.value)} placeholder={debt ? 'Ej. Hipoteca, préstamo del coche' : 'Ej. BBVA, Indexa, efectivo'} />
        </Field>
        <Field label={debt ? 'Lo que debes ahora (€)' : 'Lo que hay ahora (€)'}>
          <Input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        {debt && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interés anual (TIN %)">
              <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="Ej. 3,5" />
            </Field>
            <Field label="Cuota al mes (€)">
              <Input value={payment} onChange={(e) => setPayment(e.target.value)} inputMode="decimal" placeholder="Ej. 450" />
            </Field>
          </div>
        )}
        <Field label="Notas">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="IBAN, a quién, condiciones…" />
        </Field>
        {account?.history && account.history.length > 1 && (
          <div>
            <p className="mb-1.5 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Últimos saldos</p>
            <ul className="space-y-1 rounded-xl bg-fill-2 px-3 py-2 text-[13.5px]">
              {[...account.history]
                .reverse()
                .slice(0, 6)
                .map((h) => (
                  <li key={h.date} className="flex justify-between">
                    <span className="text-muted">{fmt(h.date, 'd MMM yyyy')}</span>
                    <span className="font-num font-semibold">{money(h.balance)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {account && (
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              await db.accounts.delete(account.id)
              onClose()
              toast(`«${account.name}» borrada`, { label: 'Deshacer', run: () => void db.accounts.put(account) })
            }}
          >
            <Trash2 size={15} /> Borrar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {account ? 'Guardar' : 'Añadir'}
        </Button>
      </div>
    </form>
  )
}

/**
 * Los saldos de hoy de todas las cuentas a la vez (el ritual de fin de mes de
 * la hoja de patrimonio): se rellena en un minuto y la evolución sale sola.
 */
export function BalancesForm({ open, accounts, onClose }: { open: boolean; accounts: Account[]; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <BalanceFields accounts={accounts} onClose={onClose} />}
    </Modal>
  )
}

function BalanceFields({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, num(a.balance)])))
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const changes = accounts.map((a) => ({ id: a.id, balance: Math.round(readEuros(values[a.id] || '0') * 100) / 100 })).filter((v) => Number.isFinite(v.balance) && v.balance >= 0)
        await setBalances(changes)
        onClose()
        toast('Saldos al día')
      }}
    >
      <ModalHeader title="Saldos de hoy" onClose={onClose} />
      <div className="max-h-[68vh] space-y-2 overflow-y-auto p-5">
        <p className="mb-2 px-1 text-[13px] text-muted">Una vez al mes basta: así ves cómo crece tu patrimonio.</p>
        {accounts.map((a) => (
          <label key={a.id} className="flex items-center gap-3 rounded-xl bg-fill-2 py-1 pr-1 pl-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{a.name}</span>
              <span className="block truncate text-[12px] text-muted">{kindOf(a.kind).label}</span>
            </span>
            <input
              value={values[a.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
              inputMode="decimal"
              aria-label={`Saldo de ${a.name} (€)`}
              className="font-num h-10 w-32 rounded-lg bg-surface px-3 text-right text-[15px] font-semibold"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary">
          Guardar
        </Button>
      </div>
    </form>
  )
}

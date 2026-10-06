import { db } from '@/db/db'
import type { Account } from '@/db/types'
import { uid } from '@/lib/id'
import { today } from '@/lib/dates'
import { withBalance } from '@/lib/wealth'

// Fuera de db/actions para no cargar el patrimonio al arrancar

/** Cuenta nueva o cambios en una: si cambia el saldo, queda en su historial de hoy */
export async function saveAccount(data: Partial<Account> & Pick<Account, 'name' | 'kind' | 'balance'>, id?: string): Promise<string> {
  const t = today()
  if (id) {
    const a = await db.accounts.get(id)
    if (!a) return id
    await db.accounts.update(id, { ...data, ...(data.balance !== a.balance || !a.history?.length ? withBalance(a, data.balance, t) : {}), updatedAt: Date.now() })
    return id
  }
  const order = ((await db.accounts.orderBy('order').last())?.order ?? 0) + 1
  const a: Account = { id: uid(), order, createdAt: Date.now(), updatedAt: Date.now(), ...data, ...withBalance({ balance: 0 }, data.balance, t) }
  await db.accounts.add(a)
  return a.id
}

/** Saldo de hoy de varias cuentas a la vez (la revisión del mes) */
export async function setBalances(values: { id: string; balance: number }[]) {
  const t = today()
  await db.transaction('rw', db.accounts, async () => {
    for (const v of values) {
      const a = await db.accounts.get(v.id)
      if (a && a.balance !== v.balance) await db.accounts.update(v.id, { ...withBalance(a, v.balance, t), updatedAt: Date.now() })
    }
  })
}

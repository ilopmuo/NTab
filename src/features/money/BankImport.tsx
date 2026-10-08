import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { db } from '@/db/db'
import type { Expense, Income } from '@/db/types'
import { uid } from '@/lib/id'
import { classifyNote, money, type ExpenseRules } from '@/lib/expenses'
import { incomeCat, incomeCategoryFor } from '@/lib/money'
import { parseBank, readTable, withoutKnown, type BankRow } from '@/lib/bankImport'
import { dateLabel } from '@/lib/dates'
import { toast } from '@/app/store'
import { Button, cx } from '@/components/ui'
import { Modal, ModalHeader } from '@/components/Modal'
import { Textarea } from '@/components/form'
import { cat } from '../expenses/ExpenseParts'

/**
 * Traer los movimientos del banco (lo que hacen Fintonic o Monarch con la
 * conexión al banco, pero con el extracto): el Excel o CSV que se descarga de
 * la web del banco, o las filas copiadas de una hoja de cálculo. Vista previa,
 * sin repetir lo ya apuntado y con «Deshacer».
 */
export function BankImport({ open, onClose, expenses, incomes, rules }: { open: boolean; onClose: () => void; expenses: Expense[]; incomes: Income[]; rules: ExpenseRules }) {
  return (
    <Modal open={open} onClose={onClose} position="center" className="sm:max-w-2xl">
      {open && <Importer onClose={onClose} expenses={expenses} incomes={incomes} rules={rules} />}
    </Modal>
  )
}

type Row = BankRow & { key: number; category: string; on: boolean; known?: boolean; unsure?: boolean }

function Importer({ onClose, expenses, incomes, rules }: { onClose: () => void; expenses: Expense[]; incomes: Income[]; rules: ExpenseRules }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const load = (table: string[][]) => {
    const parsed = parseBank(table)
    if (!parsed.length) {
      setError('No encuentro movimientos: hace falta una columna con la fecha y otra con el importe.')
      return
    }
    setError('')
    const ex = withoutKnown(parsed.filter((r) => r.kind === 'expense'), expenses)
    const inc = withoutKnown(parsed.filter((r) => r.kind === 'income'), incomes)
    const known = new Set([...ex.repeated, ...inc.repeated])
    setRows(
      parsed.map((r, key) => {
        const c = r.kind === 'income' ? { category: incomeCategoryFor(r.note), sure: true } : classifyNote(r.note, rules)
        return { ...r, key, category: c.category, unsure: !c.sure, known: known.has(r), on: r.kind !== 'transfer' && !known.has(r) }
      }),
    )
  }

  const readFile = async (f: File) => {
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { readXlsx } = await import('@/lib/xlsx')
        load(await readXlsx(await f.arrayBuffer()))
      } else if (/\.xls$/i.test(f.name)) setError('Los .xls antiguos no se pueden leer: ábrelo y guárdalo como .xlsx o CSV, o copia las filas y pégalas aquí.')
      else load(readTable(await f.text()))
    } catch (e) {
      setError(`No se ha podido leer el archivo (${e instanceof Error ? e.message : 'formato desconocido'}).`)
    }
  }

  const chosen = useMemo(() => (rows ?? []).filter((r) => r.on), [rows])
  const totals = useMemo(() => {
    const t = { expense: 0, income: 0, ne: 0, ni: 0 }
    for (const r of chosen) {
      if (r.kind === 'expense') {
        t.expense += r.amount
        t.ne++
      } else if (r.kind === 'income') {
        t.income += r.amount
        t.ni++
      }
    }
    return t
  }, [chosen])

  const save = async () => {
    const now = Date.now()
    // Lo que no se sabe de qué es entra sin clasificar: LUNO lo pregunta después
    const ex: Expense[] = chosen.filter((r) => r.kind === 'expense').map((r, i) => ({ id: uid(), amount: r.amount, note: r.note, category: r.category, date: r.date, createdAt: now + i, ...(r.unsure ? { unclassified: true as const } : {}) }))
    const inc: Income[] = chosen.filter((r) => r.kind === 'income').map((r, i) => ({ id: uid(), amount: r.amount, note: r.note, category: r.category, date: r.date, createdAt: now + i }))
    await db.transaction('rw', db.expenses, db.incomes, async () => {
      await db.expenses.bulkAdd(ex)
      await db.incomes.bulkAdd(inc)
    })
    onClose()
    toast(
      [ex.length && `${ex.length} ${ex.length === 1 ? 'gasto' : 'gastos'}`, inc.length && `${inc.length} ${inc.length === 1 ? 'ingreso' : 'ingresos'}`].filter(Boolean).join(' y ') + ' traídos del banco',
      {
        label: 'Deshacer',
        run: () =>
          void db.transaction('rw', db.expenses, db.incomes, async () => {
            await db.expenses.bulkDelete(ex.map((e) => e.id))
            await db.incomes.bulkDelete(inc.map((e) => e.id))
          }),
      },
      6000,
    )
  }

  const toggle = (key: number) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, on: !r.on } : r)))
  const transfers = rows?.filter((r) => r.kind === 'transfer').length ?? 0
  const repeated = rows?.filter((r) => r.known).length ?? 0

  return (
    <div>
      <ModalHeader title="Traer movimientos del banco" onClose={onClose} />
      {!rows ? (
        <div className="space-y-4 p-5">
          <p className="text-[14px] text-muted">
            En la web o la app de tu banco, en Movimientos, «Descargar» o «Exportar» en Excel o CSV, y súbelo aquí. También puedes seleccionar las filas en Excel o Numbers, copiarlas y pegarlas. Lo que ya tengas apuntado no se repite.
          </p>
          <input
            ref={file}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv"
            className="hidden"
            aria-label="Archivo del banco"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readFile(f)
              e.target.value = ''
            }}
          />
          <Button variant="secondary" onClick={() => file.current?.click()} className="w-full">
            <FileSpreadsheet size={16} /> Elegir el archivo del banco (.xlsx o .csv)
          </Button>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={'O pega aquí las filas:\n03/10/2026\tMercadona\t-45,30\n28/09/2026\tNómina\t1.850,00'} aria-label="Movimientos pegados" autoGrow={false} className="font-num rounded-xl bg-fill p-3 text-[13px]" />
          {error && (
            <p role="alert" className="text-[13.5px] font-semibold text-red">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!text.trim()} onClick={() => load(readTable(text))}>
              Ver los movimientos
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="space-y-1 border-b border-line px-5 py-3 text-[13.5px]">
            <p>
              {[
                totals.ne > 0 && (
                  <span key="e">
                    <span className="font-semibold">{totals.ne === 1 ? '1 gasto' : `${totals.ne} gastos`}</span> <span className="font-num text-muted">({money(Math.round(totals.expense * 100) / 100)})</span>
                  </span>
                ),
                totals.ni > 0 && (
                  <span key="i">
                    <span className="font-semibold">{totals.ni === 1 ? '1 ingreso' : `${totals.ni} ingresos`}</span> <span className="font-num text-muted">({money(Math.round(totals.income * 100) / 100)})</span>
                  </span>
                ),
              ]
                .filter(Boolean)
                .flatMap((x, i) => (i ? [' y ', x] : [x]))}
              {!totals.ne && !totals.ni && <span className="text-muted">Nada marcado</span>}
            </p>
            {(transfers > 0 || repeated > 0) && (
              <p className="text-muted">
                {[transfers > 0 && `${transfers} ${transfers === 1 ? 'traspaso entre tus cuentas' : 'traspasos entre tus cuentas'}`, repeated > 0 && `${repeated} ya ${repeated === 1 ? 'estaba apuntado' : 'estaban apuntados'}`].filter(Boolean).join(' y ')}: sin marcar.
              </p>
            )}
          </div>
          <ul className="max-h-[50vh] overflow-y-auto" aria-label="Movimientos encontrados">
            {rows.slice(0, 300).map((r) => (
              <li key={r.key} className="shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                <label className={cx('flex cursor-pointer items-center gap-3 px-5 py-2.5', !r.on && 'opacity-55')}>
                  <input type="checkbox" checked={r.on} onChange={() => toggle(r.key)} className="h-4 w-4 shrink-0 accent-[var(--c-blue)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px]">{r.note}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[dateLabel(r.date), r.kind === 'transfer' ? 'Traspaso' : r.kind === 'income' ? incomeCat(r.category).label : r.unsure ? 'Sin clasificar (te lo preguntaré)' : cat(r.category).label, r.known && 'Ya apuntado'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={cx('font-num shrink-0 text-[14.5px] font-semibold', r.kind === 'income' && 'text-green')}>
                    {r.kind === 'income' ? '+' : r.kind === 'expense' ? '−' : ''}
                    {money(r.amount)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {rows.length > 300 && <p className="px-5 py-2 text-[12.5px] text-muted">Se ven los 300 primeros; se traen todos los marcados.</p>}
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
            <Button variant="ghost" onClick={() => setRows(null)}>
              Atrás
            </Button>
            <Button variant="primary" disabled={!totals.ne && !totals.ni} onClick={() => void save()}>
              Traer {totals.ne + totals.ni} {totals.ne + totals.ni === 1 ? 'movimiento' : 'movimientos'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

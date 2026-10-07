import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { ArrowRight, Check, HandCoins, Mic, Plus, ShoppingCart, Sparkles, Trash2, X } from 'lucide-react'
import { addDaysYmd, dateLabel, today } from '@/lib/dates'
import { haptic } from '@/lib/haptics'
import { uid } from '@/lib/id'
import { money } from '@/lib/expenses'
import { AISLES, aisleFor, euros, parseItems } from '@/lib/shopping'
import { useDictation } from '@/lib/speech'
import {
  CHORE_IDEAS,
  balances,
  buyOps,
  priceOps,
  choreStatus,
  chores,
  completeChore,
  expenses,
  fairness,
  members,
  myChores,
  settleUp,
  shopItems,
  shopTotal,
  usualId,
  usuals,
  whoseTurn,
  type Chore,
  type Expense,
  type HouseItem,
  type ShopItem,
  type Usual,
} from '@/lib/house'
import { toast } from '@/app/store'
import { Button, Empty, Group, Section, bouncy, cx, softSpring } from '@/components/ui'
import { Input } from '@/components/form'
import { Modal, ModalHeader } from '@/components/Modal'
import { act } from './store'

interface Props {
  token: string
  /** quién eres en el piso (id de miembro) */
  me: string
  items: HouseItem[]
}

/** «Tú», el nombre del compañero o «Alguien» si ya no está */
export function useNames(items: HouseItem[], me: string) {
  return useMemo(() => {
    const byId = new Map(members(items).map((m) => [m.id, m.data.name]))
    return (id: string | undefined, fallback = 'Quien pueda') => (!id ? fallback : id === me ? 'Tú' : (byId.get(id) ?? 'Alguien'))
  }, [items, me])
}

/** «Tú, Ana y Luis» */
export function membersLabel(items: HouseItem[], me: string) {
  // Tú primero, luego los demás
  const ms = members(items)
  const names = [...ms.filter((m) => m.id === me).map(() => 'Tú'), ...ms.filter((m) => m.id !== me).map((m) => m.data.name)]
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** Inicial en un círculo (cada compañero, siempre el mismo tono de gris) */
export function Avatar({ name, size = 28, me }: { name: string; size?: number; me?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx('font-num inline-flex shrink-0 items-center justify-center rounded-full font-bold', me ? 'bg-accent-fill text-white' : 'bg-fill text-fg')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

const EVERY = [
  { value: 0, label: 'Una vez' },
  { value: 1, label: 'Cada día' },
  { value: 2, label: 'Cada 2 días' },
  { value: 7, label: 'Cada semana' },
  { value: 14, label: 'Cada 2 semanas' },
  { value: 30, label: 'Cada mes' },
]
const ROOMS = ['Cocina', 'Baño', 'Salón', 'Entrada', 'Toda la casa']
export const everyLabel = (n?: number) => (!n ? '' : EVERY.find((e) => e.value === n)?.label.toLowerCase() ?? `cada ${n} días`)

function dueLabel(c: Chore, t: string) {
  const s = choreStatus(c, t)
  if (s === 'anytime' || s === 'done' || !c.due) return ''
  if (s === 'overdue') {
    const days = Math.round((Date.parse(t) - Date.parse(c.due)) / 864e5)
    return days === 1 ? 'desde ayer' : `atrasada ${days} días`
  }
  return dateLabel(c.due).toLowerCase()
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold transition-colors', on ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-press')}
    >
      {children}
    </button>
  )
}

// ── Tareas de casa ──────────────────────────────────────────

/** Te toca, todas las tareas de casa con su turno, añadir y el reparto (como Flatastic o Sweepy) */
export function HouseTasks({ token, me, items }: Props) {
  const t = today()
  const name = useNames(items, me)
  const ids = members(items).map((m) => m.id)
  const [editing, setEditing] = useState<HouseItem<Chore> | 'new' | null>(null)
  const [text, setText] = useState('')
  const mine = myChores(items, me, t)
  const open = chores(items)
    .filter((c) => !c.data.done)
    .sort((a, b) => (a.data.due ?? '9999').localeCompare(b.data.due ?? '9999') || a.data.title.localeCompare(b.data.title, 'es'))
  const done = chores(items)
    .filter((c) => c.data.done)
    .sort((a, b) => (b.data.log?.[0]?.at ?? 0) - (a.data.log?.[0]?.at ?? 0))
    .slice(0, 5)

  const complete = (c: HouseItem<Chore>) => {
    const at = Date.now()
    act(token, [{ op: 'done', id: c.id, by: me, day: t, at }])
    haptic('success')
    const next = completeChore(c.data, me, t, at)
    if (!next.every) return toast(`Hecho: ${c.data.title}`)
    const who = whoseTurn(next, ids)
    toast(`Hecho. ${who ? `La próxima le toca a ${who === me ? 'ti' : name(who)}` : 'La próxima'}, ${dateLabel(next.due!).toLowerCase()}`)
  }
  const add = (title: string, extra: Partial<Chore> = {}) => {
    const clean = title.trim()
    if (!clean) return
    act(token, [{ op: 'put', kind: 'chore', id: uid(), data: { title: clean, rotation: [], turn: 0, by: me, at: Date.now(), ...extra } }])
    haptic()
  }

  return (
    <>
      {mine.length > 0 && (
        <Section title="Te toca">
          <Group>
            {mine.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{c.data.title}</p>
                  <p className="text-[13px] text-muted">{[dueLabel(c.data, t), everyLabel(c.data.every), c.data.room].filter(Boolean).join(' · ')}</p>
                </div>
                <Button size="sm" variant="primary" onClick={() => complete(c)}>
                  <Check size={15} strokeWidth={2.8} /> Hecho
                </Button>
              </div>
            ))}
          </Group>
        </Section>
      )}

      <Section
        title="Tareas de casa"
        count={open.length}
        action={
          <Button size="sm" variant="tinted" onClick={() => setEditing('new')}>
            <Plus size={14} strokeWidth={2.6} /> Nueva
          </Button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add(text)
            setText('')
          }}
          className="glass mb-3 flex items-center gap-2 rounded-[16px] py-1.5 pr-1.5 pl-4"
        >
          <Plus size={17} className="shrink-0 text-muted" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Añadir: llamar al casero, comprar bombillas…"
            aria-label="Añadir una tarea de casa"
            className="h-9 min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-faint"
          />
        </form>
        {open.length === 0 ? (
          <Group>
            <Empty icon={<Sparkles size={26} strokeWidth={2.2} />} title="Sin tareas de casa" hint="Las que se repiten van por turnos: cada vez que alguien la hace, le toca al siguiente. Empieza con una de estas:">
              <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                {CHORE_IDEAS.slice(0, 6).map((idea) => (
                  <button
                    key={idea.title}
                    type="button"
                    onClick={() => add(idea.title, { every: idea.every, rotation: ids, due: t, room: idea.room })}
                    className="flex h-8 items-center gap-1 rounded-full bg-fill pr-3 pl-2 text-[13.5px] font-medium hover:bg-press"
                  >
                    <Plus size={13} strokeWidth={2.6} /> {idea.title}
                  </button>
                ))}
              </div>
            </Empty>
          </Group>
        ) : (
          <Group>
            <AnimatePresence initial={false}>
              {open.map((c) => {
                const who = whoseTurn(c.data, ids)
                const s = choreStatus(c.data, t)
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={softSpring}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)]">
                      <button
                        type="button"
                        aria-label={`Hecho: ${c.data.title}`}
                        onClick={() => complete(c)}
                        className="hit flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.6px] border-faint transition-colors hover:border-blue"
                      />
                      <button type="button" onClick={() => setEditing(c)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[16px]">{c.data.title}</p>
                        <p className="truncate text-[13px] text-muted">
                          <span className={cx((s === 'overdue' || s === 'today') && 'font-semibold', s === 'overdue' && 'text-fg', s === 'today' && 'text-blue')}>
                            {who ? (who === me ? 'Te toca a ti' : `Le toca a ${name(who)}`) : 'Quien pueda'}
                            {dueLabel(c.data, t) && ` · ${dueLabel(c.data, t)}`}
                          </span>
                          {[everyLabel(c.data.every), c.data.room].filter(Boolean).map((x) => ` · ${x}`)}
                        </p>
                      </button>
                      {who && <Avatar name={name(who)} me={who === me} />}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </Group>
        )}
        {done.length > 0 && (
          <p className="mt-2 px-1 text-[13px] text-muted">
            Hechas hace poco: {done.map((c) => `${c.data.title} (${name(c.data.log?.[0]?.by, 'alguien')})`).join(' · ')}
          </p>
        )}
      </Section>

      <Fairness items={items} me={me} />

      <ChoreForm token={token} me={me} items={items} editing={editing} onClose={() => setEditing(null)} />
    </>
  )
}

/** Cuántas tareas ha hecho cada uno en 30 días: para ver si el reparto es justo */
function Fairness({ items, me }: { items: HouseItem[]; me: string }) {
  const name = useNames(items, me)
  const counts = fairness(items, Date.now())
  const max = Math.max(1, ...counts.values())
  if (counts.size < 2 || [...counts.values()].every((n) => !n)) return null
  return (
    <Section title="Reparto, últimos 30 días">
      <Group className="space-y-2.5 p-4">
        {[...counts].map(([id, n]) => (
          <div key={id} className="flex items-center gap-3">
            <Avatar name={name(id)} me={id === me} size={24} />
            <span className="w-20 shrink-0 truncate text-[14px] font-medium">{name(id)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-fill">
              <motion.span className="block h-full rounded-full bg-blue" initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={softSpring} />
            </span>
            <span className="font-num w-8 shrink-0 text-right text-[14px] font-semibold">{n}</span>
          </div>
        ))}
      </Group>
    </Section>
  )
}

/** Nueva tarea de casa o cambiarla: cada cuánto, quién (por turnos), desde cuándo y dónde */
function ChoreForm({ token, me, items, editing, onClose }: Props & { editing: HouseItem<Chore> | 'new' | null; onClose: () => void }) {
  return (
    <Modal open={!!editing} onClose={onClose} position="center">
      <ModalHeader title={editing === 'new' ? 'Nueva tarea de casa' : 'Tarea de casa'} onClose={onClose} />
      {editing && <ChoreFields key={editing === 'new' ? 'new' : editing.id} token={token} me={me} items={items} chore={editing === 'new' ? undefined : editing} onClose={onClose} />}
    </Modal>
  )
}

function ChoreFields({ token, me, items, chore, onClose }: Props & { chore?: HouseItem<Chore>; onClose: () => void }) {
  const t = today()
  const name = useNames(items, me)
  const ms = members(items)
  const [title, setTitle] = useState(chore?.data.title ?? '')
  const [every, setEvery] = useState(chore?.data.every ?? 7)
  const [rotation, setRotation] = useState<string[]>(chore?.data.rotation ?? ms.map((m) => m.id))
  const [first, setFirst] = useState(chore ? whoseTurn(chore.data, ms.map((m) => m.id)) : me)
  const [due, setDue] = useState<string | undefined>(chore ? chore.data.due : t)
  const [room, setRoom] = useState(chore?.data.room)
  const toggle = (id: string) => setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  const save = () => {
    const clean = title.trim()
    if (!clean) return
    const start = first && rotation.includes(first) ? rotation.indexOf(first) : 0
    const data: Chore = { ...chore?.data, title: clean, every: every || undefined, rotation, turn: start, due, room, by: chore?.data.by ?? me, at: chore?.data.at ?? Date.now() }
    act(token, [{ op: 'put', kind: 'chore', id: chore?.id ?? uid(), data: data as unknown as Record<string, unknown> }])
    haptic()
    onClose()
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="space-y-4 px-5 pb-5"
    >
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sacar la basura, limpiar el baño…" aria-label="Tarea" />
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-muted">Cada cuánto</p>
        <div className="flex flex-wrap gap-1.5">
          {EVERY.map((e) => (
            <Chip key={e.value} on={every === e.value} onClick={() => setEvery(e.value)}>
              {e.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-muted">{rotation.length > 1 ? 'Por turnos entre' : 'Quién'}</p>
        <div className="flex flex-wrap gap-1.5">
          {ms.map((m) => (
            <Chip key={m.id} on={rotation.includes(m.id)} onClick={() => toggle(m.id)}>
              {name(m.id)}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {rotation.length === 0 ? 'Sin nadie marcado, la hace quien pueda.' : rotation.length === 1 ? 'Siempre la misma persona.' : 'Cada vez que alguien la hace, le toca al siguiente.'}
        </p>
      </div>
      {rotation.length > 1 && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-muted">Ahora le toca a</p>
          <div className="flex flex-wrap gap-1.5">
            {rotation.map((id) => (
              <Chip key={id} on={first === id} onClick={() => setFirst(id)}>
                {name(id)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-muted">Cuándo</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip on={due === t} onClick={() => setDue(t)}>
            Hoy
          </Chip>
          <Chip on={due === addDaysYmd(t, 1)} onClick={() => setDue(addDaysYmd(t, 1))}>
            Mañana
          </Chip>
          <Chip on={!due} onClick={() => setDue(undefined)}>
            Sin fecha
          </Chip>
          <input
            type="date"
            aria-label="Otra fecha"
            value={due ?? ''}
            onChange={(e) => setDue(e.target.value || undefined)}
            className="h-8 rounded-full bg-fill px-3 text-[13.5px] font-medium"
          />
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-muted">Dónde</p>
        <div className="flex flex-wrap gap-1.5">
          {ROOMS.map((r) => (
            <Chip key={r} on={room === r} onClick={() => setRoom(room === r ? undefined : r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        {chore && (
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              act(token, [{ op: 'del', id: chore.id }])
              toast(`Borrada: ${chore.data.title}`, { label: 'Deshacer', run: () => act(token, [{ op: 'put', kind: 'chore', id: chore.id, data: chore.data as unknown as Record<string, unknown> }]) })
              onClose()
            }}
          >
            <Trash2 size={15} /> Borrar
          </Button>
        )}
        <span className="flex-1" />
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

// ── Compra compartida ───────────────────────────────────────

/** La lista de la compra del piso: la ve y la toca todo el mundo, con quién apuntó y quién compró cada cosa (como Bring!) */
export function SharedShopping({ token, me, items }: Props) {
  const name = useNames(items, me)
  const [text, setText] = useState('')
  const base = useRef('')
  const dictation = useDictation((t) => setText(`${base.current}${base.current && t ? ', ' : ''}${t}`))
  const all = shopItems(items).sort((a, b) => a.data.at - b.data.at)
  const pending = all.filter((i) => !i.data.done)
  const bought = all.filter((i) => i.data.done)
  const usual = usuals(items).slice(0, 12)
  const priceOf = (n: string) => (items.find((i) => i.id === usualId(n))?.data as Usual | undefined)?.price
  const add = (value = text) => {
    const list = parseItems(value)
    if (!list.length) return
    const have = new Set(pending.map((i) => usualId(i.data.name)))
    const fresh = list.filter((p) => !have.has(usualId(p.name)))
    // Sin precio escrito, el de la última vez
    if (fresh.length) act(token, fresh.map((p) => ({ op: 'put' as const, kind: 'shop' as const, id: uid(), data: { name: p.name, qty: p.qty, price: p.price ?? priceOf(p.name), by: me, at: Date.now() } })))
    haptic()
    setText('')
    toast(fresh.length ? (fresh.length === 1 ? `${fresh[0].name} a la compra del piso` : `${fresh.length} cosas a la compra del piso`) : 'Ya estaba en la lista')
  }
  const toggle = (i: HouseItem<ShopItem>) => {
    haptic()
    if (!i.data.done) return act(token, buyOps(items, i, me, Date.now()))
    act(token, [{ op: 'put', kind: 'shop', id: i.id, data: { ...i.data, done: false, doneBy: undefined, doneAt: undefined } }])
  }
  const setPrice = (i: HouseItem<ShopItem>, price: number | undefined) => act(token, priceOps(items, i, price))
  const clear = () => {
    act(token, bought.map((i) => ({ op: 'del' as const, id: i.id })))
    toast(`Fuera lo comprado (${bought.length})`, { label: 'Deshacer', run: () => act(token, bought.map((i) => ({ op: 'put' as const, kind: 'shop' as const, id: i.id, data: i.data as unknown as Record<string, unknown> }))) })
  }
  const total = shopTotal(items)

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="glass mb-3 flex items-center gap-2 rounded-[18px] py-2 pr-2 pl-4"
      >
        <Plus size={18} className="shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Papel higiénico, lavavajillas y aceite"
          aria-label="Añadir a la compra del piso"
          className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
        {dictation.supported && (
          <button
            type="button"
            aria-label={dictation.listening ? 'Dejar de dictar' : 'Dictar la compra'}
            onClick={() => {
              if (dictation.listening) return dictation.stop()
              base.current = text.trim()
              dictation.start()
            }}
            className={cx('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full', dictation.listening ? 'bg-green text-on-green' : 'bg-fill text-fg')}
          >
            {dictation.listening && <motion.span className="absolute inset-0 rounded-full bg-green" animate={{ scale: [1, 1.6], opacity: [0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
            <Mic size={17} className="relative" />
          </button>
        )}
        <button type="submit" aria-label="Añadir" disabled={!text.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white transition-opacity disabled:opacity-30">
          <ArrowRight size={18} strokeWidth={2.6} />
        </button>
      </form>
      {dictation.error && <p className="mb-3 px-1 text-[13px] text-muted">{dictation.error}</p>}

      {usual.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">Lo de siempre</p>
          <div className="flex flex-wrap gap-1.5">
            {usual.map((u) => (
              <motion.button
                key={u.id}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => add(u.data.name)}
                className="flex h-8 items-center gap-1 rounded-full bg-fill pr-3 pl-2 text-[13.5px] font-medium hover:bg-press"
              >
                <Plus size={13} strokeWidth={2.6} /> {u.data.name}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {total.priced > 0 && (
        <p className="mb-4 px-1 text-[13.5px] text-muted" aria-live="polite">
          <span className="font-num font-semibold text-fg">Unos {euros(total.total)}</span>
          {total.bought > 0 && ` · ${euros(total.bought)} comprado`}
          {total.missing > 0 && ` · ${total.missing} sin precio`}
        </p>
      )}

      {all.length === 0 ? (
        <Group>
          <Empty icon={<ShoppingCart size={26} strokeWidth={2.2} />} title="La compra del piso está vacía" hint="Lo que apuntéis aquí lo ve todo el piso al momento, con quién lo apuntó. Quien lo compre, lo marca." />
        </Group>
      ) : (
        <>
          {AISLES.map((a) => {
            const list = pending.filter((i) => aisleFor(i.data.name) === a.id)
            if (!list.length) return null
            return (
              <section key={a.id} className="mb-5">
                <h3 className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{a.label}</h3>
                <Group>
                  {list.map((i) => (
                    <ShopRow key={i.id} item={i} who={name(i.data.by, 'alguien')} onToggle={() => toggle(i)} onPrice={(p) => setPrice(i, p)} onRemove={() => act(token, [{ op: 'del', id: i.id }])} />
                  ))}
                </Group>
              </section>
            )
          })}
          {bought.length > 0 && (
            <section className="mb-6">
              <div className="mb-1.5 flex items-center px-1">
                <h3 className="flex-1 text-[13px] font-semibold tracking-wide text-muted uppercase">Comprado · {bought.length}</h3>
                <button type="button" onClick={clear} className="rounded-full px-2 py-0.5 text-[13px] font-semibold text-blue hover:bg-hover">
                  Quitar lo comprado
                </button>
              </div>
              <Group>
                {bought.map((i) => (
                  <ShopRow key={i.id} item={i} who={`compró ${name(i.data.doneBy, 'alguien').replace(/^Tú$/, 'tú')}`} onToggle={() => toggle(i)} onPrice={(p) => setPrice(i, p)} onRemove={() => act(token, [{ op: 'del', id: i.id }])} />
                ))}
              </Group>
            </section>
          )}
        </>
      )}
    </>
  )
}

/** Precio de una cosa: se toca para ponerlo o cambiarlo */
function PriceButton({ name, value, onChange }: { name: string; value?: number; onChange: (v: number | undefined) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <input
        autoFocus
        inputMode="decimal"
        aria-label={`Precio de ${name}`}
        defaultValue={value ? String(value).replace('.', ',') : ''}
        onBlur={(e) => {
          const n = Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))
          onChange(n > 0 ? Math.round(n * 100) / 100 : undefined)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="€"
        className="font-num h-7 w-16 shrink-0 rounded-lg bg-fill px-2 text-right text-[13px] font-semibold"
      />
    )
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={value ? `Precio de ${name}: ${euros(value)}. Cambiar` : `Poner precio a ${name}`}
      className={cx('font-num h-7 shrink-0 rounded-full px-2 font-semibold text-muted transition-colors hover:bg-hover', value ? 'text-[12.5px]' : 'text-[12px]')}
    >
      {value ? euros(value) : '€'}
    </button>
  )
}

function ShopRow({ item, who, onToggle, onPrice, onRemove }: { item: HouseItem<ShopItem>; who: string; onToggle: () => void; onPrice: (v: number | undefined) => void; onRemove: () => void }) {
  const on = !!item.data.done
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
      <button type="button" role="checkbox" aria-checked={on} aria-label={on ? `${item.data.name}: sin comprar` : `${item.data.name}: comprado`} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={cx('relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.6px]', on ? 'border-green' : 'border-faint')}>
          <motion.span className="absolute inset-[-1.6px] rounded-full bg-green" initial={false} animate={{ scale: on ? 1 : 0 }} transition={bouncy} />
          {on && <Check size={13} strokeWidth={3.2} className="relative text-on-green" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-[16px]', on && 'text-muted line-through')}>{item.data.name}</span>
          <span className="block truncate text-[12.5px] text-muted">{who}</span>
        </span>
        {item.data.qty && <span className="font-num shrink-0 rounded-full bg-fill px-2 py-0.5 text-[12.5px] font-semibold text-muted">{item.data.qty}</span>}
      </button>
      <PriceButton name={item.data.name} value={item.data.price} onChange={onPrice} />
      <button type="button" aria-label={`Quitar ${item.data.name}`} onClick={onRemove} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Cuentas del piso ────────────────────────────────────────

/** Gastos comunes a partes iguales y cómo saldarlos (como Splitwise) */
export function HouseMoney({ token, me, items }: Props) {
  const name = useNames(items, me)
  const [adding, setAdding] = useState(false)
  const bal = balances(items)
  const pay = settleUp(bal)
  const list = expenses(items)
    .sort((a, b) => b.data.at - a.data.at)
    .slice(0, 12)
  const mine = bal.get(me) ?? 0
  const settle = (p: { from: string; to: string; amount: number }) => {
    act(token, [{ op: 'put', kind: 'expense', id: uid(), data: { what: 'Pago para saldar', amount: p.amount, paidBy: p.from, split: [p.to], day: today(), settle: true, at: Date.now() } }])
    haptic('success')
    toast(`Apuntado: ${name(p.from)} → ${name(p.to)}, ${money(p.amount)}`)
  }
  return (
    <Section
      title="Cuentas del piso"
      action={
        <Button size="sm" variant="tinted" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2.6} /> Gasto
        </Button>
      }
    >
      <Group className="p-4">
        <p className="text-[13px] font-semibold text-muted">Tú</p>
        <p className="font-num text-[28px] leading-tight font-bold tracking-tight">
          {Math.abs(mine) < 0.01 ? 'En paz' : mine > 0 ? `Te deben ${money(mine)}` : `Debes ${money(-mine)}`}
        </p>
        {pay.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {pay.map((p) => (
              <li key={`${p.from}-${p.to}`} className="flex items-center gap-2 text-[14.5px]">
                <HandCoins size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">{name(p.from)}</b> {p.from === me ? 'pagas' : 'paga'} <b className="font-num font-semibold">{money(p.amount)}</b> a <b className="font-semibold">{name(p.to) === 'Tú' ? 'ti' : name(p.to)}</b>
                </span>
                <Button size="sm" onClick={() => settle(p)}>
                  Hecho
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13.5px] text-muted">Apuntad lo que compráis para el piso (papel, internet, la luz…) y LUNO dice quién debe a quién.</p>
        )}
      </Group>
      {list.length > 0 && (
        <Group className="mt-3">
          {list.map((e) => (
            <ExpenseRow key={e.id} e={e} who={name(e.data.paidBy, 'alguien')} to={e.data.settle ? name(e.data.split[0], 'alguien') : undefined} onRemove={() => act(token, [{ op: 'del', id: e.id }])} />
          ))}
        </Group>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} position="center">
        <ModalHeader title="Gasto del piso" onClose={() => setAdding(false)} />
        {adding && <ExpenseFields token={token} me={me} items={items} onClose={() => setAdding(false)} />}
      </Modal>
    </Section>
  )
}

function ExpenseRow({ e, who, to, onRemove }: { e: HouseItem<Expense>; who: string; to?: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15.5px]">{e.data.settle ? `${who} → ${to === 'Tú' ? 'ti' : to}` : e.data.what}</p>
        <p className="text-[12.5px] text-muted">
          {e.data.settle ? 'Pago para saldar' : `Pagó ${who === 'Tú' ? 'tú' : who}`} · {dateLabel(e.data.day)}
        </p>
      </div>
      <span className="font-num shrink-0 text-[15px] font-semibold">{money(e.data.amount)}</span>
      <button type="button" aria-label={`Borrar ${e.data.what}`} onClick={onRemove} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg">
        <X size={14} />
      </button>
    </div>
  )
}

function ExpenseFields({ token, me, items, onClose }: Props & { onClose: () => void }) {
  const name = useNames(items, me)
  const ms = members(items)
  const [what, setWhat] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(me)
  const [split, setSplit] = useState<string[]>(ms.map((m) => m.id))
  const n = Number(amount.replace(',', '.').replace(/[^\d.]/g, ''))
  const save = () => {
    if (!what.trim() || !(n > 0) || !split.length) return
    act(token, [{ op: 'put', kind: 'expense', id: uid(), data: { what: what.trim(), amount: Math.round(n * 100) / 100, paidBy, split: split.length === ms.length ? [] : split, day: today(), at: Date.now() } }])
    haptic()
    toast(`${what.trim()}: ${money(n)}, ${split.length === ms.length ? 'entre todos' : `entre ${split.length}`}`)
    onClose()
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="space-y-4 px-5 pb-5"
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input autoFocus value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Papel higiénico, internet…" aria-label="Qué" />
        </div>
        <div className="w-28 shrink-0">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00 €" aria-label="Cuánto" className="text-right" />
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-muted">Pagó</p>
        <div className="flex flex-wrap gap-1.5">
          {ms.map((m) => (
            <Chip key={m.id} on={paidBy === m.id} onClick={() => setPaidBy(m.id)}>
              {name(m.id)}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-muted">Entre</p>
        <div className="flex flex-wrap gap-1.5">
          {ms.map((m) => (
            <Chip key={m.id} on={split.includes(m.id)} onClick={() => setSplit((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))}>
              {name(m.id)}
            </Chip>
          ))}
        </div>
        {n > 0 && split.length > 0 && <p className="mt-1.5 text-[12.5px] text-muted">{money(Math.round((n / split.length) * 100) / 100)} cada uno</p>}
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!what.trim() || !(n > 0) || !split.length}>
          Apuntar
        </Button>
      </div>
    </form>
  )
}

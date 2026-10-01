import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, m as motion } from 'motion/react'
import { ArrowRightLeft, ArrowUp, Check, Mic, MoreHorizontal, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { db } from '@/db/db'
import type { ShoppingItem } from '@/db/types'
import { addShoppingItems, finishShopping, setSetting, setShoppingAisle, setShoppingPrice, toggleShopping } from '@/db/actions'
import { AISLES, aisleFor, euros, itemKey, parseItems } from '@/lib/shopping'
import { uid } from '@/lib/id'
import { Menu } from '@/components/Menu'
import { useDictation } from '@/lib/speech'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty, Group, PageHeader, bouncy, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'

const EXAMPLE = 'leche, 2 barras de pan, plátanos y detergente'

/** Otras listas además de la principal (súper): farmacia, ferretería… (ajuste `shoppingLists`) */
export interface ShoppingList {
  id: string
  name: string
}
const MAIN = 'Súper'
const LAST_KEY = 'ntab-shopping-list'
const readLast = () => {
  try {
    return localStorage.getItem(LAST_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Lista de la compra: se escribe (o se dicta) de golpe y se ordena por pasillos */
export function ShoppingView() {
  const all = useLiveQuery(() => db.shopping.orderBy('order').toArray(), [])
  const pantry = useLiveQuery(() => db.pantry.orderBy('count').reverse().toArray(), [])
  const lists = useLiveQuery(() => db.settings.get('shoppingLists').then((r) => (Array.isArray(r?.value) ? (r!.value as ShoppingList[]) : [])), [])
  // La lista que estás viendo (se recuerda en este dispositivo); '' = la principal
  const [current, setCurrent] = useState(readLast)
  const [text, setText] = useState('')
  const base = useRef('')
  const dictation = useDictation((t) => setText(`${base.current}${base.current && t ? ', ' : ''}${t}`))
  const preview = useMemo(() => parseItems(text), [text])
  const known = useMemo(() => Object.fromEntries((pantry ?? []).map((p) => [p.id, p.aisle])), [pantry])
  if (!all || !pantry || !lists) return null
  const listId = lists.some((l) => l.id === current) ? current : ''
  const choose = (id: string) => {
    setCurrent(id)
    try {
      localStorage.setItem(LAST_KEY, id)
    } catch {
      /* solo en memoria */
    }
  }
  const items = all.filter((i) => (i.list ?? '') === listId)
  const countOf = (id: string) => all.filter((i) => (i.list ?? '') === id && !i.checked).length
  const listName = lists.find((l) => l.id === listId)?.name ?? MAIN

  const pending = items.filter((i) => !i.checked)
  const inCart = items.filter((i) => i.checked)
  const keys = new Set(pending.map((i) => itemKey(i.name)))
  const usual = pantry.filter((p) => p.count > 0 && !keys.has(p.id)).slice(0, 14)

  const add = async (value = text) => {
    const list = parseItems(value)
    if (!list.length) return
    const added = await addShoppingItems(list, listId || undefined)
    haptic()
    setText('')
    if (added.length) toast(added.length === 1 ? `${added[0].name} a la lista` : `${added.length} cosas a la lista`)
    else toast('Ya estaba en la lista')
  }
  const finish = async () => {
    const bought = await finishShopping(listId || undefined)
    haptic('success')
    toast(`Compra terminada: ${bought.length} ${bought.length === 1 ? 'cosa' : 'cosas'}`, {
      label: 'Deshacer',
      run: () => void db.shopping.bulkPut(bought),
    })
  }

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('shopping')} size={40} />}
        title="Compra"
        subtitle={pending.length ? `${pending.length} ${pending.length === 1 ? 'cosa' : 'cosas'} por comprar${inCart.length ? ` · ${inCart.length} en el carro` : ''}` : 'Escribe o dicta todo de golpe; LUNO lo ordena por pasillos.'}
      />

      <ListTabs lists={lists} current={listId} countOf={countOf} onChoose={choose} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="glass mb-3 flex items-center gap-2 rounded-[18px] py-2 pr-2 pl-4"
      >
        <Plus size={18} className="shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listId ? `Añadir a ${listName}` : EXAMPLE}
          aria-label={`Añadir a la lista ${listName}`}
          className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
        {dictation.supported && (
          <button
            type="button"
            aria-label={dictation.listening ? 'Dejar de dictar' : 'Dictar la lista'}
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
        <button type="submit" aria-label="Añadir" disabled={!preview.length} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white transition-opacity disabled:opacity-30">
          <ArrowUp size={18} strokeWidth={2.8} />
        </button>
      </form>
      <AnimatePresence>
        {preview.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 flex flex-wrap gap-1.5 overflow-hidden px-1">
            {preview.map((p, i) => (
              <motion.span key={`${p.name}-${i}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={bouncy} className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-semibold text-blue">
                {p.qty ? `${p.qty} · ` : ''}
                {p.name}
                {p.price ? ` · ${euros(p.price)}` : ''}
                <span className="font-normal opacity-70"> · {AISLES.find((a) => a.id === aisleFor(p.name, known))?.label}</span>
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {dictation.error && <p className="mb-3 px-1 text-[13px] text-muted">{dictation.error}</p>}

      {usual.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">Lo de siempre</p>
          <div className="flex flex-wrap gap-1.5">
            {usual.map((p) => (
              <motion.button
                key={p.id}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => void add(p.name)}
                className="flex h-8 items-center gap-1 rounded-full bg-fill pr-3 pl-2 text-[13.5px] font-medium hover:bg-press"
              >
                <Plus size={13} strokeWidth={2.6} /> {p.name}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <Total items={items} />

      {items.length === 0 ? (
        <Group>
          <Empty icon={<ShoppingCart size={28} strokeWidth={2.2} />} color="var(--c-blue)" title={listId ? `«${listName}» está vacía` : 'La lista está vacía'} hint="Escribe varias cosas separadas por comas o «y», con cantidades si quieres: «2 barras de pan». También puedes dictarlas o pedírselas a Claude." />
        </Group>
      ) : (
        <>
          {AISLES.map((a) => {
            const list = pending.filter((i) => i.aisle === a.id)
            if (!list.length) return null
            return (
              <section key={a.id} className="mb-5">
                <h2 className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{a.label}</h2>
                <Group>
                  <AnimatePresence initial={false}>
                    {list.map((i) => (
                      <Row key={i.id} item={i} />
                    ))}
                  </AnimatePresence>
                </Group>
              </section>
            )
          })}
          {inCart.length > 0 && (
            <section className="mb-24">
              <h2 className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">En el carro · {inCart.length}</h2>
              <Group>
                <AnimatePresence initial={false}>
                  {inCart.map((i) => (
                    <Row key={i.id} item={i} />
                  ))}
                </AnimatePresence>
              </Group>
            </section>
          )}
        </>
      )}

      {inCart.length > 0 && (
        <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),10px)+80px)] z-10 flex justify-center lg:bottom-6">
          <Button variant="primary" size="lg" onClick={() => void finish()} className="shadow-[0_10px_28px_-12px_rgb(0_0_0/0.4)]">
            <Check size={18} strokeWidth={2.6} /> Terminar compra ({inCart.length})
          </Button>
        </div>
      )}
    </Page>
  )
}

/** Total estimado (como en AnyList): lo que va a costar y lo que ya va en el carro */
function Total({ items }: { items: ShoppingItem[] }) {
  const priced = items.filter((i) => i.price)
  if (!priced.length) return null
  const total = priced.reduce((n, i) => n + i.price!, 0)
  const cart = priced.filter((i) => i.checked).reduce((n, i) => n + i.price!, 0)
  const missing = items.length - priced.length
  return (
    <p className="mb-4 px-1 text-[13.5px] text-muted" aria-live="polite">
      <span className="font-num font-semibold text-fg">Unos {euros(total)}</span>
      {cart > 0 && ` · ${euros(cart)} en el carro`}
      {missing > 0 && ` · ${missing} sin precio`}
    </p>
  )
}

/** Pestañas de las listas: la principal, las demás y «Nueva lista» */
function ListTabs({ lists, current, countOf, onChoose }: { lists: ShoppingList[]; current: string; countOf: (id: string) => number; onChoose: (id: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  const save = (next: ShoppingList[]) => void setSetting('shoppingLists', next)
  const create = () => {
    const n = name.trim()
    setAdding(false)
    setName('')
    if (!n) return
    const l = { id: uid(), name: n }
    save([...lists, l])
    onChoose(l.id)
  }
  const remove = async (l: ShoppingList) => {
    const items = await db.shopping.filter((i) => i.list === l.id).toArray()
    if (items.length && !window.confirm(`¿Borrar «${l.name}» y sus ${items.length} cosas?`)) return
    await db.shopping.bulkDelete(items.map((i) => i.id))
    save(lists.filter((x) => x.id !== l.id))
    onChoose('')
    toast(`«${l.name}» borrada`, { label: 'Deshacer', run: () => void (save(lists), db.shopping.bulkPut(items)) })
  }
  const tab = (id: string, label: string) => {
    const on = id === current
    const n = countOf(id)
    return (
      <button
        key={id || 'main'}
        type="button"
        aria-pressed={on}
        onClick={() => onChoose(id)}
        className={cx('flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors', on ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-press')}
      >
        {label}
        {n > 0 && <span className={cx('font-num text-[12.5px]', on ? 'text-white/85' : 'text-muted')}>{n}</span>}
      </button>
    )
  }
  const currentList = lists.find((l) => l.id === current)
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-0.5" role="group" aria-label="Listas de la compra">
        {tab('', MAIN)}
        {lists.map((l) =>
          renaming === l.id ? (
            <input
              key={l.id}
              autoFocus
              aria-label={`Nuevo nombre para ${l.name}`}
              defaultValue={l.name}
              onBlur={(e) => {
                const n = e.target.value.trim()
                if (n && n !== l.name) save(lists.map((x) => (x.id === l.id ? { ...x, name: n } : x)))
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
              className="h-9 w-36 shrink-0 rounded-full bg-fill-2 px-3.5 text-[14px] font-semibold"
            />
          ) : (
            tab(l.id, l.name)
          ),
        )}
        {adding ? (
          <input
            autoFocus
            aria-label="Nombre de la nueva lista"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={create}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
              if (e.key === 'Escape') (setAdding(false), setName(''))
            }}
            placeholder="Farmacia, ferretería…"
            className="h-9 w-44 shrink-0 rounded-full bg-fill-2 px-3.5 text-[14px] placeholder:text-faint"
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[14px] font-semibold text-blue hover:bg-hover">
            <Plus size={15} strokeWidth={2.6} aria-hidden /> Nueva lista
          </button>
        )}
      </div>
      {currentList && (
        <Menu
          label={`Opciones de ${currentList.name}`}
          trigger={<MoreHorizontal size={16} strokeWidth={2.4} />}
          items={[
            { label: 'Cambiar el nombre', icon: <Pencil size={14} />, onSelect: () => setRenaming(currentList.id) },
            { label: 'Borrar la lista', icon: <Trash2 size={14} />, danger: true, onSelect: () => void remove(currentList) },
          ]}
        />
      )}
    </div>
  )
}

/** Precio estimado de una línea: se toca para cambiarlo */
function Price({ item }: { item: ShoppingItem }) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <input
        autoFocus
        inputMode="decimal"
        aria-label={`Precio de ${item.name}`}
        defaultValue={item.price ? String(item.price).replace('.', ',') : ''}
        onBlur={(e) => {
          const n = Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))
          void setShoppingPrice(item.id, n > 0 ? Math.round(n * 100) / 100 : undefined)
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
      aria-label={item.price ? `Precio de ${item.name}: ${euros(item.price)}. Cambiar` : `Poner precio a ${item.name}`}
      className={cx('font-num h-7 shrink-0 rounded-full px-2 font-semibold text-muted transition-colors hover:bg-hover', item.price ? 'text-[12.5px]' : 'text-[12px]')}
    >
      {item.price ? euros(item.price) : '€'}
    </button>
  )
}

function Row({ item }: { item: ShoppingItem }) {
  const on = !!item.checked
  return (
    <motion.div
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
          role="checkbox"
          aria-checked={on}
          aria-label={on ? `Sacar ${item.name} del carro` : `${item.name} al carro`}
          onClick={() => {
            haptic()
            void toggleShopping(item.id)
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={cx('relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.6px]', on ? 'border-green' : 'border-faint')}>
            <motion.span className="absolute inset-[-1.6px] rounded-full bg-green" initial={false} animate={{ scale: on ? 1 : 0 }} transition={bouncy} />
            {on && <Check size={13} strokeWidth={3.2} className="relative text-on-green" />}
          </span>
          <span className={cx('truncate text-[16px] transition-colors', on && 'text-muted line-through')}>{item.name}</span>
          {item.qty && <span className="font-num shrink-0 rounded-full bg-fill px-2 py-0.5 text-[12.5px] font-semibold text-muted">{item.qty}</span>}
        </button>
        <Price item={item} />
        {!on && (
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg" title="Cambiar de pasillo">
            <ArrowRightLeft size={13} />
            <select
              aria-label={`Pasillo de ${item.name}`}
              value={item.aisle}
              onChange={(e) => void setShoppingAisle(item.id, e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {AISLES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </span>
        )}
        <button type="button" aria-label={`Quitar ${item.name}`} onClick={() => void db.shopping.delete(item.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg">
          <X size={14} />
        </button>
      </div>
    </motion.div>
  )
}

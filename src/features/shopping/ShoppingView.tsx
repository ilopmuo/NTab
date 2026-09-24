import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRightLeft, ArrowUp, Check, Mic, Plus, ShoppingCart, X } from 'lucide-react'
import { db } from '@/db/db'
import type { ShoppingItem } from '@/db/types'
import { addShoppingItems, finishShopping, setShoppingAisle, toggleShopping } from '@/db/actions'
import { AISLES, aisleFor, itemKey, parseItems } from '@/lib/shopping'
import { useDictation } from '@/lib/speech'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty, Group, PageHeader, bouncy, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'

const EXAMPLE = 'leche, 2 barras de pan, plátanos y detergente'

/** Lista de la compra: se escribe (o se dicta) de golpe y se ordena por pasillos */
export function ShoppingView() {
  const items = useLiveQuery(() => db.shopping.orderBy('order').toArray(), [])
  const pantry = useLiveQuery(() => db.pantry.orderBy('count').reverse().toArray(), [])
  const [text, setText] = useState('')
  const base = useRef('')
  const dictation = useDictation((t) => setText(`${base.current}${base.current && t ? ', ' : ''}${t}`))
  const preview = useMemo(() => parseItems(text), [text])
  const known = useMemo(() => Object.fromEntries((pantry ?? []).map((p) => [p.id, p.aisle])), [pantry])
  if (!items || !pantry) return null

  const pending = items.filter((i) => !i.checked)
  const inCart = items.filter((i) => i.checked)
  const keys = new Set(pending.map((i) => itemKey(i.name)))
  const usual = pantry.filter((p) => p.count > 0 && !keys.has(p.id)).slice(0, 14)

  const add = async (value = text) => {
    const list = parseItems(value)
    if (!list.length) return
    const added = await addShoppingItems(list)
    haptic()
    setText('')
    if (added.length) toast(added.length === 1 ? `${added[0].name} a la lista` : `${added.length} cosas a la lista`)
    else toast('Ya estaba en la lista')
  }
  const finish = async () => {
    const bought = await finishShopping()
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
        subtitle={pending.length ? `${pending.length} ${pending.length === 1 ? 'cosa' : 'cosas'} por comprar${inCart.length ? ` · ${inCart.length} en el carro` : ''}` : 'Escribe o dicta todo de golpe; NTab lo ordena por pasillos.'}
      />

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
          placeholder={EXAMPLE}
          aria-label="Añadir a la compra"
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
        <button type="submit" aria-label="Añadir" disabled={!preview.length} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30">
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

      {items.length === 0 ? (
        <Group>
          <Empty icon={<ShoppingCart size={28} strokeWidth={2.2} />} color="var(--c-blue)" title="La lista está vacía" hint="Escribe varias cosas separadas por comas o «y», con cantidades si quieres: «2 barras de pan». También puedes dictarlas o pedírselas a Claude." />
        </Group>
      ) : (
        <>
          {AISLES.map((a) => {
            const list = pending.filter((i) => i.aisle === a.id)
            if (!list.length) return null
            return (
              <section key={a.id} className="mb-5">
                <h3 className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{a.label}</h3>
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
              <h3 className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">En el carro · {inCart.length}</h3>
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
          <Button variant="primary" size="lg" onClick={() => void finish()} className="shadow-[0_10px_30px_-10px_var(--c-blue)]">
            <Check size={18} strokeWidth={2.6} /> Terminar compra ({inCart.length})
          </Button>
        </div>
      )}
    </Page>
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
          <span className={cx('truncate text-[16px] transition-colors', on && 'text-faint line-through')}>{item.name}</span>
          {item.qty && <span className="font-num shrink-0 rounded-full bg-fill px-2 py-0.5 text-[12.5px] font-semibold text-muted">{item.qty}</span>}
        </button>
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

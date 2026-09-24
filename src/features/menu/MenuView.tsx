import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight, CookingPot, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { db } from '@/db/db'
import type { MenuSlot, Recipe } from '@/db/types'
import { addShoppingItems, deleteRecipe, saveRecipe, setMenuSlot } from '@/db/actions'
import { addDaysYmd, fmt, today, weekStart } from '@/lib/dates'
import { MEALS, RECIPE_PRESETS, ingredientsFor, slotId } from '@/lib/menu'
import { haptic } from '@/lib/haptics'
import { navigate } from '@/app/router'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { toastTrashed } from '../trash/undo'
import { Button, Empty, Field, Group, Input, Modal, ModalHeader, PageHeader, Segmented, Textarea, cx, spring } from '@/components/ui'
import { Page } from '../Page'

type Tab = 'week' | 'recipes'

/** Menú de la semana y recetas: lo que se come y lo que hay que comprar */
export function MenuView() {
  const t = today()
  const [tab, setTab] = useState<Tab>('week')
  const [monday, setMonday] = useState(weekStart(t))
  const [picking, setPicking] = useState<{ date: string; meal: MenuSlot['meal'] } | null>(null)
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), [])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i)), [monday])
  const slots = useLiveQuery(() => db.menu.where('date').between(days[0], days[6], true, true).toArray(), [days[0]])
  if (!recipes || !slots) return null
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const slot = (d: string, m: MenuSlot['meal']) => slots.find((s) => s.id === slotId(d, m))

  const toShopping = async () => {
    // De hoy en adelante: lo ya comido no hace falta comprarlo
    const items = ingredientsFor(slots.filter((s) => s.date >= t), recipes)
    if (!items.length) return void toast('No hay recetas con ingredientes en lo que queda de semana')
    const added = await addShoppingItems(items)
    haptic('success')
    toast(added.length ? `${added.length} ${added.length === 1 ? 'cosa' : 'cosas'} a la compra` : 'Ya estaba todo en la compra', { label: 'Ver', run: () => navigate('/shopping') })
  }

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('menu')} size={40} />}
        title="Menú"
        subtitle="Qué se come esta semana, y los ingredientes a la compra en un toque."
        actions={
          tab === 'recipes' && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} strokeWidth={2.6} /> Receta
            </Button>
          )
        }
      />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-5 flex w-full max-w-xs"
        options={[
          { value: 'week', label: 'Semana' },
          { value: 'recipes', label: `Recetas${recipes.length ? ` (${recipes.length})` : ''}` },
        ]}
      />

      {tab === 'week' ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" aria-label="Semana anterior" onClick={() => setMonday(addDaysYmd(monday, -7))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90">
              <ChevronLeft size={18} />
            </button>
            <p className="flex-1 text-center text-[16px] font-bold">
              {monday === weekStart(t) ? 'Esta semana' : `${fmt(days[0], 'd MMM')} – ${fmt(days[6], 'd MMM')}`}
            </p>
            <button type="button" aria-label="Semana siguiente" onClick={() => setMonday(addDaysYmd(monday, 7))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90">
              <ChevronRight size={18} />
            </button>
          </div>
          <Group className="mb-4">
            {days.map((d) => (
              <div key={d} className={cx('flex items-stretch gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none', d < t && 'opacity-50')}>
                <div className="w-12 shrink-0 pt-1.5">
                  <p className={cx('text-[12px] font-bold uppercase', d === t ? 'text-blue' : 'text-muted')}>{fmt(d, 'EEE')}</p>
                  <p className={cx('font-num text-[20px] leading-none font-bold', d === t && 'text-blue')}>{fmt(d, 'd')}</p>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  {MEALS.map((m) => {
                    const s = slot(d, m.id)
                    const name = s?.recipeId ? byId.get(s.recipeId)?.name : s?.text
                    return (
                      <motion.button
                        key={m.id}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setPicking({ date: d, meal: m.id })}
                        className={cx('min-w-0 rounded-[12px] px-3 py-2 text-left transition-colors', name ? 'bg-fill' : 'border border-dashed border-line-strong hover:bg-hover')}
                      >
                        <span className="block text-[11.5px] font-semibold text-muted">{m.label}</span>
                        <span className={cx('block truncate text-[14px]', name ? 'font-semibold' : 'text-faint')}>{name ?? 'Añadir'}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            ))}
          </Group>
          <Button variant="tinted" className="w-full" onClick={() => void toShopping()}>
            <ShoppingCart size={16} /> Añadir ingredientes a la compra
          </Button>
          <p className="mt-2 mb-8 px-1 text-center text-[12.5px] text-muted">Junta los ingredientes de lo que queda de semana, sin repetir lo que ya está en la lista.</p>
        </>
      ) : recipes.length === 0 ? (
        <Group>
          <Empty icon={<CookingPot size={28} strokeWidth={2.2} />} color="var(--c-blue)" title="Tus recetas" hint="Guarda lo que sueles cocinar con sus ingredientes. Empieza con alguna de estas:">
            <div className="flex flex-wrap justify-center gap-2">
              {RECIPE_PRESETS.map((p) => (
                <motion.button key={p.name} type="button" whileTap={{ scale: 0.94 }} onClick={() => void saveRecipe(p)} className="glass rounded-full px-4 py-2 text-[14px] font-medium">
                  {p.name}
                </motion.button>
              ))}
            </div>
          </Empty>
        </Group>
      ) : (
        <div className="grid gap-3 @[640px]:grid-cols-2">
          {recipes.map((r, i) => (
            <motion.button
              key={r.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: Math.min(i, 8) * 0.03 }}
              onClick={() => setEditing(r)}
              className="glass rounded-[18px] p-4 text-left"
            >
              <p className="text-[16px] font-semibold">{r.name}</p>
              <p className="mt-1 line-clamp-2 text-[13px] text-muted">{r.ingredients.join(' · ') || 'Sin ingredientes'}</p>
            </motion.button>
          ))}
        </div>
      )}
      {tab === 'recipes' && recipes.length > 0 && RECIPE_PRESETS.some((p) => !recipes.some((r) => r.name === p.name)) && recipes.length < 10 && (
        <div className="mt-8">
          <p className="mb-3 px-1 text-[17px] font-bold text-muted">Ideas</p>
          <div className="flex flex-wrap gap-2">
            {RECIPE_PRESETS.filter((p) => !recipes.some((r) => r.name === p.name)).map((p) => (
              <motion.button key={p.name} type="button" whileTap={{ scale: 0.94 }} onClick={() => void saveRecipe(p)} className="glass flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium">
                <Plus size={14} /> {p.name}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <SlotPicker slot={picking} recipes={recipes} current={picking ? slot(picking.date, picking.meal) : undefined} onClose={() => setPicking(null)} onNewRecipe={() => (setPicking(null), setTab('recipes'), setEditing('new'))} />
      <RecipeForm recipe={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}

function SlotPicker({
  slot,
  current,
  recipes,
  onClose,
  onNewRecipe,
}: {
  slot: { date: string; meal: MenuSlot['meal'] } | null
  current?: MenuSlot
  recipes: Recipe[]
  onClose: () => void
  onNewRecipe: () => void
}) {
  const [q, setQ] = useState('')
  const choose = async (v: { recipeId?: string; text?: string } | null) => {
    if (!slot) return
    await setMenuSlot(slot.date, slot.meal, v)
    haptic()
    setQ('')
    onClose()
  }
  const list = recipes.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Modal open={!!slot} onClose={onClose} position="center">
      {slot && (
        <div>
          <ModalHeader title={`${slot.meal === 'comida' ? 'Comida' : 'Cena'} del ${fmt(slot.date, "EEEE d")}`} onClose={onClose} />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (list.length === 1 && q.trim()) void choose({ recipeId: list[0].id })
              else if (q.trim()) void choose({ text: q })
            }}
            className="px-5 pb-2"
          >
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca una receta o escribe algo («sobras», «fuera»)" />
          </form>
          <div className="max-h-[45vh] overflow-y-auto px-3 pb-2">
            {list.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void choose({ recipeId: r.id })}
                className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-hover', current?.recipeId === r.id && 'bg-accent-soft')}
              >
                <CookingPot size={16} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-[15px]">{r.name}</span>
              </button>
            ))}
            {q.trim() && !list.some((r) => r.name.toLowerCase() === q.trim().toLowerCase()) && (
              <button type="button" onClick={() => void choose({ text: q })} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover">
                <Plus size={16} className="shrink-0 text-blue" />
                <span className="text-[15px]">Poner «{q.trim()}»</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 px-5 pt-1 pb-5">
            {current && (
              <Button variant="danger" onClick={() => void choose(null)}>
                <X size={15} /> Quitar
              </Button>
            )}
            <div className="flex-1" />
            <Button onClick={onNewRecipe}>
              <Plus size={15} /> Nueva receta
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function RecipeForm({ recipe, onClose }: { recipe: Recipe | 'new' | null; onClose: () => void }) {
  return (
    <Modal open={!!recipe} onClose={onClose} position="center">
      {recipe && <RecipeFields key={recipe === 'new' ? 'new' : recipe.id} recipe={recipe === 'new' ? undefined : recipe} onClose={onClose} />}
    </Modal>
  )
}

function RecipeFields({ recipe, onClose }: { recipe?: Recipe; onClose: () => void }) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [ingredients, setIngredients] = useState((recipe?.ingredients ?? []).join('\n'))
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const lines = ingredients.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        await saveRecipe({ name: name.trim(), ingredients: lines, notes: notes.trim() || undefined }, recipe?.id)
        onClose()
      }}
    >
      <ModalHeader title={recipe ? 'Receta' : 'Nueva receta'} onClose={onClose} />
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
        <Field label="Nombre">
          <Input autoFocus={!recipe} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tortilla de patatas" />
        </Field>
        <Field label={`Ingredientes (uno por línea)${lines.length ? ` · ${lines.length}` : ''}`}>
          <Textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={5} placeholder={'6 huevos\n1 kg de patatas\n1 cebolla'} className="min-h-[120px] rounded-xl bg-fill-2 px-3.5 py-3 text-[15px]" />
        </Field>
        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Pasos, trucos, de dónde es…" className="min-h-[72px] rounded-xl bg-fill-2 px-3.5 py-2.5 text-[15px]" />
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {recipe && (
          <Button type="button" variant="danger" onClick={async () => (await deleteRecipe(recipe.id), onClose(), toastTrashed('Receta en la papelera', 'recipes', recipe.id))}>
            <Trash2 size={15} /> Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

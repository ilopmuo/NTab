import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { Check, ChefHat, ChevronLeft, ChevronRight, Clock, ExternalLink, Link2, ListChecks, Minus, Pencil, Plus, ShoppingCart, Timer, Trash2, Users, X } from 'lucide-react'
import type { Recipe } from '@/db/types'
import { addShoppingItems, deleteRecipe, saveRecipe } from '@/db/actions'
import { scaleIngredient, stepTimers, type RecipeData } from '@/lib/recipes'
import { importRecipe, looksLikeUrl } from '@/lib/recipeImport'
import { parseItem } from '@/lib/shopping'
import { haptic } from '@/lib/haptics'
import { navigate } from '@/app/router'
import { toast } from '@/app/store'
import { useSync } from '@/sync/service'
import { Countdown } from '@/components/Countdown'
import { Button, Field, IconButton, Input, Modal, ModalHeader, Textarea, cx, softSpring } from '@/components/ui'
import { toastTrashed } from '../trash/undo'

const minutesText = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`)

/** Los ingredientes para `n` personas */
function useScaled(recipe: Recipe, people: number) {
  return useMemo(() => {
    const base = recipe.servings ?? people
    return recipe.ingredients.map((i) => scaleIngredient(i, people / base))
  }, [recipe, people])
}

/** Selector de raciones: − 4 personas + */
function Servings({ value, onChange, base }: { value: number; onChange: (n: number) => void; base?: number }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-fill p-0.5">
      <IconButton label="Una persona menos" onClick={() => onChange(Math.max(1, value - 1))} className="h-8 w-8">
        <Minus size={14} strokeWidth={2.6} />
      </IconButton>
      <span className="font-num min-w-[86px] text-center text-[14px] font-semibold" aria-live="polite">
        <Users size={13} strokeWidth={2.4} className="mr-1 inline align-[-2px]" aria-hidden />
        {value} {value === 1 ? 'persona' : 'personas'}
      </span>
      <IconButton label="Una persona más" onClick={() => onChange(Math.min(50, value + 1))} className="h-8 w-8">
        <Plus size={14} strokeWidth={2.6} />
      </IconButton>
      {base && value !== base && <span className="sr-only">La receta original es para {base}</span>}
    </div>
  )
}

async function toShopping(lines: string[]) {
  const items = lines.map((l) => parseItem(l)).filter((x): x is NonNullable<typeof x> => !!x)
  if (!items.length) return void toast('Esta receta no tiene ingredientes')
  const added = await addShoppingItems(items)
  haptic('success')
  toast(added.length ? `${added.length} ${added.length === 1 ? 'cosa' : 'cosas'} a la compra` : 'Ya estaba todo en la compra', { label: 'Ver', run: () => navigate('/shopping') })
}

/**
 * Una receta (como en Paprika): ingredientes para las personas que elijas,
 * pasos, y desde aquí a cocinar o a la compra.
 */
export function RecipeSheet({ recipe, onClose, onEdit }: { recipe: Recipe | null; onClose: () => void; onEdit: (r: Recipe) => void }) {
  const [cooking, setCooking] = useState<{ recipe: Recipe; people: number } | null>(null)
  return (
    <>
      <Modal open={!!recipe} onClose={onClose} position="center" className="max-w-lg">
        {recipe && <SheetBody key={recipe.id} recipe={recipe} onClose={onClose} onEdit={() => onEdit(recipe)} onCook={(people) => (onClose(), setCooking({ recipe, people }))} />}
      </Modal>
      <AnimatePresence>{cooking && <CookMode key="cook" recipe={cooking.recipe} people={cooking.people} onClose={() => setCooking(null)} />}</AnimatePresence>
    </>
  )
}

function SheetBody({ recipe, onClose, onEdit, onCook }: { recipe: Recipe; onClose: () => void; onEdit: () => void; onCook: (people: number) => void }) {
  const [people, setPeople] = useState(recipe.servings ?? 2)
  const lines = useScaled(recipe, people)
  const host = useMemo(() => {
    try {
      return recipe.source ? new URL(recipe.source).hostname.replace(/^www\./, '') : undefined
    } catch {
      return undefined
    }
  }, [recipe.source])
  return (
    <div>
      <ModalHeader title={recipe.name} onClose={onClose} left={<IconButton label="Editar la receta" onClick={onEdit} className="h-8 w-8"><Pencil size={14} /></IconButton>} />
      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 pb-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <Servings value={people} onChange={setPeople} base={recipe.servings} />
          {recipe.minutes && (
            <span className="inline-flex items-center gap-1">
              <Clock size={13} strokeWidth={2.4} aria-hidden /> {minutesText(recipe.minutes)}
            </span>
          )}
          {host && (
            <a href={recipe.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue hover:underline">
              <ExternalLink size={12} strokeWidth={2.4} aria-hidden /> {host}
            </a>
          )}
        </div>
        {!recipe.servings && <p className="-mt-3 text-[12.5px] text-muted">Pon para cuántas personas es (en Editar) y las cantidades se ajustarán solas.</p>}
        <section aria-labelledby="recipe-ingredients">
          <h3 id="recipe-ingredients" className="mb-2 text-[13px] font-bold text-muted">
            Ingredientes · {lines.length}
          </h3>
          <ul className="space-y-1 text-[15px]">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                {l}
              </li>
            ))}
          </ul>
        </section>
        {!!recipe.steps?.length && (
          <section aria-labelledby="recipe-steps">
            <h3 id="recipe-steps" className="mb-2 text-[13px] font-bold text-muted">
              Pasos · {recipe.steps.length}
            </h3>
            <ol className="space-y-2.5 text-[15px] leading-relaxed">
              {recipe.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill text-[12px] font-bold">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {recipe.notes && <p className="rounded-xl bg-fill-2 px-3.5 py-2.5 text-[14px] text-muted">{recipe.notes}</p>}
      </div>
      <div className="flex gap-2 px-5 pt-1 pb-5">
        <Button className="flex-1" onClick={() => void toShopping(lines)}>
          <ShoppingCart size={15} /> A la compra
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onCook(people)}>
          <ChefHat size={16} /> Cocinar
        </Button>
      </div>
    </div>
  )
}

/** La pantalla encendida mientras se cocina (donde el navegador lo permite) */
function useWakeLock() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }
    let lock: Lock | undefined
    const take = () => void nav.wakeLock?.request('screen').then((l) => (lock = l), () => {})
    take()
    // Al volver a la app se pierde: se pide otra vez
    const onVisible = () => document.visibilityState === 'visible' && take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [])
}

/**
 * Modo cocina (como en Paprika): a pantalla completa, un paso cada vez y en
 * grande, con la pantalla siempre encendida, los ingredientes a mano para
 * tacharlos y un temporizador por cada tiempo que diga el paso.
 */
function CookMode({ recipe, people, onClose }: { recipe: Recipe; people: number; onClose: () => void }) {
  useWakeLock()
  const lines = useScaled(recipe, people)
  const steps = recipe.steps?.length ? recipe.steps : ['Prepara los ingredientes.']
  const [step, setStep] = useState(0)
  const [showIngredients, setShowIngredients] = useState(!recipe.steps?.length)
  const [crossed, setCrossed] = useState<Set<number>>(new Set())
  const [timer, setTimer] = useState<{ minutes: number; key: string } | null>(null)
  const timers = stepTimers(steps[step])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setStep((s) => Math.min(steps.length - 1, s + 1))
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, steps.length])
  return (
    <motion.div
      role="dialog"
      aria-label={`Cocinar: ${recipe.name}`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={softSpring}
      className="fixed inset-0 z-[80] flex flex-col bg-bg"
    >
      <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <button type="button" aria-label="Salir del modo cocina" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-fill text-fg active:scale-90">
          <X size={18} strokeWidth={2.6} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{recipe.name}</p>
          <p className="font-num text-[13px] text-muted">
            Para {people} · paso {step + 1} de {steps.length}
          </p>
        </div>
        <Button size="sm" variant={showIngredients ? 'primary' : 'secondary'} onClick={() => setShowIngredients((v) => !v)} aria-pressed={showIngredients}>
          <ListChecks size={15} /> Ingredientes
        </Button>
      </div>

      <div className="mt-4 flex gap-1.5 px-4" aria-hidden>
        {steps.map((_, i) => (
          <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-blue' : 'bg-fill')} />
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
        {showIngredients ? (
          <ul className="mx-auto w-full max-w-lg space-y-1">
            {lines.map((l, i) => {
              const on = crossed.has(i)
              return (
                <li key={i}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setCrossed((c) => (c.has(i) ? new Set([...c].filter((x) => x !== i)) : new Set([...c, i])))}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-[18px] hover:bg-hover"
                  >
                    <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-green bg-green text-on-green' : 'border-faint')}>{on && <Check size={14} strokeWidth={3.2} />}</span>
                    <span className={cx(on && 'text-muted line-through')}>{l}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="m-auto flex w-full max-w-xl flex-col items-center text-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={step}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={softSpring}
                className="text-[26px] leading-[1.35] font-semibold tracking-tight [text-wrap:pretty] sm:text-[30px]"
              >
                {steps[step]}
              </motion.p>
            </AnimatePresence>
            {timers.length > 0 && (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {timers.map((t, i) => (
                  <Button key={`${step}-${i}`} variant="tinted" onClick={() => setTimer({ minutes: t, key: `${step}-${i}-${Date.now()}` })}>
                    <Timer size={15} /> {minutesText(t)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
        {timer && (
          <div className="glass-thick mx-auto mt-6 w-full max-w-sm rounded-[22px] p-4">
            <div className="mb-1 flex items-center">
              <p className="flex-1 text-[13px] font-semibold text-muted">Temporizador · {minutesText(timer.minutes)}</p>
              <IconButton label="Quitar el temporizador" onClick={() => setTimer(null)} className="h-8 w-8">
                <X size={14} />
              </IconButton>
            </div>
            <Countdown key={timer.key} minutes={timer.minutes} label={`Temporizador de ${minutesText(timer.minutes)}`} />
          </div>
        )}
      </div>

      <div className="flex gap-3 px-4 pb-[max(env(safe-area-inset-bottom),18px)]">
        <Button size="lg" variant="secondary" className="flex-1" disabled={step === 0} onClick={() => (setShowIngredients(false), setStep((s) => s - 1))}>
          <ChevronLeft size={18} /> Anterior
        </Button>
        {step < steps.length - 1 ? (
          <Button size="lg" variant="primary" className="flex-1" onClick={() => (setShowIngredients(false), setStep((s) => s + 1))}>
            Siguiente <ChevronRight size={18} />
          </Button>
        ) : (
          <Button size="lg" variant="primary" className="flex-1" onClick={() => (haptic('success'), toast('¡Que aproveche!'), onClose())}>
            <Check size={18} /> Terminado
          </Button>
        )}
      </div>
    </motion.div>
  )
}

export function RecipeForm({ recipe, onClose }: { recipe: Recipe | 'new' | null; onClose: () => void }) {
  return (
    <Modal open={!!recipe} onClose={onClose} position="center">
      {recipe && <RecipeFields key={recipe === 'new' ? 'new' : recipe.id} recipe={recipe === 'new' ? undefined : recipe} onClose={onClose} />}
    </Modal>
  )
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

function RecipeFields({ recipe, onClose }: { recipe?: Recipe; onClose: () => void }) {
  const { user } = useSync()
  const [name, setName] = useState(recipe?.name ?? '')
  const [ingredients, setIngredients] = useState((recipe?.ingredients ?? []).join('\n'))
  const [steps, setSteps] = useState((recipe?.steps ?? []).join('\n'))
  const [servings, setServings] = useState(recipe?.servings ? String(recipe.servings) : '')
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '')
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const [source, setSource] = useState(recipe?.source)
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const ing = lines(ingredients)

  const fill = (r: RecipeData) => {
    setName(r.name)
    setIngredients(r.ingredients.join('\n'))
    setSteps(r.steps.join('\n'))
    setServings(r.servings ? String(r.servings) : '')
    setMinutes(r.minutes ? String(r.minutes) : '')
    setSource(r.source)
    setPaste('')
    toast(`«${r.name}»: ${r.ingredients.length} ingredientes y ${r.steps.length} pasos. Revísalo y guarda.`)
  }
  const doImport = async () => {
    if (!paste.trim()) return
    setBusy(true)
    setImportError(null)
    const r = await importRecipe(paste, !!user)
    setBusy(false)
    if ('recipe' in r) fill(r.recipe)
    else setImportError(r.error)
  }
  const num = (s: string) => {
    const n = Math.round(Number(s.replace(',', '.')))
    return n > 0 ? n : undefined
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        await saveRecipe({ name: name.trim(), ingredients: ing, steps: lines(steps), servings: num(servings), minutes: num(minutes), source, notes: notes.trim() || undefined }, recipe?.id)
        onClose()
      }}
    >
      <ModalHeader title={recipe ? 'Editar receta' : 'Nueva receta'} onClose={onClose} />
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
        {!recipe && (
          <div className="rounded-[16px] bg-fill-2 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <Link2 size={14} strokeWidth={2.4} aria-hidden /> Importar
            </p>
            <Textarea
              value={paste}
              onChange={(e) => (setPaste(e.target.value), setImportError(null))}
              aria-label="Enlace o texto de la receta"
              rows={looksLikeUrl(paste) || !paste ? 1 : 4}
              placeholder="Pega el enlace de una web de recetas, o el texto entero"
              className="rounded-xl bg-[var(--c-material)] px-3 py-2.5 text-[15px]"
            />
            {importError && (
              <p role="alert" className="mt-2 text-[13px] font-medium text-fg">
                {importError}
              </p>
            )}
            <Button type="button" size="sm" className="mt-2" disabled={!paste.trim() || busy} onClick={() => void doImport()}>
              {busy ? 'Leyendo la receta…' : looksLikeUrl(paste) ? 'Traer de la web' : 'Leer el texto'}
            </Button>
          </div>
        )}
        <Field label="Nombre">
          <Input autoFocus={!recipe} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tortilla de patatas" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Para cuántas personas">
            <Input inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
          </Field>
          <Field label="Minutos en total">
            <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" />
          </Field>
        </div>
        <Field label={`Ingredientes (uno por línea)${ing.length ? ` · ${ing.length}` : ''}`}>
          <Textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={5} placeholder={'6 huevos\n1 kg de patatas\n1 cebolla'} className="min-h-[120px] rounded-xl bg-fill-2 px-3.5 py-3 text-[15px]" />
        </Field>
        <Field label="Pasos (uno por línea)">
          <Textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} placeholder={'Pela y corta las patatas.\nFríelas 20 minutos a fuego lento.'} className="min-h-[96px] rounded-xl bg-fill-2 px-3.5 py-3 text-[15px]" />
        </Field>
        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Trucos, variantes, de dónde es…" className="min-h-[72px] rounded-xl bg-fill-2 px-3.5 py-2.5 text-[15px]" />
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

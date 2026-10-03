import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Med } from '@/db/types'
import { addDaysYmd, today } from '@/lib/dates'
import { PILL_COLORS, cleanTimes } from '@/lib/meds'
import { Button, Field, Input, Modal, ModalHeader, Segmented, cx } from '@/components/ui'
import { toastTrashed } from '../trash/undo'
import { createMed, deleteMed, updateMed } from './actions'
import { PillDot } from './parts'

const WEEK = [
  { d: 1, label: 'L', name: 'lunes' },
  { d: 2, label: 'M', name: 'martes' },
  { d: 3, label: 'X', name: 'miércoles' },
  { d: 4, label: 'J', name: 'jueves' },
  { d: 5, label: 'V', name: 'viernes' },
  { d: 6, label: 'S', name: 'sábado' },
  { d: 0, label: 'D', name: 'domingo' },
]
/** Lo típico, para no tener que escribir la hora */
const MOMENTS = [
  { time: '08:00', label: 'Desayuno' },
  { time: '14:00', label: 'Comida' },
  { time: '21:00', label: 'Cena' },
  { time: '23:00', label: 'Al acostarte' },
]
const num = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function MedForm({ med, open, onClose }: { med?: Med; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form med={med} onClose={onClose} />}
    </Modal>
  )
}

function Form({ med, onClose }: { med?: Med; onClose: () => void }) {
  const [name, setName] = useState(med?.name ?? '')
  const [dose, setDose] = useState(med?.dose ?? '')
  const [scheduled, setScheduled] = useState(med ? med.times.length > 0 : true)
  const [times, setTimes] = useState<string[]>(med?.times.length ? med.times : ['09:00'])
  const [days, setDays] = useState<number[]>(med?.days?.length ? med.days : [])
  const [until, setUntil] = useState(med?.until ?? '')
  const [stock, setStock] = useState(med?.stock !== undefined ? String(med.stock) : '')
  const [perDose, setPerDose] = useState(med?.perDose ? String(med.perDose) : '')
  const [maxPerDay, setMaxPerDay] = useState(med?.maxPerDay ? String(med.maxPerDay) : '')
  const [note, setNote] = useState(med?.note ?? '')
  const [color, setColor] = useState(med?.color ?? PILL_COLORS[0])

  const save = async () => {
    if (!name.trim()) return
    const t = today()
    const data: Partial<Med> & { name: string } = {
      name: name.trim(),
      dose: dose.trim() || undefined,
      times: scheduled ? cleanTimes(times) : [],
      days: scheduled && days.length && days.length < 7 ? days : undefined,
      // Empieza hoy (o cuando empezó): lo de antes no cuenta como olvidado
      from: med?.from ?? t,
      until: until || undefined,
      stock: stock.trim() === '' ? undefined : Math.max(0, Math.round(Number(stock.replace(',', '.')) || 0)),
      perDose: num(perDose),
      maxPerDay: scheduled ? undefined : num(maxPerDay),
      note: note.trim() || undefined,
      color,
    }
    if (med) await updateMed(med.id, data)
    else await createMed(data)
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={med ? 'Editar' : 'Nuevo medicamento'} onClose={onClose} />
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill">
            <PillDot color={color} size={18} />
          </span>
          <Input autoFocus={!med} aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ibuprofeno" />
        </div>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Dosis">
              <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="600 mg, 1 comprimido…" />
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <Field label="Nota">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Con comida, en ayunas…" />
            </Field>
          </div>
        </div>
        <Segmented
          className="w-full"
          value={scheduled ? 'yes' : 'no'}
          onChange={(v) => setScheduled(v === 'yes')}
          options={[
            { value: 'yes', label: 'A sus horas' },
            { value: 'no', label: 'Cuando haga falta' },
          ]}
        />
        {scheduled ? (
          <>
            <Field label="Horas" group>
              <div className="space-y-1.5">
                {times.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input type="time" aria-label={`Hora ${i + 1}`} value={t} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1" />
                    {times.length > 1 && (
                      <button type="button" aria-label={`Quitar la hora ${i + 1}`} onClick={() => setTimes(times.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {MOMENTS.filter((m) => !times.includes(m.time)).map((m) => (
                    <button key={m.time} type="button" onClick={() => setTimes(cleanTimes([...times, m.time]))} className="flex h-8 items-center gap-1 rounded-full bg-fill px-3 text-[13px] font-medium hover:bg-press">
                      <Plus size={13} strokeWidth={2.6} /> {m.label} · {m.time.replace(/^0/, '')}
                    </button>
                  ))}
                  <button type="button" onClick={() => setTimes([...times, '12:00'])} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-blue hover:bg-hover">
                    <Plus size={13} strokeWidth={2.6} /> Otra hora
                  </button>
                </div>
              </div>
            </Field>
            <Field label="Días" group>
              <div className="flex gap-1">
                {WEEK.map((w) => {
                  const on = !days.length || days.includes(w.d)
                  return (
                    <button
                      key={w.d}
                      type="button"
                      aria-label={w.name}
                      aria-pressed={on}
                      onClick={() => {
                        const all = days.length ? days : WEEK.map((x) => x.d)
                        const next = all.includes(w.d) ? all.filter((x) => x !== w.d) : [...all, w.d]
                        setDays(next.length >= 7 ? [] : next)
                      }}
                      className={cx('flex h-9 flex-1 items-center justify-center rounded-full text-[13px] font-semibold transition-colors', on ? 'bg-accent-fill text-white' : 'bg-fill text-muted')}
                    >
                      {w.label}
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field label="Tratamiento: hasta (opcional)" group>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" aria-label="Último día" value={until} min={today()} onChange={(e) => setUntil(e.target.value)} className="w-auto flex-1" />
                {[5, 7, 10].map((n) => (
                  <button key={n} type="button" onClick={() => setUntil(addDaysYmd(med?.from ?? today(), n - 1))} className="flex h-9 items-center rounded-full bg-fill px-3 text-[13px] font-medium hover:bg-press">
                    {n} días
                  </button>
                ))}
                {until && (
                  <button type="button" onClick={() => setUntil('')} className="h-9 rounded-full px-2 text-[13px] font-semibold text-blue hover:bg-hover">
                    Sin fin
                  </button>
                )}
              </div>
            </Field>
          </>
        ) : (
          <Field label="Como mucho, al día (opcional)">
            <Input inputMode="numeric" value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} placeholder="Ej. 3" />
          </Field>
        )}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Quedan en casa">
              <Input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Ej. 20" />
            </Field>
          </div>
          <div className="w-28 shrink-0">
            <Field label="Por toma">
              <Input inputMode="decimal" value={perDose} onChange={(e) => setPerDose(e.target.value)} placeholder="1" />
            </Field>
          </div>
        </div>
        <p className="-mt-3 px-1 text-[12.5px] text-muted">Se descuenta al marcarla y te avisa cuando quede para una semana.</p>
        <Field label="Color" group>
          <div className="flex gap-2">
            {PILL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx('flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-90', color === c && 'bg-fill shadow-[0_0_0_2px_var(--c-blue)]')}
              >
                <PillDot color={c} size={20} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {med && (
          <Button type="button" variant="danger" onClick={async () => (await deleteMed(med.id), onClose(), toastTrashed('En la papelera', 'meds', med.id))}>
            <Trash2 size={15} /> Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {med ? 'Guardar' : 'Crear'}
        </Button>
      </div>
    </form>
  )
}

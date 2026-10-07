import { useRef, useState } from 'react'
import { Camera, Receipt, Trash2, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Thing, ThingKind } from '@/db/types'
import { db } from '@/db/db'
import { createThing, deleteThing, updateThing } from '@/db/moreActions'
import { today } from '@/lib/dates'
import { DEFAULT_NOTIFY_DAYS, KIND_LABEL, addYears, compressPhoto } from '@/lib/things'
import { roomsIn } from '@/lib/rooms'
import { toast } from '@/app/store'
import { toastTrashed } from '../trash/undo'
import { Button, cx } from '@/components/ui'
import { Field, Input, Segmented, Select, Textarea } from '@/components/form'
import { Modal, ModalHeader } from '@/components/Modal'

const KINDS: ThingKind[] = ['stored', 'lent', 'borrowed', 'document']
const PLACEHOLDER: Record<ThingKind, string> = {
  stored: 'Ej. Pasaporte, llaves de repuesto, cargador…',
  lent: 'Ej. Taladro, libro, tupper…',
  borrowed: 'Ej. Libro de Pepe…',
  document: 'Ej. DNI, ITV del coche, garantía de la lavadora…',
}

export function ThingForm({ thing, kind, open, onClose }: { thing?: Thing; kind?: ThingKind; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form thing={thing} initialKind={kind} onClose={onClose} />}
    </Modal>
  )
}

function Form({ thing, initialKind, onClose }: { thing?: Thing; initialKind?: ThingKind; onClose: () => void }) {
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), []) ?? []
  const [kind, setKind] = useState<ThingKind>(thing?.kind ?? initialKind ?? 'stored')
  const [name, setName] = useState(thing?.name ?? '')
  const [location, setLocation] = useState(thing?.location ?? '')
  const [personId, setPersonId] = useState(thing?.personId ?? '')
  const [personName, setPersonName] = useState(thing?.personName ?? '')
  const [since, setSince] = useState(thing?.since ?? today())
  const [returnBy, setReturnBy] = useState(thing?.returnBy ?? '')
  const [expires, setExpires] = useState(thing?.expires ?? '')
  const [notifyDays, setNotifyDays] = useState(thing?.notifyDays ?? DEFAULT_NOTIFY_DAYS)
  const [notes, setNotes] = useState(thing?.notes ?? '')
  const [photo, setPhoto] = useState(thing?.photo)
  const [room, setRoom] = useState(thing?.room ?? '')
  const [bought, setBought] = useState(thing?.bought ?? '')
  const [price, setPrice] = useState(thing?.price ? String(thing.price).replace('.', ',') : '')
  const [warranty, setWarranty] = useState(thing?.warranty ?? '')
  const [receipt, setReceipt] = useState(thing?.receipt)
  const rooms = roomsIn((useLiveQuery(() => db.things.toArray(), []) ?? []).map((t) => t.room))
  const fileRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLInputElement>(null)
  // La garantía, para lo que se tiene (no para lo prestado por otros)
  const owned = kind !== 'borrowed'
  const loan = kind === 'lent' || kind === 'borrowed'
  const who = personId ? (people.find((p) => p.id === personId)?.name ?? personName) : personName.trim()
  const valid = name.trim() && (!loan || who) && (kind !== 'document' || expires)

  const save = async () => {
    if (!valid) return
    const data: Partial<Thing> = {
      name: name.trim(),
      kind,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      photo,
      personId: loan && personId ? personId : undefined,
      // El nombre se guarda siempre: el aviso del servidor lo necesita
      personName: loan ? who || undefined : undefined,
      since: loan ? since || undefined : undefined,
      returnBy: loan ? returnBy || undefined : undefined,
      expires: kind === 'document' ? expires || undefined : undefined,
      notifyDays: kind === 'document' ? notifyDays : undefined,
      room: room.trim() || undefined,
      bought: owned ? bought || undefined : undefined,
      price: owned && Number(price.replace(',', '.')) > 0 ? Math.round(Number(price.replace(',', '.')) * 100) / 100 : undefined,
      warranty: owned ? warranty || undefined : undefined,
      receipt: owned ? receipt : undefined,
    }
    if (thing) await updateThing(thing.id, data)
    else await createThing(data as Thing)
    toast(thing ? 'Guardado' : `«${name.trim()}» apuntado`)
    onClose()
  }

  const pickPhoto = async (f?: File, set = setPhoto) => {
    if (!f) return
    try {
      // El ticket, algo más grande para que se lea
      set(set === setReceipt ? await compressPhoto(f, 1100, 0.7) : await compressPhoto(f))
    } catch {
      toast('No se pudo leer la foto')
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={thing ? 'Editar' : 'Apuntar una cosa'} onClose={onClose} />
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
        <Segmented value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} className="flex w-full" />
        <Field label="Qué">
          <Input autoFocus={!thing} value={name} onChange={(e) => setName(e.target.value)} placeholder={PLACEHOLDER[kind]} />
        </Field>

        {loan && (
          <Field label={kind === 'lent' ? 'A quién se lo prestaste' : 'Quién te lo prestó'} group>
            <div className="flex gap-2">
              {people.length > 0 && (
                <Select value={personId} onChange={(e) => setPersonId(e.target.value)} className="flex-1" aria-label="Persona">
                  <option value="">Otra persona…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
              {!personId && <Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Nombre" className="flex-1" aria-label="Nombre de la persona" />}
            </div>
          </Field>
        )}

        {loan && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde">
              <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            </Field>
            <Field label={kind === 'lent' ? 'Reclamar el' : 'Devolver antes del'}>
              <Input type="date" value={returnBy} onChange={(e) => setReturnBy(e.target.value)} />
            </Field>
          </div>
        )}

        {kind === 'document' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Caduca el">
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </Field>
            <Field label="Avisarme">
              <Select value={notifyDays} onChange={(e) => setNotifyDays(Number(e.target.value))}>
                {[7, 15, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} días antes` : `${d / 30} meses antes`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          <Field label="Dónde está">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={kind === 'lent' ? 'Opcional' : 'Ej. Cajón de la entrada…'} />
          </Field>
          <Field label="Estancia">
            <Input list="thing-rooms" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Salón…" />
            <datalist id="thing-rooms">
              {rooms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
        </div>

        {owned && (
          <fieldset className="space-y-3 rounded-[16px] bg-fill-2 p-3">
            <legend className="sr-only">Compra y garantía</legend>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold" aria-hidden>
              <Receipt size={14} strokeWidth={2.4} /> Compra y garantía <span className="font-normal text-muted">(opcional)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Comprado el">
                <Input type="date" value={bought} max={today()} onChange={(e) => setBought(e.target.value)} />
              </Field>
              <Field label="Precio">
                <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="€" />
              </Field>
            </div>
            <Field label="Garantía hasta">
              <Input type="date" value={warranty} onChange={(e) => setWarranty(e.target.value)} />
            </Field>
            {bought && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {[2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWarranty(addYears(bought, n))}
                    className={cx('h-8 rounded-full px-3 text-[13px] font-semibold', warranty === addYears(bought, n) ? 'bg-accent-fill text-white' : 'bg-[var(--c-material)] text-fg hover:bg-hover')}
                  >
                    {n} años desde la compra
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              {receipt && (
                <span className="relative">
                  <a href={receipt} target="_blank" rel="noreferrer" aria-label="Ver el ticket">
                    <img src={receipt} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  </a>
                  <button type="button" aria-label="Quitar el ticket" onClick={() => setReceipt(undefined)} className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-bg">
                    <X size={13} strokeWidth={2.6} />
                  </button>
                </span>
              )}
              <Button type="button" size="sm" onClick={() => receiptRef.current?.click()}>
                <Camera size={14} /> {receipt ? 'Cambiar el ticket' : 'Foto del ticket o la factura'}
              </Button>
              <input ref={receiptRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0], setReceipt)} />
            </div>
            {warranty && <p className="text-[12.5px] text-muted">Te avisaré un mes antes de que acabe la garantía.</p>}
          </fieldset>
        )}

        <Field label="Foto" group>
          <div className="flex items-center gap-3">
            {photo ? (
              <span className="relative">
                <img src={photo} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button type="button" aria-label="Quitar la foto" onClick={() => setPhoto(undefined)} className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-fg text-bg">
                  <X size={13} strokeWidth={2.6} />
                </button>
              </span>
            ) : null}
            <Button type="button" onClick={() => fileRef.current?.click()}>
              <Camera size={15} /> {photo ? 'Cambiar' : 'Hacer o elegir foto'}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          </div>
          <p className="mt-1.5 px-1 text-[12.5px] text-muted">Una foto del sitio ayuda a encontrarlo a la primera.</p>
        </Field>

        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opcional" className="min-h-[72px] rounded-xl bg-fill-2 px-3.5 py-2.5 text-[15px]" />
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {thing && (
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              await deleteThing(thing.id)
              onClose()
              toastTrashed('En la papelera', 'things', thing.id)
            }}
          >
            <Trash2 size={15} /> Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid} className={cx(!valid && 'opacity-50')}>
          {thing ? 'Guardar' : 'Apuntar'}
        </Button>
      </div>
    </form>
  )
}

import { useRef, useState } from 'react'
import { Camera, Trash2, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Thing, ThingKind } from '@/db/types'
import { db } from '@/db/db'
import { createThing, deleteThing, updateThing } from '@/db/actions'
import { today } from '@/lib/dates'
import { DEFAULT_NOTIFY_DAYS, KIND_LABEL, compressPhoto } from '@/lib/things'
import { toast } from '@/app/store'
import { toastTrashed } from '../trash/undo'
import { Button, Field, Input, Modal, ModalHeader, Segmented, Select, Textarea, cx } from '@/components/ui'

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
  const fileRef = useRef<HTMLInputElement>(null)
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
    }
    if (thing) await updateThing(thing.id, data)
    else await createThing(data as Thing)
    toast(thing ? 'Guardado' : `«${name.trim()}» apuntado`)
    onClose()
  }

  const pickPhoto = async (f?: File) => {
    if (!f) return
    try {
      setPhoto(await compressPhoto(f))
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
          <Field label={kind === 'lent' ? 'A quién se lo prestaste' : 'Quién te lo prestó'}>
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

        <Field label="Dónde está">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={kind === 'lent' ? 'Opcional' : 'Ej. Cajón de la entrada, altillo del armario…'} />
        </Field>

        <Field label="Foto">
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
          <p className="mt-1.5 px-1 text-[12.5px] text-faint">Una foto del sitio ayuda a encontrarlo a la primera.</p>
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

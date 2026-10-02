import { useRef, useState } from 'react'
import { Bold, Heading2, ImagePlus, List, ListChecks, X } from 'lucide-react'
import { compressPhoto } from '@/lib/things'
import { toast } from '@/app/store'
import { Modal, Switch, cx } from '@/components/ui'

export const MAX_PHOTOS = 6

/** Lo que se puede hacer desde la barra de formato */
export type FormatAction = 'check' | 'heading' | 'bold' | 'list'

/** Barra de formato al escribir (como la de Notas de Apple): casilla, título, negrita, lista y foto */
export function FormatBar({ onFormat, onPhoto, photos }: { onFormat: (a: FormatAction) => void; onPhoto: (dataUrl: string) => void; photos: number }) {
  const file = useRef<HTMLInputElement>(null)
  const btn = 'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-fg transition-colors hover:bg-hover active:scale-95'
  return (
    <div role="toolbar" aria-label="Formato" className="mb-2 -ml-2 flex flex-wrap items-center gap-0.5">
      {/* Sin robar el foco al texto: la marca va donde está el cursor */}
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat('check')} aria-label="Casilla">
        <ListChecks size={17} strokeWidth={2.3} />
        <span className="max-sm:hidden">Casilla</span>
      </button>
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat('heading')} aria-label="Título">
        <Heading2 size={17} strokeWidth={2.3} />
      </button>
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat('bold')} aria-label="Negrita">
        <Bold size={16} strokeWidth={2.6} />
      </button>
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => onFormat('list')} aria-label="Lista">
        <List size={17} strokeWidth={2.3} />
      </button>
      <button type="button" className={btn} disabled={photos >= MAX_PHOTOS} onClick={() => file.current?.click()} aria-label="Añadir foto">
        <ImagePlus size={17} strokeWidth={2.3} />
        <span className="max-sm:hidden">Foto</span>
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            onPhoto(await compressPhoto(f, 1000, 0.66))
          } catch {
            toast('No he podido leer esa foto')
          }
        }}
      />
    </div>
  )
}

/** Encima de una lista de casillas: cuántas van, «Desmarcar todo» y «Marcadas al final» (como Notas de Apple) */
export function ChecklistBar({ done, total, sortOn, onSort, onUncheckAll }: { done: number; total: number; sortOn: boolean; onSort: (v: boolean) => void; onUncheckAll: () => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-fill-2 px-3.5 py-2 text-[13.5px]">
      <span className="font-num font-semibold">
        {done} de {total}
      </span>
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-fill">
        <div className="h-full rounded-full bg-blue transition-[width] duration-300" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {done > 0 && (
        <button type="button" onClick={onUncheckAll} className="font-semibold text-blue">
          Desmarcar todo
        </button>
      )}
      <label className="flex items-center gap-2 text-muted">
        Marcadas al final
        <Switch checked={sortOn} onChange={onSort} label="Marcadas al final" />
      </label>
    </div>
  )
}

/** Las fotos de la nota; al escribir, con botón para quitarlas */
export function NotePhotos({ images, editing, onRemove }: { images: string[]; editing: boolean; onRemove: (i: number) => void }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!images.length) return null
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((src, i) => (
          <div key={i} className="relative">
            <button type="button" onClick={() => setOpen(i)} aria-label={`Ver la foto ${i + 1}`} className="block w-full overflow-hidden rounded-[14px] bg-fill">
              <img src={src} alt="" className="aspect-[4/3] w-full object-cover transition-transform hover:scale-[1.02]" />
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Quitar la foto ${i + 1}`}
                className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
              >
                <X size={15} strokeWidth={2.6} />
              </button>
            )}
          </div>
        ))}
      </div>
      <Modal open={open !== null} onClose={() => setOpen(null)} position="center" className="max-w-3xl">
        {open !== null && (
          <div className="relative p-2">
            <img src={images[open]} alt={`Foto ${open + 1}`} className="max-h-[78vh] w-full rounded-[18px] object-contain" />
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Cerrar la foto"
              className={cx('absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur')}
            >
              <X size={17} strokeWidth={2.6} />
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}

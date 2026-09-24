import { toast } from '@/app/store'
import { restoreFromTrash, trashKey } from '@/db/trash'
import type { TrashItem } from '@/db/types'

/** Aviso tras borrar: lo borrado está en la papelera y se puede deshacer */
export function toastTrashed(message: string, tbl: TrashItem['tbl'], id: string) {
  toast(message, { label: 'Deshacer', run: () => void restoreFromTrash(trashKey(tbl, id)) }, 6000)
}

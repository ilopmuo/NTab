import type { Tracker } from '@/db/types'
import { logTracker, setTrackerLog } from '@/db/actions'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'

/** «Lo he hecho hoy», con deshacer */
export async function markDone(t: Tracker) {
  haptic('success')
  const before = await logTracker(t.id)
  if (before) toast(`${t.name}: apuntado hoy`, { label: 'Deshacer', run: () => void setTrackerLog(t.id, before) })
}

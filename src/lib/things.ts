import type { Thing, ThingKind } from '@/db/types'
import { addDaysYmd, fromYmd, today as todayYmd } from './dates'

export const KIND_LABEL: Record<ThingKind, string> = {
  stored: 'Guardado',
  lent: 'Presté',
  borrowed: 'Me dejaron',
  document: 'Caduca',
}

/** Días antes de caducar para avisar, por defecto */
export const DEFAULT_NOTIFY_DAYS = 30

function at(date: string, hh: number) {
  const d = fromYmd(date)
  d.setHours(hh, 0, 0, 0)
  return d.getTime()
}

/**
 * Cuándo avisar de una cosa:
 * - lo que caduca: `notifyDays` antes, a las 9:00;
 * - lo prestado con fecha: ese día, a las 10:00 («¿te lo ha devuelto?»);
 * - lo que me prestaron con fecha: el día antes, a las 9:00.
 * Si se apunta algo que ya está dentro del margen (caduca en 10 días y se
 * avisa 30 antes), se avisa a las 9:00 siguientes, mientras no haya caducado.
 * Lo que ya pasó no se avisa (no se reenvía lo antiguo).
 */
export function computeThingRemindAt(t: Pick<Thing, 'kind' | 'expires' | 'notifyDays' | 'returnBy' | 'returned'>, now = Date.now()): number | undefined {
  let when: number | undefined
  if (t.kind === 'document' && t.expires) {
    when = at(addDaysYmd(t.expires, -(t.notifyDays ?? DEFAULT_NOTIFY_DAYS)), 9)
    if (when <= now) {
      const next = new Date(now)
      if (next.getHours() >= 9) next.setDate(next.getDate() + 1)
      next.setHours(9, 0, 0, 0)
      when = next.getTime() <= at(t.expires, 9) ? next.getTime() : undefined
    }
  }
  else if (t.kind === 'lent' && t.returnBy && !t.returned) when = at(t.returnBy, 10)
  else if (t.kind === 'borrowed' && t.returnBy && !t.returned) when = at(addDaysYmd(t.returnBy, -1), 9)
  return when !== undefined && when > now ? when : undefined
}

/** Días hasta una fecha (negativo si ya pasó) */
export function daysUntil(date: string, today = todayYmd()) {
  return Math.round((fromYmd(date).getTime() - fromYmd(today).getTime()) / 864e5)
}

export function expiryStatus(t: Pick<Thing, 'expires' | 'notifyDays'>, today = todayYmd()): { level: 'expired' | 'soon' | 'ok'; days: number } | null {
  if (!t.expires) return null
  const days = daysUntil(t.expires, today)
  return { days, level: days < 0 ? 'expired' : days <= (t.notifyDays ?? DEFAULT_NOTIFY_DAYS) ? 'soon' : 'ok' }
}

export function relativeLabel(days: number) {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days === -1) return 'ayer'
  if (days > 0) return days < 60 ? `en ${days} días` : `en ${Math.round(days / 30)} meses`
  const d = -days
  return d < 60 ? `hace ${d} días` : `hace ${Math.round(d / 30)} meses`
}

/** ¿Pide atención? (para Hoy): caducado o a punto, préstamo pasado de fecha o muy largo */
export function needsAttention(t: Thing, today = todayYmd()) {
  if (t.returned) return false
  if (t.kind === 'document') return expiryStatus(t, today)?.level !== 'ok'
  if (t.kind === 'lent') return t.returnBy ? t.returnBy <= today : !!t.since && daysUntil(t.since, today) <= -30
  if (t.kind === 'borrowed') return !!t.returnBy && t.returnBy <= addDaysYmd(today, 2)
  return false
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Búsqueda «¿dónde está…?» por nombre, sitio, persona y notas, sin acentos */
export function searchThings(things: Thing[], q: string): Thing[] {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return things
  return things.filter((t) => {
    const hay = fold([t.name, t.location, t.personName, t.notes].filter(Boolean).join(' '))
    return words.every((w) => hay.includes(w))
  })
}

/** Reduce una foto a JPEG pequeño (lado mayor 640 px) para guardarla con la cosa */
export async function compressPhoto(file: File, max = 640, quality = 0.62): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

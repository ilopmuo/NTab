/** Monograma en degradado gris, como en Contactos */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span
      className="font-num flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: 'linear-gradient(180deg, #a9adb6, #7f848d)' }}
    >
      {initials || '?'}
    </span>
  )
}

const PALETTE = ['#0A84FF', '#BF5AF2', '#FF9F0A', '#30D158', '#FF375F', '#40C8E0', '#5E5CE6', '#FFD60A', '#A2845E']

/** Monograma con degradado, como en Contactos */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const color = PALETTE[h % PALETTE.length]
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span
      className="font-num flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 70%, white), ${color})`,
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.25)`,
      }}
    >
      {initials || '?'}
    </span>
  )
}

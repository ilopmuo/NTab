const PALETTE = ['#2F7BFF', '#BF5AF2', '#FF9F0A', '#30D158', '#FF375F', '#64D2FF', '#C5F82A', '#FFD60A']

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
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `${color}24`, color }}
    >
      {initials || '?'}
    </span>
  )
}

import {
  Apple,
  Baby,
  Book,
  Briefcase,
  Camera,
  Car,
  Circle,
  Code,
  Coffee,
  Dog,
  Dumbbell,
  Flame,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Leaf,
  type LucideIcon,
  Moon,
  Music,
  Palette,
  Plane,
  Rocket,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
  Target,
  User,
  Users,
  Wallet,
  Droplet,
  Brain,
  Bike,
  PenLine,
  Pill,
  Footprints,
} from 'lucide-react'

export const ICONS: Record<string, LucideIcon> = {
  circle: Circle,
  briefcase: Briefcase,
  user: User,
  users: Users,
  heart: Heart,
  wallet: Wallet,
  home: Home,
  book: Book,
  graduation: GraduationCap,
  code: Code,
  rocket: Rocket,
  target: Target,
  star: Star,
  sparkles: Sparkles,
  flame: Flame,
  dumbbell: Dumbbell,
  bike: Bike,
  footprints: Footprints,
  apple: Apple,
  droplet: Droplet,
  pill: Pill,
  brain: Brain,
  moon: Moon,
  sun: Sun,
  coffee: Coffee,
  leaf: Leaf,
  music: Music,
  camera: Camera,
  palette: Palette,
  pen: PenLine,
  gamepad: Gamepad2,
  plane: Plane,
  car: Car,
  cart: ShoppingCart,
  gift: Gift,
  dog: Dog,
  baby: Baby,
}

export function Icon({
  name,
  size = 16,
  className,
  style,
  strokeWidth = 2,
}: {
  name: string
  size?: number
  className?: string
  style?: React.CSSProperties
  strokeWidth?: number
}) {
  const C = ICONS[name] ?? Circle
  return <C size={size} className={className} style={style} strokeWidth={strokeWidth} />
}

/** Icono de área en círculo de color con glifo blanco */
export function AreaBadge({ icon, color, size = 24 }: { icon: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: `linear-gradient(180deg, color-mix(in srgb, ${color} 85%, white), ${color})` }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} strokeWidth={2.4} />
    </span>
  )
}

export const COLORS = [
  '#0A84FF', // azul
  '#40C8E0', // verde azulado
  '#30D158', // verde
  '#FFD60A', // amarillo
  '#FF9F0A', // naranja
  '#FF453A', // rojo
  '#FF375F', // rosa
  '#BF5AF2', // morado
  '#5E5CE6', // índigo
  '#A2845E', // marrón
  '#8E8E93', // gris
]

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

/** Icono de área: glifo sobre círculo gris neutro (monocromo) */
export function AreaBadge({ icon, size = 24 }: { icon: string; color?: string; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-fill text-fg" style={{ width: size, height: size }}>
      <Icon name={icon} size={Math.round(size * 0.52)} strokeWidth={2.1} />
    </span>
  )
}

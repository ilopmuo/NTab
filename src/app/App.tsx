import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, m as motion } from 'motion/react'
import { TodayView } from '@/features/Today'
import { DragGhost } from '@/components/dayDrag'
import { useFocus } from '@/features/focus/focus'
import { selection, useSelecting } from '@/features/select/selection'
import { useWhatNowOpen } from '@/features/whatnow/store'
import { runner, useRunner } from '@/features/routines/useRoutines'
import { Toast } from '@/components/Toast'
import { cx } from '@/components/ui'
import { inViewTransition, navigate, placeScroll, useRoute } from './router'
import { useGlobalShortcuts } from './shortcuts'
import { Sidebar } from './Sidebar'
import { announce } from './announce'
import { reducedMotion, useA11yPrefs } from './theme'
import { useFeatures } from './features'
import { FeatureOff } from '@/features/FeatureOff'
import { BackButton, PageTop } from './BackButton'
import { useTaskMenu } from '@/components/taskMenu'
import { pageTop } from './pageTop'
import { MobileBar } from './MobileBar'
import { Splash } from './Splash'
import { ui, useUI } from './store'
import { closeAuth, useSync } from '@/sync/service'
// Los avisos con la app abierta se cargan aparte (ver main.tsx)
const reminders = () => import('@/reminders/local')
import { ReauthBanner } from '@/sync/ReauthBanner'
import { SETTINGS_PAGES, TITLES } from './titles'
import { BarCrash, Boundary, ScreenCrash } from './Boundary'

pageTop.Component = PageTop
pageTop.Back = BackButton

const loadMotionFeatures = () => import('@/lib/motionFeatures').then((m) => m.default)

/** El código de cada pantalla que ya ha llegado */
const loaded = new Map<() => Promise<unknown>, unknown>()
/** Un cargador que, al terminar, deja el componente a mano */
function keep<M extends { default: unknown }>(load: () => Promise<M>) {
  const fn = () =>
    load().then((m) => {
      loaded.set(fn, m.default)
      return m
    })
  return fn
}
/**
 * Como `lazy`, pero si el código ya llegó (lo normal: se precarga), se pinta
 * directamente. Con `lazy` React suspende igualmente la primera vez, enseña el
 * hueco y tarda ~300 ms en enseñar una pantalla que ya tenía.
 */
function warm<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Lazy = lazy(load)
  return function Warm(props: P) {
    // Se decide una vez: cambiar de uno a otro volvería a montar la pantalla
    const [Ready] = useState(() => loaded.get(load) as ComponentType<P> | undefined)
    return Ready ? <Ready {...props} /> : <Lazy {...props} />
  }
}

// Hoy se carga con la app; el resto de vistas, al abrirlas (y en segundo plano
// en cuanto la app está lista, para que navegar siga siendo instantáneo)
const loaders = {
  AreaView: keep(() => import('@/features/areas/AreaView').then((m) => ({ default: m.AreaView }))),
  CalendarView: keep(() => import('@/features/calendar/CalendarView').then((m) => ({ default: m.CalendarView }))),
  FinanceView: keep(() => import('@/features/finance/FinanceView').then((m) => ({ default: m.FinanceView }))),
  FocusView: keep(() => import('@/features/focus/FocusView').then((m) => ({ default: m.FocusView }))),
  HouseView: keep(() => import('@/features/house/HouseView').then((m) => ({ default: m.HouseView }))),
  GoalsView: keep(() => import('@/features/goals/GoalsView').then((m) => ({ default: m.GoalsView }))),
  HabitsView: keep(() => import('@/features/habits/HabitsView').then((m) => ({ default: m.HabitsView }))),
  InboxView: keep(() => import('@/features/Inbox').then((m) => ({ default: m.InboxView }))),
  LogbookView: keep(() => import('@/features/Logbook').then((m) => ({ default: m.LogbookView }))),
  NotesView: keep(() => import('@/features/notes/NotesView').then((m) => ({ default: m.NotesView }))),
  PlanView: keep(() => import('@/features/plan/PlanView').then((m) => ({ default: m.PlanView }))),
  ShutdownView: keep(() => import('@/features/plan/ShutdownView').then((m) => ({ default: m.ShutdownView }))),
  TrashView: keep(() => import('@/features/trash/TrashView').then((m) => ({ default: m.TrashView }))),
  TemplatesView: keep(() => import('@/features/templates/TemplatesView').then((m) => ({ default: m.TemplatesView }))),
  PeopleView: keep(() => import('@/features/people/PeopleView').then((m) => ({ default: m.PeopleView }))),
  PersonView: keep(() => import('@/features/people/PersonView').then((m) => ({ default: m.PersonView }))),
  ProjectView: keep(() => import('@/features/projects/ProjectView').then((m) => ({ default: m.ProjectView }))),
  ProjectsView: keep(() => import('@/features/projects/ProjectsView').then((m) => ({ default: m.ProjectsView }))),
  ReviewView: keep(() => import('@/features/review/ReviewView').then((m) => ({ default: m.ReviewView }))),
  SettingsView: keep(() => import('@/features/settings/SettingsView').then((m) => ({ default: m.SettingsView }))),
  TagView: keep(() => import('@/features/TagView').then((m) => ({ default: m.TagView }))),
  MoreView: keep(() => import('@/features/more/MoreView').then((m) => ({ default: m.MoreView }))),
  SomedayView: keep(() => import('@/features/someday/SomedayView').then((m) => ({ default: m.SomedayView }))),
  MatrixView: keep(() => import('@/features/matrix/MatrixView').then((m) => ({ default: m.MatrixView }))),
  ListsHome: keep(() => import('@/features/lists/ListsHome').then((m) => ({ default: m.ListsHome }))),
  SmartListView: keep(() => import('@/features/lists/SmartListsView').then((m) => ({ default: m.SmartListView }))),
  ThingsView: keep(() => import('@/features/things/ThingsView').then((m) => ({ default: m.ThingsView }))),
  MenuView: keep(() => import('@/features/menu/MenuView').then((m) => ({ default: m.MenuView }))),
  ExpensesView: keep(() => import('@/features/expenses/ExpensesView').then((m) => ({ default: m.ExpensesView }))),
  MoneyView: keep(() => import('@/features/money/MoneyView').then((m) => ({ default: m.MoneyView }))),
  AccountsView: keep(() => import('@/features/money/AccountsView').then((m) => ({ default: m.AccountsView }))),
  JournalView: keep(() => import('@/features/journal/JournalView').then((m) => ({ default: m.JournalView }))),
  ShoppingView: keep(() => import('@/features/shopping/ShoppingView').then((m) => ({ default: m.ShoppingView }))),
  MedsView: keep(() => import('@/features/meds/MedsView').then((m) => ({ default: m.MedsView }))),
  WaitingView: keep(() => import('@/features/waiting/WaitingView').then((m) => ({ default: m.WaitingView }))),
  RoutinesView: keep(() => import('@/features/routines/RoutinesView').then((m) => ({ default: m.RoutinesView }))),
}
const AreaView = warm(loaders.AreaView), CalendarView = warm(loaders.CalendarView), FinanceView = warm(loaders.FinanceView), FocusView = warm(loaders.FocusView), HouseView = warm(loaders.HouseView), GoalsView = warm(loaders.GoalsView), HabitsView = warm(loaders.HabitsView), InboxView = warm(loaders.InboxView), LogbookView = warm(loaders.LogbookView), NotesView = warm(loaders.NotesView), PlanView = warm(loaders.PlanView), ShutdownView = warm(loaders.ShutdownView), TrashView = warm(loaders.TrashView), TemplatesView = warm(loaders.TemplatesView), PeopleView = warm(loaders.PeopleView), PersonView = warm(loaders.PersonView), ProjectView = warm(loaders.ProjectView), ProjectsView = warm(loaders.ProjectsView), ReviewView = warm(loaders.ReviewView), SettingsView = warm(loaders.SettingsView), TagView = warm(loaders.TagView), MoreView = warm(loaders.MoreView), SomedayView = warm(loaders.SomedayView), ListsHome = warm(loaders.ListsHome), MatrixView = warm(loaders.MatrixView), SmartListView = warm(loaders.SmartListView), RoutinesView = warm(loaders.RoutinesView), ThingsView = warm(loaders.ThingsView), MedsView = warm(loaders.MedsView), WaitingView = warm(loaders.WaitingView), ShoppingView = warm(loaders.ShoppingView), JournalView = warm(loaders.JournalView), ExpensesView = warm(loaders.ExpensesView), MoneyView = warm(loaders.MoneyView), AccountsView = warm(loaders.AccountsView), MenuView = warm(loaders.MenuView)

/**
 * Paneles que se abren encima de cualquier vista. No hacen falta para el primer
 * pintado: se cargan aparte y se montan la primera vez que se abren.
 */
const panels = {
  TaskDetailPanel: keep(() => import('@/components/TaskDetail').then((m) => ({ default: m.TaskDetailPanel }))),
  CommandPalette: keep(() => import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette }))),
  ShortcutsHelp: keep(() => import('@/components/ShortcutsHelp').then((m) => ({ default: m.ShortcutsHelp }))),
  RecoveryModal: keep(() => import('@/features/auth/RecoveryModal').then((m) => ({ default: m.RecoveryModal }))),
  FocusMode: keep(() => import('@/features/focus/FocusMode').then((m) => ({ default: m.FocusMode }))),
  RoutineRunner: keep(() => import('@/features/routines/RoutineRunner').then((m) => ({ default: m.RoutineRunner }))),
  WhatNow: keep(() => import('@/features/whatnow/WhatNow').then((m) => ({ default: m.WhatNow }))),
  SelectionBar: keep(() => import('@/features/select/SelectionBar').then((m) => ({ default: m.SelectionBar }))),
  AuthScreen: keep(() => import('@/features/auth/AuthScreen').then((m) => ({ default: m.AuthScreen }))),
  NavEditor: keep(() => import('./NavEditor').then((m) => ({ default: m.NavEditor }))),
  FeaturesSheet: keep(() => import('@/features/settings/FeaturesSheet').then((m) => ({ default: m.FeaturesSheet }))),
  QuickAdd: keep(() => import('@/components/QuickAdd').then((m) => ({ default: m.QuickAdd }))),
  TaskContextMenu: keep(() => import('@/components/TaskContextMenu').then((m) => ({ default: m.TaskContextMenu }))),
}
// Volver deslizando desde el borde: solo con el dedo (en el ordenador ni se carga)
const EdgeBack = lazy(() => import('./EdgeBack').then((m) => ({ default: m.EdgeBack })))
const touchScreen = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

const TaskDetailPanel = warm(panels.TaskDetailPanel), CommandPalette = warm(panels.CommandPalette), ShortcutsHelp = warm(panels.ShortcutsHelp), RecoveryModal = warm(panels.RecoveryModal), FocusMode = warm(panels.FocusMode), RoutineRunner = warm(panels.RoutineRunner), WhatNow = warm(panels.WhatNow), SelectionBar = warm(panels.SelectionBar), AuthScreen = warm(panels.AuthScreen), NavEditor = warm(panels.NavEditor), FeaturesSheet = warm(panels.FeaturesSheet), QuickAdd = warm(panels.QuickAdd), TaskContextMenu = warm(panels.TaskContextMenu)

/**
 * Monta su contenido la primera vez que `when` es cierto y lo deja montado (para que se anime al cerrar).
 * Si falla, desaparece solo ese panel; al cerrarlo y volver a abrirlo (o al abrir otra cosa: `reset`), se reintenta.
 */
function Deferred({ when, reset = when, children }: { when: boolean; reset?: unknown; children: ReactNode }) {
  const [on, setOn] = useState(when)
  if (when && !on) setOn(true)
  return on ? (
    <Boundary where="panel" resetKey={reset} fallback={() => null}>
      <Suspense fallback={null}>{children}</Suspense>
    </Boundary>
  ) : null
}

/** Qué código necesita cada pantalla (por la primera parte de la ruta) */
const ROUTE_CODE: Record<string, () => Promise<unknown>> = {
  inbox: loaders.InboxView,
  upcoming: loaders.CalendarView,
  calendar: loaders.CalendarView,
  habits: loaders.HabitsView,
  routines: loaders.RoutinesView,
  focus: loaders.FocusView,
  house: loaders.HouseView,
  things: loaders.ThingsView,
  trackers: loaders.HabitsView,
  meds: loaders.MedsView,
  waiting: loaders.WaitingView,
  shopping: loaders.ShoppingView,
  journal: loaders.JournalView,
  expenses: loaders.ExpensesView,
  money: loaders.MoneyView,
  accounts: loaders.AccountsView,
  menu: loaders.MenuView,
  notes: loaders.NotesView,
  people: loaders.PeopleView,
  projects: loaders.ProjectsView,
  project: loaders.ProjectView,
  area: loaders.AreaView,
  tag: loaders.TagView,
  tags: loaders.ListsHome,
  goals: loaders.GoalsView,
  finance: loaders.FinanceView,
  review: loaders.ReviewView,
  plan: loaders.PlanView,
  shutdown: loaders.ShutdownView,
  logbook: loaders.LogbookView,
  trash: loaders.TrashView,
  templates: loaders.TemplatesView,
  settings: loaders.SettingsView,
  more: loaders.MoreView,
  someday: loaders.SomedayView,
  matrix: loaders.MatrixView,
  lists: loaders.ListsHome,
  list: loaders.SmartListView,
}

/** Empieza a traer el código de una pantalla (al pasar por encima de su enlace o al tocarlo) */
export function preloadRoute(path: string) {
  const load = ROUTE_CODE[path.replace(/^#?\//, '').split('/')[0]]
  if (load) void load()
}

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
const idle = (cb: () => void) => {
  const ric = (window as IdleWindow).requestIdleCallback
  if (ric) ric(cb, { timeout: 1500 })
  else setTimeout(cb, 300)
}

/**
 * Precarga el resto cuando el navegador está libre: primero lo que más se
 * abre (el detalle de una tarea, la captura, las pestañas y la barra
 * lateral), y de una en una, para no frenar lo que estés haciendo.
 */
function preloadViews() {
  const first = [panels.TaskDetailPanel, panels.QuickAdd, panels.CommandPalette, loaders.InboxView, loaders.CalendarView, loaders.HabitsView, loaders.ProjectsView, loaders.ProjectView, loaders.NotesView, loaders.MoreView]
  const queue = [...new Set([...first, ...Object.values(panels), ...Object.values(loaders)])]
  const next = () =>
    idle(() => {
      const load = queue.shift()
      if (load) void load().finally(next)
    })
  // Un momento después del primer pintado, para que el arranque no lo note
  setTimeout(next, 600)
  // Y en cuanto se apunta a un enlace (o se toca), su pantalla, sin esperar a la cola
  const intent = (e: Event) => {
    const to = (e.target as Element | null)?.closest?.('a')?.getAttribute('href')
    if (to?.startsWith('#/')) preloadRoute(to)
  }
  document.addEventListener('pointerover', intent, { passive: true })
  document.addEventListener('pointerdown', intent, { passive: true })
  document.addEventListener('focusin', intent)
  return () => {
    queue.length = 0
    document.removeEventListener('pointerover', intent)
    document.removeEventListener('pointerdown', intent)
    document.removeEventListener('focusin', intent)
  }
}

function Screen() {
  const { parts } = useRoute()
  const [section, id] = parts
  const features = useFeatures()
  if (section && !features.section(section)) return <FeatureOff id={section} />
  // Un filtro guardado depende de la función «Filtros» (Listas sigue estando)
  if (section === 'list' && !features.on('lists')) return <FeatureOff id="lists" feature="lists" />
  switch (section) {
    case 'more':
      return <MoreView />
    case 'someday':
      return <SomedayView />
    case 'matrix':
      return <MatrixView />
    case 'lists':
      return <ListsHome />
    case 'list':
      return id ? <SmartListView id={id} /> : <ListsHome />
    case 'inbox':
      return <InboxView />
    // Próximo es la vista «Lista» del Calendario
    case 'upcoming':
      return <CalendarView initial="list" />
    case 'calendar':
      return <CalendarView />
    case 'habits':
      return <HabitsView />
    case 'routines':
      return <RoutinesView />
    case 'focus':
      return <FocusView />
    case 'house':
      return <HouseView />
    case 'things':
      return <ThingsView id={id} />
    // Última vez está dentro de Hábitos
    case 'trackers':
      return <HabitsView focus="trackers" />
    case 'meds':
      return <MedsView />
    case 'waiting':
      return <WaitingView />
    case 'shopping':
      return <ShoppingView />
    case 'journal':
      return <JournalView date={id} />
    case 'expenses':
      return <ExpensesView />
    case 'money':
      return <MoneyView />
    case 'accounts':
      return <AccountsView />
    case 'menu':
      return <MenuView />
    case 'notes':
      return <NotesView id={id} />
    case 'people':
      return id ? <PersonView id={id} /> : <PeopleView />
    case 'projects':
      return <ProjectsView />
    // Sin id (un enlace cortado), a la lista
    case 'project':
      return id ? <ProjectView id={id} /> : <ProjectsView />
    case 'area':
      return id ? <AreaView id={id} /> : <ProjectsView />
    case 'tag':
      return id ? <TagView tag={id} /> : <ListsHome />
    case 'tags':
      return <ListsHome />
    case 'goals':
      return <GoalsView />
    case 'finance':
      return <FinanceView />
    case 'review':
      return <ReviewView />
    case 'plan':
      return <PlanView />
    case 'shutdown':
      return <ShutdownView />
    case 'logbook':
      return <LogbookView />
    case 'trash':
      return <TrashView />
    case 'templates':
      return <TemplatesView />
    case 'settings':
      return <SettingsView page={id} />
    default:
      return <TodayView />
  }
}


// El enlace del piso compartido: lo abren tus compañeros, sin cuenta (ni barra lateral)
const GuestHouse = lazy(() => import('@/features/house/GuestHouse').then((m) => ({ default: m.GuestHouse })))

/** El enlace de un email de la cuenta (confirmar, recuperar contraseña) lo lee Supabase al cargar */
const AUTH_IN_URL = /access_token=|error_description=|type=recovery|type=signup/.test(window.location.hash)

export function App() {
  const sync = useSync()
  // Sin sesión y sin cuenta previa en este dispositivo → pantalla de inicio de sesión.
  // Si el dispositivo ya estuvo conectado, la app sigue funcionando con los datos
  // locales y un aviso pide volver a entrar (ver knownEmail en sync/service).
  // Menos movimiento: lo pide el sistema o se ha elegido en Ajustes
  useA11yPrefs()
  const reduce = reducedMotion()
  const needsLogin = sync.state === 'signed-out' && !sync.localOnly && !sync.knownEmail
  // Un dispositivo que ya se usaba (con cuenta o sin ella) no espera a Supabase:
  // la app trabaja con IndexedDB y la sesión llega un momento después
  const early = sync.state === 'loading' && !AUTH_IN_URL && (sync.localOnly || !!sync.knownEmail)
  const waiting = sync.state === 'loading' && !early
  const { parts } = useRoute()
  if (parts[0] === 'piso' && parts[1])
    return (
      <LazyMotion features={loadMotionFeatures}>
        <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
          <Suspense fallback={null}>
            <GuestHouse token={parts[1]} />
          </Suspense>
          <Toast />
        </MotionConfig>
      </LazyMotion>
    )
  return (
    // Motion ligero: los componentes son `m` y sus funciones (layout, arrastrar…) llegan después
    <LazyMotion features={loadMotionFeatures}>
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      {waiting ? null : needsLogin ? (
        <Suspense fallback={null}>
          <AuthScreen />
        </Suspense>
      ) : (
        <Workspace />
      )}
      <AnimatePresence>
        {sync.authOpen && !needsLogin && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] overflow-y-auto bg-[color-mix(in_srgb,var(--c-bg)_70%,transparent)] backdrop-blur-2xl"
          >
            <Suspense fallback={null}>
              <AuthScreen onCancel={closeAuth} initialEmail={sync.knownEmail ?? ''} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
      <Splash ready={!waiting} />
    </MotionConfig>
    </LazyMotion>
  )
}

function Workspace() {
  useGlobalShortcuts()
  useEffect(preloadViews, [])
  const { path, parts } = useRoute()
  const firstRender = useRef(true)
  const panelOpen = useUI((s) => !!s.selectedTaskId)

  // Enlace de una notificación: #/task/<id> abre la tarea sobre Hoy;
  // #/task/<id>/done o /snooze viene de los botones con la app cerrada
  useEffect(() => {
    // Atajo del icono de la app: «Nueva tarea»
    // Compartido desde otra app: a la captura, con el texto o el enlace
    if (parts[0] === 'shared') {
      let text = ''
      try {
        text = sessionStorage.getItem('ntab-shared') ?? ''
        sessionStorage.removeItem('ntab-shared')
      } catch {
        /* sin almacenamiento */
      }
      navigate('/inbox')
      if (text) ui.quickAdd(undefined, text)
      return
    }
    if (parts[0] === 'new') {
      navigate('/today')
      ui.quickAdd()
      return
    }
    // Aviso de una rutina: se abre paso a paso sobre Hoy
    if (parts[0] === 'routine' && parts[1]) {
      navigate('/today')
      runner.open(parts[1])
      return
    }
    // «Tomada» desde el aviso de una toma, con la app cerrada
    if (parts[0] === 'med' && parts[1] && parts[2] === 'med-taken') {
      navigate('/meds')
      void reminders().then((r) => r.applyReminderAction('med-taken', decodeURIComponent(parts[1])))
      return
    }
    if (parts[0] === 'habit' && parts[1] && parts[2] === 'habit-done') {
      navigate('/habits')
      void reminders().then((r) => r.applyReminderAction('habit-done', parts[1]))
      return
    }
    if (parts[0] !== 'task' || !parts[1]) return
    const action = parts[2]
    if (action === 'done' || action === 'snooze') {
      navigate('/today')
      void reminders().then((r) => r.applyReminderAction(action, parts[1]))
    } else void reminders().then((r) => r.openTaskFromNotification(parts[1]))
  }, [parts])

  useEffect(() => {
    // Un apartado de Ajustes, con su nombre («Apariencia · LUNO»)
    const title = (parts[0] === 'settings' && SETTINGS_PAGES[parts[1] as keyof typeof SETTINGS_PAGES]) || (TITLES[parts[0]] ?? 'LUNO')
    document.title = `${title} · LUNO`
    const main = document.getElementById('main')
    placeScroll(`/${parts.join('/')}`)
    // Para quien navega con teclado o lector de pantalla: se anuncia la pantalla
    // y, si venía de la barra lateral o de las pestañas, el foco pasa al contenido
    if (!firstRender.current) {
      announce(title)
      const from = document.activeElement
      if (!from || from === document.body || from.closest('nav')) main?.focus({ preventScroll: true })
    }
    firstRender.current = false
  }, [path, parts])

  const sidebarHidden = useUI((s) => s.sidebarHidden)
  // Abrir una nota o una cosa no cambia de pantalla (no se anima la entrada)
  const screenKey = parts[0] === 'notes' || parts[0] === 'things' || parts[0] === 'journal' ? parts[0] : path
  return (
    <div className="relative z-10 h-full">
      <button
        type="button"
        onClick={() => document.getElementById('main')?.focus()}
        className="sr-only z-[80] rounded-full bg-accent-fill px-4 py-2 text-[14px] font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </button>
      <div id="announcer" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
      <Boundary where="barra lateral" resetKey={path} fallback={(_, retry) => <BarCrash retry={retry} className="bottom-4 left-4 max-md:hidden" />}>
        <Sidebar />
      </Boundary>
      <main
        id="main"
        tabIndex={-1}
        aria-label={TITLES[parts[0]] ?? 'LUNO'}
        className={cx(
          '@container h-full overflow-y-auto overscroll-contain transition-[padding] duration-300',
          !sidebarHidden && 'md:pl-[272px]',
          panelOpen && 'xl:pr-[420px]',
        )}
      >
        <div id="topbar" className="pointer-events-none sticky top-0 z-30 h-0 safe-top" />
        <ReauthBanner />
        <motion.div
          key={screenKey}
          // Con View Transition, la transición ya la hace el navegador
          // Sin desenfoque: difuminar la página entera en cada cambio costaba mucho
          initial={inViewTransition() ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30, mass: 0.8 }}
          className={cx('screen min-h-full', screenKey === 'notes' && 'h-full')}
        >
          {/* Si falla, solo esta pantalla: se ve el error y se puede reintentar o ir a otra */}
          <Boundary where="pantalla" resetKey={path} fallback={(crash, retry) => <ScreenCrash crash={crash} retry={retry} />}>
            {/* Mientras llega (el código o los datos), la pantalla está vacía y se ve su esqueleto (ver .screen en index.css) */}
            <Suspense fallback={null}>
              <Screen />
            </Suspense>
          </Boundary>
        </motion.div>
      </main>
      <Boundary where="barra de pestañas" resetKey={path} fallback={(_, retry) => <BarCrash retry={retry} className="bottom-[max(env(safe-area-inset-bottom),12px)] left-1/2 -translate-x-1/2 md:hidden" />}>
        <MobileBar />
      </Boundary>
      {touchScreen && (
        <Suspense fallback={null}>
          <EdgeBack />
        </Suspense>
      )}
      <Panels />
      <DragGhost />
      <Toast />
    </div>
  )
}

function Panels() {
  const taskId = useUI((s) => s.selectedTaskId)
  const task = !!taskId
  const palette = useUI((s) => s.paletteOpen)
  const help = useUI((s) => s.helpOpen)
  const navEditor = useUI((s) => !!s.navEditor)
  const featuresOpen = useUI((s) => s.featuresOpen)
  const quickAdd = useUI((s) => s.quickAdd.open)
  const taskMenuOpen = !!useTaskMenu()
  const { recovery } = useSync()
  const focusing = !!useFocus()
  const routine = !!useRunner()
  const whatNow = useWhatNowOpen()
  const selecting = useSelecting()
  // Al cambiar de pantalla se sale de la selección
  const { path } = useRoute()
  useEffect(() => void selection.clear(), [path])
  return (
    <>
      <Deferred when={task} reset={taskId}>
        <TaskDetailPanel />
      </Deferred>
      <Deferred when={featuresOpen}>
        <FeaturesSheet />
      </Deferred>
      <Deferred when={palette}>
        <CommandPalette />
      </Deferred>
      <Deferred when={help}>
        <ShortcutsHelp />
      </Deferred>
      <Deferred when={recovery}>
        <RecoveryModal />
      </Deferred>
      <Deferred when={focusing}>
        <FocusMode />
      </Deferred>
      <Deferred when={routine}>
        <RoutineRunner />
      </Deferred>
      <Deferred when={whatNow}>
        <WhatNow />
      </Deferred>
      <Deferred when={selecting}>
        <SelectionBar />
      </Deferred>
      <Deferred when={navEditor}>
        <NavEditor />
      </Deferred>
      <Deferred when={quickAdd}>
        <QuickAdd />
      </Deferred>
      <Deferred when={taskMenuOpen}>
        <TaskContextMenu />
      </Deferred>
    </>
  )
}

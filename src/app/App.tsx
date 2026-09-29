import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { TodayView } from '@/features/Today'
import { DragGhost } from '@/components/dayDrag'
import { useFocus } from '@/features/focus/focus'
import { selection, useSelecting } from '@/features/select/selection'
import { useWhatNowOpen } from '@/features/whatnow/store'
import { runner, useRunner } from '@/features/routines/useRoutines'
import { QuickAdd } from '@/components/QuickAdd'
import { Toast } from '@/components/Toast'
import { cx } from '@/components/ui'
import { navigate, useRoute } from './router'
import { useGlobalShortcuts } from './shortcuts'
import { Sidebar } from './Sidebar'
import { MobileBar } from './MobileBar'
import { Splash } from './Splash'
import { ui, useUI } from './store'
import { closeAuth, useSync } from '@/sync/service'
import { applyReminderAction, openTaskFromNotification } from '@/reminders/local'
import { ReauthBanner } from '@/sync/ReauthBanner'

// Hoy se carga con la app; el resto de vistas, al abrirlas (y en segundo plano
// en cuanto la app está lista, para que navegar siga siendo instantáneo)
const loaders = {
  AreaView: () => import('@/features/areas/AreaView').then((m) => ({ default: m.AreaView })),
  CalendarView: () => import('@/features/calendar/CalendarView').then((m) => ({ default: m.CalendarView })),
  FinanceView: () => import('@/features/finance/FinanceView').then((m) => ({ default: m.FinanceView })),
  GoalsView: () => import('@/features/goals/GoalsView').then((m) => ({ default: m.GoalsView })),
  HabitsView: () => import('@/features/habits/HabitsView').then((m) => ({ default: m.HabitsView })),
  InboxView: () => import('@/features/Inbox').then((m) => ({ default: m.InboxView })),
  LogbookView: () => import('@/features/Logbook').then((m) => ({ default: m.LogbookView })),
  NotesView: () => import('@/features/notes/NotesView').then((m) => ({ default: m.NotesView })),
  PlanView: () => import('@/features/plan/PlanView').then((m) => ({ default: m.PlanView })),
  TrashView: () => import('@/features/trash/TrashView').then((m) => ({ default: m.TrashView })),
  TemplatesView: () => import('@/features/templates/TemplatesView').then((m) => ({ default: m.TemplatesView })),
  PeopleView: () => import('@/features/people/PeopleView').then((m) => ({ default: m.PeopleView })),
  PersonView: () => import('@/features/people/PersonView').then((m) => ({ default: m.PersonView })),
  ProjectView: () => import('@/features/projects/ProjectView').then((m) => ({ default: m.ProjectView })),
  ProjectsView: () => import('@/features/projects/ProjectsView').then((m) => ({ default: m.ProjectsView })),
  ReviewView: () => import('@/features/review/ReviewView').then((m) => ({ default: m.ReviewView })),
  SettingsView: () => import('@/features/settings/SettingsView').then((m) => ({ default: m.SettingsView })),
  TagView: () => import('@/features/TagView').then((m) => ({ default: m.TagView })),
  TagsView: () => import('@/features/tags/TagsView').then((m) => ({ default: m.TagsView })),
  UpcomingView: () => import('@/features/Upcoming').then((m) => ({ default: m.UpcomingView })),
  ThingsView: () => import('@/features/things/ThingsView').then((m) => ({ default: m.ThingsView })),
  MenuView: () => import('@/features/menu/MenuView').then((m) => ({ default: m.MenuView })),
  ExpensesView: () => import('@/features/expenses/ExpensesView').then((m) => ({ default: m.ExpensesView })),
  JournalView: () => import('@/features/journal/JournalView').then((m) => ({ default: m.JournalView })),
  ShoppingView: () => import('@/features/shopping/ShoppingView').then((m) => ({ default: m.ShoppingView })),
  TrackersView: () => import('@/features/trackers/TrackersView').then((m) => ({ default: m.TrackersView })),
  RoutinesView: () => import('@/features/routines/RoutinesView').then((m) => ({ default: m.RoutinesView })),
}
const AreaView = lazy(loaders.AreaView), CalendarView = lazy(loaders.CalendarView), FinanceView = lazy(loaders.FinanceView), GoalsView = lazy(loaders.GoalsView), HabitsView = lazy(loaders.HabitsView), InboxView = lazy(loaders.InboxView), LogbookView = lazy(loaders.LogbookView), NotesView = lazy(loaders.NotesView), PlanView = lazy(loaders.PlanView), TrashView = lazy(loaders.TrashView), TemplatesView = lazy(loaders.TemplatesView), PeopleView = lazy(loaders.PeopleView), PersonView = lazy(loaders.PersonView), ProjectView = lazy(loaders.ProjectView), ProjectsView = lazy(loaders.ProjectsView), ReviewView = lazy(loaders.ReviewView), SettingsView = lazy(loaders.SettingsView), TagView = lazy(loaders.TagView), TagsView = lazy(loaders.TagsView), UpcomingView = lazy(loaders.UpcomingView), RoutinesView = lazy(loaders.RoutinesView), ThingsView = lazy(loaders.ThingsView), TrackersView = lazy(loaders.TrackersView), ShoppingView = lazy(loaders.ShoppingView), JournalView = lazy(loaders.JournalView), ExpensesView = lazy(loaders.ExpensesView), MenuView = lazy(loaders.MenuView)

/**
 * Paneles que se abren encima de cualquier vista. No hacen falta para el primer
 * pintado: se cargan aparte y se montan la primera vez que se abren.
 */
const panels = {
  TaskDetailPanel: () => import('@/components/TaskDetail').then((m) => ({ default: m.TaskDetailPanel })),
  CommandPalette: () => import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })),
  ShortcutsHelp: () => import('@/components/ShortcutsHelp').then((m) => ({ default: m.ShortcutsHelp })),
  RecoveryModal: () => import('@/features/auth/RecoveryModal').then((m) => ({ default: m.RecoveryModal })),
  FocusMode: () => import('@/features/focus/FocusMode').then((m) => ({ default: m.FocusMode })),
  RoutineRunner: () => import('@/features/routines/RoutineRunner').then((m) => ({ default: m.RoutineRunner })),
  WhatNow: () => import('@/features/whatnow/WhatNow').then((m) => ({ default: m.WhatNow })),
  SelectionBar: () => import('@/features/select/SelectionBar').then((m) => ({ default: m.SelectionBar })),
  AuthScreen: () => import('@/features/auth/AuthScreen').then((m) => ({ default: m.AuthScreen })),
  NavEditor: () => import('./NavEditor').then((m) => ({ default: m.NavEditor })),
}
const TaskDetailPanel = lazy(panels.TaskDetailPanel), CommandPalette = lazy(panels.CommandPalette), ShortcutsHelp = lazy(panels.ShortcutsHelp), RecoveryModal = lazy(panels.RecoveryModal), FocusMode = lazy(panels.FocusMode), RoutineRunner = lazy(panels.RoutineRunner), WhatNow = lazy(panels.WhatNow), SelectionBar = lazy(panels.SelectionBar), AuthScreen = lazy(panels.AuthScreen), NavEditor = lazy(panels.NavEditor)

/** Monta su contenido la primera vez que `when` es cierto y lo deja montado (para que se anime al cerrar) */
function Deferred({ when, children }: { when: boolean; children: ReactNode }) {
  const [on, setOn] = useState(when)
  if (when && !on) setOn(true)
  return on ? <Suspense fallback={null}>{children}</Suspense> : null
}

/** Precarga el resto de vistas y paneles cuando el navegador está libre */
function preloadViews() {
  const run = () => [...Object.values(panels), ...Object.values(loaders)].forEach((load) => void load())
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
  if (idle) idle(run)
  else setTimeout(run, 1500)
}

function Screen() {
  const { parts } = useRoute()
  const [section, id] = parts
  switch (section) {
    case 'inbox':
      return <InboxView />
    case 'upcoming':
      return <UpcomingView />
    case 'calendar':
      return <CalendarView />
    case 'habits':
      return <HabitsView />
    case 'routines':
      return <RoutinesView />
    case 'things':
      return <ThingsView id={id} />
    case 'trackers':
      return <TrackersView />
    case 'shopping':
      return <ShoppingView />
    case 'journal':
      return <JournalView date={id} />
    case 'expenses':
      return <ExpensesView />
    case 'menu':
      return <MenuView />
    case 'notes':
      return <NotesView id={id} />
    case 'people':
      return id ? <PersonView id={id} /> : <PeopleView />
    case 'projects':
      return <ProjectsView />
    case 'project':
      return <ProjectView id={id} />
    case 'area':
      return <AreaView id={id} />
    case 'tag':
      return <TagView tag={id} />
    case 'tags':
      return <TagsView />
    case 'goals':
      return <GoalsView />
    case 'finance':
      return <FinanceView />
    case 'review':
      return <ReviewView />
    case 'plan':
      return <PlanView />
    case 'logbook':
      return <LogbookView />
    case 'trash':
      return <TrashView />
    case 'templates':
      return <TemplatesView />
    case 'settings':
      return <SettingsView />
    default:
      return <TodayView />
  }
}

const TITLES: Record<string, string> = {
  today: 'Hoy',
  inbox: 'Bandeja',
  upcoming: 'Próximo',
  calendar: 'Calendario',
  habits: 'Hábitos',
  routines: 'Rutinas',
  things: 'Cosas',
  trackers: 'Última vez',
  shopping: 'Compra',
  journal: 'Diario',
  expenses: 'Gastos',
  menu: 'Menú',
  notes: 'Notas',
  people: 'Personas',
  projects: 'Proyectos',
  tags: 'Etiquetas',
  tag: 'Etiqueta',
  goals: 'Objetivos',
  finance: 'Pagos',
  review: 'Revisión',
  plan: 'Planificar el día',
  logbook: 'Completadas',
  trash: 'Papelera',
  templates: 'Plantillas',
  settings: 'Ajustes',
}

/** El enlace de un email de la cuenta (confirmar, recuperar contraseña) lo lee Supabase al cargar */
const AUTH_IN_URL = /access_token=|error_description=|type=recovery|type=signup/.test(window.location.hash)

export function App() {
  const sync = useSync()
  // Sin sesión y sin cuenta previa en este dispositivo → pantalla de inicio de sesión.
  // Si el dispositivo ya estuvo conectado, la app sigue funcionando con los datos
  // locales y un aviso pide volver a entrar (ver knownEmail en sync/service).
  const needsLogin = sync.state === 'signed-out' && !sync.localOnly && !sync.knownEmail
  // Un dispositivo que ya se usaba (con cuenta o sin ella) no espera a Supabase:
  // la app trabaja con IndexedDB y la sesión llega un momento después
  const early = sync.state === 'loading' && !AUTH_IN_URL && (sync.localOnly || !!sync.knownEmail)
  const waiting = sync.state === 'loading' && !early
  return (
    <MotionConfig reducedMotion="user">
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
  )
}

function Workspace() {
  useGlobalShortcuts()
  useEffect(preloadViews, [])
  const { path, parts } = useRoute()
  const panelOpen = useUI((s) => !!s.selectedTaskId)

  // Enlace de una notificación: #/task/<id> abre la tarea sobre Hoy;
  // #/task/<id>/done o /snooze viene de los botones con la app cerrada
  useEffect(() => {
    // Atajo del icono de la app: «Nueva tarea»
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
    if (parts[0] === 'habit' && parts[1] && parts[2] === 'habit-done') {
      navigate('/habits')
      void applyReminderAction('habit-done', parts[1])
      return
    }
    if (parts[0] !== 'task' || !parts[1]) return
    const action = parts[2]
    if (action === 'done' || action === 'snooze') {
      navigate('/today')
      void applyReminderAction(action, parts[1])
    } else openTaskFromNotification(parts[1])
  }, [parts])

  useEffect(() => {
    document.title = `${TITLES[parts[0]] ?? 'NTab'} · NTab`
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [path, parts])

  // Abrir una nota o una cosa no cambia de pantalla (no se anima la entrada)
  const screenKey = parts[0] === 'notes' || parts[0] === 'things' || parts[0] === 'journal' ? parts[0] : path
  return (
    <div className="relative z-10 h-full">
      <Sidebar />
      <main
        id="main"
        className={cx(
          '@container h-full overflow-y-auto overscroll-contain transition-[padding] duration-300 lg:pl-[272px]',
          panelOpen && 'xl:pr-[420px]',
        )}
      >
        <div id="topbar" className="pointer-events-none sticky top-0 z-30 h-0 safe-top" />
        <ReauthBanner />
        <motion.div
          key={screenKey}
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          // Al terminar se quita el filtro: si se queda, el cristal de las tarjetas
          // no puede difuminar el fondo ambiental (el filtro crea una "raíz de fondo")
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
          transition={{ type: 'spring', stiffness: 260, damping: 30, mass: 0.8 }}
          className={cx('min-h-full', screenKey === 'notes' && 'h-full')}
        >
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </motion.div>
      </main>
      <MobileBar />
      <Panels />
      <QuickAdd />
      <DragGhost />
      <Toast />
    </div>
  )
}

function Panels() {
  const task = useUI((s) => !!s.selectedTaskId)
  const palette = useUI((s) => s.paletteOpen)
  const help = useUI((s) => s.helpOpen)
  const navEditor = useUI((s) => !!s.navEditor)
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
      <Deferred when={task}>
        <TaskDetailPanel />
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
    </>
  )
}

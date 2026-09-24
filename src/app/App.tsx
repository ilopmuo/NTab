import { Suspense, lazy, useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { TodayView } from '@/features/Today'
import { CommandPalette } from '@/components/CommandPalette'
import { FocusMode } from '@/features/focus/FocusMode'
import { DragGhost } from '@/components/dayDrag'
import { SelectionBar } from '@/features/select/SelectionBar'
import { RoutineRunner } from '@/features/routines/RoutineRunner'
import { runner } from '@/features/routines/useRoutines'
import { QuickAdd } from '@/components/QuickAdd'
import { ShortcutsHelp } from '@/components/ShortcutsHelp'
import { TaskDetailPanel } from '@/components/TaskDetail'
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
import { AuthScreen } from '@/features/auth/AuthScreen'
import { RecoveryModal } from '@/features/auth/RecoveryModal'

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
  UpcomingView: () => import('@/features/Upcoming').then((m) => ({ default: m.UpcomingView })),
  ThingsView: () => import('@/features/things/ThingsView').then((m) => ({ default: m.ThingsView })),
  ShoppingView: () => import('@/features/shopping/ShoppingView').then((m) => ({ default: m.ShoppingView })),
  TrackersView: () => import('@/features/trackers/TrackersView').then((m) => ({ default: m.TrackersView })),
  RoutinesView: () => import('@/features/routines/RoutinesView').then((m) => ({ default: m.RoutinesView })),
}
const AreaView = lazy(loaders.AreaView), CalendarView = lazy(loaders.CalendarView), FinanceView = lazy(loaders.FinanceView), GoalsView = lazy(loaders.GoalsView), HabitsView = lazy(loaders.HabitsView), InboxView = lazy(loaders.InboxView), LogbookView = lazy(loaders.LogbookView), NotesView = lazy(loaders.NotesView), PlanView = lazy(loaders.PlanView), TrashView = lazy(loaders.TrashView), TemplatesView = lazy(loaders.TemplatesView), PeopleView = lazy(loaders.PeopleView), PersonView = lazy(loaders.PersonView), ProjectView = lazy(loaders.ProjectView), ProjectsView = lazy(loaders.ProjectsView), ReviewView = lazy(loaders.ReviewView), SettingsView = lazy(loaders.SettingsView), TagView = lazy(loaders.TagView), UpcomingView = lazy(loaders.UpcomingView), RoutinesView = lazy(loaders.RoutinesView), ThingsView = lazy(loaders.ThingsView), TrackersView = lazy(loaders.TrackersView), ShoppingView = lazy(loaders.ShoppingView)

/** Precarga el resto de vistas cuando el navegador está libre */
function preloadViews() {
  const run = () => Object.values(loaders).forEach((load) => void load())
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
  notes: 'Notas',
  people: 'Personas',
  projects: 'Proyectos',
  goals: 'Objetivos',
  finance: 'Pagos',
  review: 'Revisión',
  plan: 'Planificar el día',
  logbook: 'Completadas',
  trash: 'Papelera',
  templates: 'Plantillas',
  settings: 'Ajustes',
}

export function App() {
  const sync = useSync()
  // Sin sesión y sin cuenta previa en este dispositivo → pantalla de inicio de sesión.
  // Si el dispositivo ya estuvo conectado, la app sigue funcionando con los datos
  // locales y un aviso pide volver a entrar (ver knownEmail en sync/service).
  const needsLogin = sync.state === 'signed-out' && !sync.localOnly && !sync.knownEmail
  return (
    <MotionConfig reducedMotion="user">
      {sync.state === 'loading' ? null : needsLogin ? <AuthScreen /> : <Workspace />}
      <AnimatePresence>
        {sync.authOpen && !needsLogin && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] overflow-y-auto bg-[color-mix(in_srgb,var(--c-bg)_70%,transparent)] backdrop-blur-2xl"
          >
            <AuthScreen onCancel={closeAuth} initialEmail={sync.knownEmail ?? ''} />
          </motion.div>
        )}
      </AnimatePresence>
      <Splash ready={sync.state !== 'loading'} />
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
  const screenKey = parts[0] === 'notes' || parts[0] === 'things' ? parts[0] : path
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
      <TaskDetailPanel />
      <QuickAdd />
      <CommandPalette />
      <ShortcutsHelp />
      <RecoveryModal />
      <FocusMode />
      <RoutineRunner />
      <DragGhost />
      <SelectionBar />
      <Toast />
    </div>
  )
}

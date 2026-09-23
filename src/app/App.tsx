import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { AreaView } from '@/features/areas/AreaView'
import { CalendarView } from '@/features/calendar/CalendarView'
import { HabitsView } from '@/features/habits/HabitsView'
import { InboxView } from '@/features/Inbox'
import { LogbookView } from '@/features/Logbook'
import { NotesView } from '@/features/notes/NotesView'
import { PeopleView } from '@/features/people/PeopleView'
import { PersonView } from '@/features/people/PersonView'
import { ProjectView } from '@/features/projects/ProjectView'
import { ProjectsView } from '@/features/projects/ProjectsView'
import { ReviewView } from '@/features/review/ReviewView'
import { SettingsView } from '@/features/settings/SettingsView'
import { TagView } from '@/features/TagView'
import { TodayView } from '@/features/Today'
import { UpcomingView } from '@/features/Upcoming'
import { CommandPalette } from '@/components/CommandPalette'
import { QuickAdd } from '@/components/QuickAdd'
import { ShortcutsHelp } from '@/components/ShortcutsHelp'
import { TaskDetailPanel } from '@/components/TaskDetail'
import { Toast } from '@/components/Toast'
import { cx } from '@/components/ui'
import { useRoute } from './router'
import { useGlobalShortcuts } from './shortcuts'
import { Sidebar } from './Sidebar'
import { MobileBar } from './MobileBar'
import { Splash } from './Splash'
import { useUI } from './store'
import { closeAuth, useSync } from '@/sync/service'
import { ReauthBanner } from '@/sync/ReauthBanner'
import { AuthScreen } from '@/features/auth/AuthScreen'
import { RecoveryModal } from '@/features/auth/RecoveryModal'

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
    case 'review':
      return <ReviewView />
    case 'logbook':
      return <LogbookView />
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
  notes: 'Notas',
  people: 'Personas',
  projects: 'Proyectos',
  review: 'Revisión',
  logbook: 'Completadas',
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
  const { path, parts } = useRoute()
  const panelOpen = useUI((s) => !!s.selectedTaskId)

  useEffect(() => {
    document.title = `${TITLES[parts[0]] ?? 'NTab'} · NTab`
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [path, parts])

  const screenKey = parts[0] === 'notes' ? 'notes' : path
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
          <Screen />
        </motion.div>
      </main>
      <MobileBar />
      <TaskDetailPanel />
      <QuickAdd />
      <CommandPalette />
      <ShortcutsHelp />
      <RecoveryModal />
      <Toast />
    </div>
  )
}

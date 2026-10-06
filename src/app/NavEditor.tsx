import { Reorder, useDragControls } from 'motion/react'
import { GripVertical } from 'lucide-react'
import { ALWAYS_VISIBLE, setTab, type Place } from '@/lib/nav'
import { Button, Modal, ModalHeader, Segmented, Select, Switch } from '@/components/ui'
import { saveNav, useNav } from './nav'
import { useFeatures } from './features'
import { HUBS, SectionIcon, hub } from './sections'
import { hubTabs } from './hubs'
import { ui, useUI } from './store'

/** Personalizar la barra lateral (orden y qué se ve) y las pestañas del móvil */
export function NavEditor() {
  const mode = useUI((s) => s.navEditor)
  const close = () => ui.navEditor(null)
  return (
    <Modal open={!!mode} onClose={close} position="center">
      <ModalHeader title="Personalizar navegación" onClose={close} />
      {mode && (
        <>
          <div className="px-5 pb-3">
            <Segmented
              value={mode}
              onChange={(m) => ui.navEditor(m)}
              className="w-full"
              options={[
                { value: 'sidebar', label: 'Barra lateral' },
                { value: 'tabs', label: 'Pestañas del móvil' },
              ]}
            />
          </div>
          {mode === 'sidebar' ? <SidebarEditor /> : <TabsEditor />}
        </>
      )}
    </Modal>
  )
}

function SidebarEditor() {
  const nav = useNav()
  const save = (next: { order?: string[]; place?: Record<string, Place> }) =>
    void saveNav({ order: nav.order, place: nav.place, tabs: nav.tabs, ...next }, nav.prefs)
  return (
    <>
      <p className="px-5 pb-3 text-[13.5px] text-muted">
        Arrastra para ordenar. Lo que ocultes queda plegado en «N más» al pie de la lista, en la búsqueda (⌘K) y en los atajos de teclado.
      </p>
      <Reorder.Group axis="y" values={nav.order} onReorder={(order) => save({ order })} className="max-h-[52vh] space-y-1.5 overflow-y-auto px-5">
        {nav.order.map((id) => (
          <SectionRow key={id} id={id} place={nav.place[id]} onPlace={(p) => save({ place: { ...nav.place, [id]: p } })} />
        ))}
      </Reorder.Group>
      <Footer onReset={() => void saveNav({ tabs: nav.tabs })} />
    </>
  )
}

function SectionRow({ id, place, onPlace }: { id: string; place: Place; onPlace: (p: Place) => void }) {
  const controls = useDragControls()
  const def = hub(id)
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls} className="flex h-12 items-center gap-2 rounded-xl bg-fill-2 pr-2 pl-1.5">
      <button
        type="button"
        aria-label={`Mover ${def.label}`}
        onPointerDown={(e) => controls.start(e)}
        className="flex h-10 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing"
      >
        <GripVertical size={16} />
      </button>
      <SectionIcon def={def} size={26} square />
      <span className={place === 'hidden' ? 'min-w-0 flex-1 truncate text-[15px] text-muted' : 'min-w-0 flex-1 truncate text-[15px]'}>{def.label}</span>
      {!ALWAYS_VISIBLE.includes(id) && <Switch checked={place !== 'hidden'} onChange={(on) => onPlace(on ? 'list' : 'hidden')} label={`Mostrar ${def.label}`} />}
    </Reorder.Item>
  )
}

function TabsEditor() {
  const nav = useNav()
  const features = useFeatures()
  return (
    <>
      <p className="px-5 pb-3 text-[13.5px] text-muted">Las cuatro pestañas de la barra inferior en el iPhone. «Más» abre todo lo demás.</p>
      <div className="mx-5 mb-4 flex items-center justify-around rounded-full bg-fill-2 px-2 py-2.5">
        {nav.tabs.map((id) => {
          const def = hub(id)
          return (
            <span key={id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <SectionIcon def={def} size={26} />
              <span className="max-w-full truncate text-[10px] font-semibold">{def.short}</span>
            </span>
          )
        })}
      </div>
      <div className="space-y-2 px-5">
        {nav.tabs.map((id, slot) => (
          <label key={slot} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[14px] text-muted">Pestaña {slot + 1}</span>
            <Select
              aria-label={`Pestaña ${slot + 1}`}
              value={id}
              onChange={(e) => void saveNav({ order: nav.order, place: nav.place, tabs: setTab(nav.tabs, slot, e.target.value) }, nav.prefs)}
            >
              {HUBS.filter((h) => hubTabs(h, features.section).length).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
      <Footer onReset={() => void saveNav({ order: nav.order, place: nav.place }, nav.prefs)} />
    </>
  )
}

function Footer({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex justify-between gap-2 px-5 pt-4 pb-5">
      <Button variant="ghost" onClick={onReset}>
        Restablecer
      </Button>
      <Button variant="primary" onClick={() => ui.navEditor(null)}>
        Listo
      </Button>
    </div>
  )
}

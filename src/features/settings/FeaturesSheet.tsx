import { FEATURE_GROUPS, FEATURES } from '@/lib/features'
import { FEATURE_HINTS } from './featureHints'
import { setFeature, useFeatures } from '@/app/features'
import { toast, ui, useUI } from '@/app/store'
import { Modal, ModalHeader } from '@/components/Modal'
import { Switch } from '@/components/form'

/** Ajustes → Funciones: encender y apagar lo que no usas */
export function FeaturesSheet() {
  const open = useUI((x) => x.featuresOpen)
  const onClose = () => ui.features(false)
  const features = useFeatures()
  const change = async (id: string, label: string, on: boolean) => {
    await setFeature(id, on)
    toast(on ? `${label}, encendida` : `${label}, apagada: tus datos se quedan guardados`, { label: 'Deshacer', run: () => void setFeature(id, !on) })
  }
  return (
    <Modal open={open} onClose={onClose} position="center">
      <ModalHeader title="Funciones" onClose={onClose} />
      <p className="px-5 pb-3 text-[13.5px] leading-snug text-muted">
        Apaga lo que no uses y la app será más sencilla: desaparece de la barra lateral, de las pestañas, de ⌘K y de Hoy, y deja de avisarte. Lo que hayas
        apuntado se queda guardado; si vuelves a encenderla, todo sigue ahí.
      </p>
      <div className="max-h-[60vh] overflow-y-auto px-5 pb-5">
        {FEATURE_GROUPS.map((g) => (
          <section key={g.id} className="mb-4" aria-labelledby={`feat-${g.id}`}>
            <h3 id={`feat-${g.id}`} className="mb-1.5 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">
              {g.label}
            </h3>
            <div className="overflow-hidden rounded-xl bg-fill-2">
              {FEATURES.filter((f) => f.group === g.id).map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-3.5 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px]">{f.label}</p>
                    <p className="text-[12.5px] leading-snug text-muted">{FEATURE_HINTS[f.id]}</p>
                  </div>
                  <Switch label={f.label} checked={features.on(f.id)} onChange={(v) => void change(f.id, f.label, v)} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}

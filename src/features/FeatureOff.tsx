import { FEATURES, featureOfSection } from '@/lib/features'
import { setFeature } from '@/app/features'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty } from '@/components/ui'
import { Page } from './Page'

/** Se abre una sección cuya función está apagada (un enlace antiguo, un atajo…) */
export function FeatureOff({ id, feature }: { id: string; /** si no es la de la sección (un filtro, dentro de Listas) */ feature?: string }) {
  const f = feature ? FEATURES.find((x) => x.id === feature) : featureOfSection(id)
  const def = section(id)
  return (
    <Page>
      <h1 className="sr-only">{def.label}</h1>
      <Empty icon={<SectionIcon def={def} size={40} />} title={`${f?.label ?? def.label} está apagada`} hint="La apagaste en Ajustes → Funciones y navegación. Lo que apuntaste sigue guardado.">
        <Button variant="primary" onClick={() => f && void setFeature(f.id, true)}>
          Encender {f?.label ?? def.label}
        </Button>
      </Empty>
    </Page>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence } from 'motion/react'
import { Box, Plus, Search, X } from 'lucide-react'
import { db } from '@/db/db'
import type { Thing, ThingKind } from '@/db/types'
import { searchThings } from '@/lib/things'
import { navigate } from '@/app/router'
import { setUI, useUI } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty, Group, PageHeader, Section, Segmented, cx } from '@/components/ui'
import { Page } from '../Page'
import { ThingForm } from './ThingForm'
import { ThingRow } from './ThingRow'

type Filter = 'all' | ThingKind

const IDEAS: { kind: ThingKind; text: string }[] = [
  { kind: 'stored', text: '¿Dónde está el pasaporte?' },
  { kind: 'lent', text: '¿Quién tiene mi taladro?' },
  { kind: 'document', text: '¿Cuándo caduca el DNI?' },
  { kind: 'borrowed', text: '¿Qué me han prestado?' },
]

/** Cosas y papeles: dónde está cada cosa, qué has prestado y qué caduca */
export function ThingsView({ id }: { id?: string }) {
  const things = useLiveQuery(() => db.things.orderBy('updatedAt').reverse().toArray(), [])
  const creating = useUI((s) => s.creating === 'thing')
  const [newKind, setNewKind] = useState<ThingKind>('stored')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showReturned, setShowReturned] = useState(false)
  const editing = id ? things?.find((t) => t.id === id) : undefined
  // Enlace a una cosa que ya no existe
  useEffect(() => {
    if (id && things && !editing) navigate('/things')
  }, [id, things, editing])

  const found = useMemo(() => searchThings(things ?? [], q), [things, q])
  if (!things) return null

  const list = found.filter((t) => filter === 'all' || t.kind === filter)
  const active = list.filter((t) => !t.returned)
  const groups: { title: string; items: Thing[] }[] = [
    { title: 'Prestado', items: active.filter((t) => t.kind === 'lent') },
    { title: 'Me han prestado', items: active.filter((t) => t.kind === 'borrowed') },
    { title: 'Caducan', items: active.filter((t) => t.kind === 'document').sort((a, b) => (a.expires ?? '').localeCompare(b.expires ?? '')) },
    { title: 'Guardado', items: active.filter((t) => t.kind === 'stored').sort((a, b) => a.name.localeCompare(b.name, 'es')) },
  ].filter((g) => g.items.length)
  const returned = list.filter((t) => t.returned)
  const open = (t: Thing) => navigate(`/things/${t.id}`)
  const create = (kind: ThingKind) => {
    setNewKind(kind)
    setUI({ creating: 'thing' })
  }

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('things')} size={40} />}
        title="Cosas"
        subtitle="Dónde está cada cosa, qué has prestado y qué caduca."
        actions={
          <Button variant="primary" onClick={() => create(filter === 'all' ? 'stored' : filter)}>
            <Plus size={16} strokeWidth={2.6} /> Apuntar
          </Button>
        }
      />

      {things.length === 0 ? (
        <Group>
          <Empty icon={<Box size={28} strokeWidth={2.2} />} color="var(--c-blue)" title="Tu memoria para las cosas" hint="Apunta dónde guardas algo, a quién le prestas qué y lo que caduca. Cuando lo necesites, lo buscas aquí o se lo preguntas a Claude.">
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {IDEAS.map((i) => (
                <button key={i.text} type="button" onClick={() => create(i.kind)} className="glass rounded-full px-4 py-2 text-[14px] font-medium transition-transform active:scale-95">
                  {i.text}
                </button>
              ))}
            </div>
          </Empty>
        </Group>
      ) : (
        <>
          <label className="glass mb-4 flex h-12 items-center gap-2.5 rounded-[16px] px-4">
            <Search size={18} className="shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="¿Dónde está…?"
              aria-label="Buscar cosas"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
            />
            {q && (
              <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ('')} className="flex h-6 w-6 items-center justify-center rounded-full bg-fill text-muted">
                <X size={13} strokeWidth={2.6} />
              </button>
            )}
          </label>
          {/* En el móvil, si no cabe, se desliza de lado */}
          <div className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none]">
            <Segmented
              value={filter}
              onChange={setFilter}
              className="min-w-max"
              options={[
                { value: 'all', label: 'Todo' },
                { value: 'stored', label: 'Guardado' },
                { value: 'lent', label: 'Presté' },
                { value: 'borrowed', label: 'Me dejaron' },
                { value: 'document', label: 'Caduca' },
              ]}
            />
          </div>
          {groups.length === 0 && !returned.length && (
            <Group>
              <Empty icon={<Search size={26} strokeWidth={2.2} />} title={q ? `Nada con «${q}»` : 'Nada aquí todavía'} hint={q ? 'Prueba con otra palabra: el sitio, la persona…' : undefined}>
                <Button onClick={() => create(filter === 'all' ? 'stored' : filter)}>
                  <Plus size={15} /> Apuntar {q ? `«${q}»` : 'una'}
                </Button>
              </Empty>
            </Group>
          )}
          {groups.map((g) => (
            <Section key={g.title} title={g.title} count={g.items.length}>
              <Group>
                <AnimatePresence initial={false}>
                  {g.items.map((t, i) => (
                    <ThingRow key={t.id} thing={t} index={i} onOpen={() => open(t)} />
                  ))}
                </AnimatePresence>
              </Group>
            </Section>
          ))}
          {returned.length > 0 && (
            <section className="mb-8">
              <button type="button" onClick={() => setShowReturned((v) => !v)} className={cx('mb-2 px-1 text-[15px] font-semibold text-muted')}>
                {showReturned ? 'Ocultar' : 'Ver'} préstamos devueltos ({returned.length})
              </button>
              {showReturned && (
                <Group>
                  {returned.map((t) => (
                    <ThingRow key={t.id} thing={t} onOpen={() => open(t)} />
                  ))}
                </Group>
              )}
            </section>
          )}
        </>
      )}

      <ThingForm open={creating} kind={newKind} onClose={() => setUI({ creating: null })} />
      <ThingForm thing={editing} open={!!editing} onClose={() => navigate('/things')} />
    </Page>
  )
}

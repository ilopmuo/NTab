import { useState } from 'react'
import { Copy, Link2, LogOut, Settings2, Share2, ShoppingCart, Trash2, UserPlus, Users, X } from 'lucide-react'
import { members, shopItems, type HouseItem } from '@/lib/house'
import { uid } from '@/lib/id'
import { openAuth, useSync } from '@/sync/service'
import { navigate } from '@/app/router'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Card, Empty, Group, IconButton, Input, Modal, ModalHeader, PageHeader } from '@/components/ui'
import { Page } from '../Page'
import { HouseMoney, HouseTasks, membersLabel, useNames } from './parts'
import { PISO_LIST, act, createHouse, houseAdmin, inviteLink, saveMyHouse, useHouse, useMyHouse, type MyHouse } from './store'

/**
 * Tareas de casa: las de siempre por turnos, las sueltas, el reparto y las
 * cuentas del piso. Si vives con más gente, tus compañeros entran con un enlace
 * (sin cuenta) y ven lo mismo al momento.
 */
export function HouseView() {
  const mine = useMyHouse()
  if (mine === undefined) return null
  return mine ? <House mine={mine} /> : <Setup />
}

function House({ mine }: { mine: MyHouse }) {
  const snap = useHouse(mine.token)
  const [inviting, setInviting] = useState(false)
  const [settings, setSettings] = useState(false)
  if (!snap) return null
  if (snap.gone)
    return (
      <Page>
        <Empty icon={<Users size={26} />} title="Este piso ya no está" hint="Quien lo creó lo ha borrado o ha cambiado el enlace. Pídele el nuevo, o crea otro piso.">
          <Button variant="primary" onClick={() => void saveMyHouse(null)}>
            Salir de este piso
          </Button>
        </Empty>
      </Page>
    )
  const ms = members(snap.items)
  const shopping = shopItems(snap.items).filter((i) => !i.data.done)
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('house')} size={40} />}
        title={snap.name || 'Casa'}
        subtitle={
          <>
            {ms.length > 1 ? membersLabel(snap.items, mine.me) : 'Solo tú, de momento'}
            {snap.offline && <span> · sin conexión: lo que cambies se guardará al volver</span>}
          </>
        }
        actions={
          <>
            <Button variant="primary" onClick={() => setInviting(true)}>
              <UserPlus size={15} /> Invitar
            </Button>
            <IconButton label="Ajustes del piso" filled onClick={() => setSettings(true)}>
              <Settings2 size={16} />
            </IconButton>
          </>
        }
      />
      {!snap.ready ? null : (
        <>
          <HouseTasks token={mine.token} me={mine.me} items={snap.items} />
          <Card className="mb-8 flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill">
              <ShoppingCart size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Compra del piso</p>
              <p className="truncate text-[13px] text-muted">{shopping.length ? shopping.map((i) => i.data.name).join(', ') : 'Vacía: lo que apuntéis lo ve todo el piso'}</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                try {
                  localStorage.setItem('ntab-shopping-list', PISO_LIST)
                } catch {
                  /* solo en memoria */
                }
                navigate('/shopping')
              }}
            >
              Ver
            </Button>
          </Card>
          {ms.length > 1 && <HouseMoney token={mine.token} me={mine.me} items={snap.items} />}
        </>
      )}
      <Invite open={inviting} onClose={() => setInviting(false)} token={mine.token} name={snap.name} />
      <HouseSettings open={settings} onClose={() => setSettings(false)} mine={mine} items={snap.items} name={snap.name} />
    </Page>
  )
}

function Invite({ open, onClose, token, name }: { open: boolean; onClose: () => void; token: string; name: string }) {
  const link = inviteLink(token)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast('Enlace copiado')
    } catch {
      toast('No se ha podido copiar: mantén pulsado el enlace')
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: name || 'Nuestro piso', text: `Las tareas, la compra y las cuentas de ${name || 'casa'}, en LUNO:`, url: link })
    } catch {
      /* cancelado */
    }
  }
  return (
    <Modal open={open} onClose={onClose} position="center">
      <ModalHeader title="Invitar al piso" onClose={onClose} />
      <div className="space-y-4 px-5 pb-5">
        <p className="text-[15px] leading-snug">
          Manda este enlace a tus compañeros. <b className="font-semibold">No necesitan cuenta ni instalar nada</b>: lo abren en el móvil, eligen quién son y ven las tareas, la compra y las cuentas al momento.
        </p>
        <p className="rounded-[12px] bg-fill px-3 py-2.5 font-mono text-[12.5px] break-all text-muted select-all">{link}</p>
        <p className="text-[13px] text-muted">Quien tenga el enlace puede verlo y cambiarlo. Si se lo das a quien no debes, cámbialo en los ajustes del piso.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => void copy()}>
            <Copy size={15} /> Copiar
          </Button>
          {'share' in navigator && (
            <Button variant="primary" onClick={() => void share()}>
              <Share2 size={15} /> Compartir
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function HouseSettings({ open, onClose, mine, items, name }: { open: boolean; onClose: () => void; mine: MyHouse; items: HouseItem[]; name: string }) {
  const label = useNames(items, mine.me)
  const ms = members(items)
  const [title, setTitle] = useState(name)
  const [newName, setNewName] = useState('')
  const addMember = () => {
    const n = newName.trim()
    if (!n) return
    act(mine.token, [{ op: 'put', kind: 'member', id: uid(), data: { name: n, order: ms.length } }])
    setNewName('')
  }
  return (
    <Modal open={open} onClose={onClose} position="center">
      <ModalHeader title="Ajustes del piso" onClose={onClose} />
      <div className="space-y-5 px-5 pb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && title.trim() !== name) act(mine.token, [{ op: 'name', name: title.trim() }])
          }}
          className="flex gap-2"
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Nombre del piso" placeholder="Nombre del piso" className="flex-1" />
          <Button type="submit" disabled={!title.trim() || title.trim() === name}>
            Guardar
          </Button>
        </form>

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-muted">Quién vive aquí</p>
          <Group>
            {ms.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                <span className="min-w-0 flex-1 truncate text-[15px]">
                  {m.data.name}
                  {m.id === mine.me && <span className="text-muted"> (tú)</span>}
                </span>
                {m.id !== mine.me && (
                  <>
                    <button type="button" onClick={() => void saveMyHouse({ ...mine, me: m.id })} className="rounded-full px-2 py-1 text-[13px] font-medium text-muted hover:bg-hover hover:text-fg">
                      Soy yo
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar a ${m.data.name}`}
                      onClick={() => {
                        if (window.confirm(`¿Quitar a ${m.data.name} del piso? Sus turnos pasan a los demás.`)) act(mine.token, [{ op: 'del', id: m.id }])
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </Group>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addMember()
            }}
            className="mt-2 flex gap-2"
          >
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nombre del compañero" placeholder="Añadir a alguien" className="flex-1" />
            <Button type="submit" disabled={!newName.trim()}>
              Añadir
            </Button>
          </form>
          <p className="mt-1.5 text-[12.5px] text-muted">Eres «{label(mine.me)}» en este piso; tus compañeros eligen quiénes son al abrir el enlace.</p>
        </div>

        <div className="space-y-2">
          <Button
            className="w-full justify-start"
            onClick={async () => {
              if (!window.confirm('El enlace de ahora dejará de funcionar. ¿Crear uno nuevo?')) return
              try {
                const token = await houseAdmin(mine.token, 'rotate')
                if (token) await saveMyHouse({ ...mine, token })
                toast('Enlace nuevo: compártelo otra vez con tus compañeros')
              } catch (e) {
                toast((e as Error).message)
              }
            }}
          >
            <Link2 size={15} /> Cambiar el enlace
          </Button>
          <Button
            className="w-full justify-start"
            onClick={() => {
              if (!window.confirm('¿Salir del piso en este LUNO? El piso sigue existiendo para los demás.')) return
              void saveMyHouse(null)
              onClose()
            }}
          >
            <LogOut size={15} /> Salir del piso
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={async () => {
              if (!window.confirm('¿Borrar el piso para todos? Se pierden sus tareas, la compra y las cuentas.')) return
              try {
                await houseAdmin(mine.token, 'delete')
                await saveMyHouse(null)
                onClose()
                toast('Piso borrado')
              } catch (e) {
                toast((e as Error).message)
              }
            }}
          >
            <Trash2 size={15} /> Borrar el piso
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Sin piso todavía: crearlo (solo o con compañeros) o entrar con un enlace */
function Setup() {
  const sync = useSync()
  const signedIn = !!sync.user
  const [name, setName] = useState('')
  const [me, setMe] = useState('')
  const [others, setOthers] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const people = others
    .split(/,|\sy\s|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const create = async () => {
    if (!me.trim()) return
    setBusy(true)
    try {
      await createHouse({ name: name.trim() || 'Casa', me: me.trim(), others: people })
      toast(people.length ? 'Piso creado: ahora invita a tus compañeros' : 'Listo: ya puedes apuntar las tareas de casa')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const token = /([a-f0-9]{32,128})\s*$/.exec(link.trim())?.[1]
  return (
    <Page>
      <PageHeader icon={<SectionIcon def={section('house')} size={40} />} title="Tareas de casa" subtitle="Quién limpia qué, la compra y las cuentas del piso." />
      <Card className="mb-6 p-5">
        <p className="text-[17px] font-semibold">Monta tu casa</p>
        <p className="mt-1 mb-4 text-[14px] leading-snug text-muted">
          Las tareas que se repiten van por turnos (sacar la basura, el baño…): cuando alguien la hace, le toca al siguiente. Si vives con más gente, comparte la compra y las cuentas; ellos entran con un enlace, sin cuenta.
        </p>
        {signedIn ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
            className="space-y-3"
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre: Piso de la calle Mayor" aria-label="Nombre del piso" />
            <Input value={me} onChange={(e) => setMe(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" />
            <Input value={others} onChange={(e) => setOthers(e.target.value)} placeholder="Tus compañeros: Ana, Luis (o déjalo vacío si vives solo)" aria-label="Tus compañeros" />
            {people.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <span key={p} className="rounded-full bg-fill px-2.5 py-1 text-[13px] font-semibold">
                    {p}
                  </span>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={busy || !me.trim()}>
                {people.length ? 'Crear el piso' : 'Empezar'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-[14px]">Para compartirla con tus compañeros, entra con tu cuenta de LUNO (tus datos se sincronizan).</p>
            <Button variant="primary" onClick={openAuth}>
              Entrar
            </Button>
          </div>
        )}
      </Card>
      <Card className="p-5">
        <p className="text-[15px] font-semibold">¿Te han pasado un enlace?</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (token) navigate(`/piso/${token}`)
          }}
          className="mt-3 flex gap-2"
        >
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Pega aquí el enlace del piso" aria-label="Enlace del piso" className="flex-1" />
          <Button type="submit" disabled={!token}>
            Abrir
          </Button>
        </form>
      </Card>
    </Page>
  )
}

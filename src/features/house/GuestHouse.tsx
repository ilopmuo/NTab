import { useEffect, useState } from 'react'
import { Check, Home, Plus } from 'lucide-react'
import { members } from '@/lib/house'
import { uid } from '@/lib/id'
import { useSync } from '@/sync/service'
import { navigate } from '@/app/router'
import { LunoLockup } from '@/components/Brand'
import { Button, Empty, Group } from '@/components/ui'
import { Input, Segmented } from '@/components/form'
import { HouseMoney, HouseTasks, SharedShopping, membersLabel } from './parts'
import { act, guestMe, saveMyHouse, setGuestHome, setGuestMe, useHouse, useMyHouse } from './store'
import { HousePushCard, InstallHint, disableHousePush, housePushState } from './HousePush'

type Tab = 'tasks' | 'shop' | 'money'

/**
 * Lo que ven tus compañeros al abrir el enlace del piso: sin cuenta y sin
 * instalar nada. Eligen quién son (se recuerda en su móvil) y tienen las
 * tareas con sus turnos, la compra y las cuentas.
 */
export function GuestHouse({ token }: { token: string }) {
  const snap = useHouse(token)
  const [me, setMe] = useState(() => guestMe(token))
  const [tab, setTab] = useState<Tab>('tasks')
  const sync = useSync()
  const mine = useMyHouse()
  const choose = (id: string) => {
    setGuestMe(token, id)
    setMe(id)
  }
  // Quien entra sin cuenta: este es su piso (la app instalada se abre en él)
  const guest = sync.state !== 'loading' && !sync.user && !sync.localOnly && !sync.knownEmail
  useEffect(() => {
    if (guest) setGuestHome(token)
  }, [guest, token])

  const body = () => {
    if (!snap || !snap.ready) return <p className="py-20 text-center text-muted">Abriendo el piso…</p>
    if (snap.gone) return <Empty icon={<Home size={26} />} title="Este enlace ya no vale" hint="Quien creó el piso lo ha cambiado o lo ha borrado. Pídele el nuevo." />
    const ms = members(snap.items)
    if (!me || !ms.some((m) => m.id === me)) return <WhoAreYou token={token} names={ms.map((m) => ({ id: m.id, name: m.data.name }))} onChoose={choose} />
    return (
      <>
        <Segmented
          value={tab}
          onChange={setTab}
          className="mb-6 w-full"
          options={[
            { value: 'tasks', label: 'Tareas' },
            { value: 'shop', label: 'Compra' },
            ...(ms.length > 1 ? [{ value: 'money' as Tab, label: 'Cuentas' }] : []),
          ]}
        />
        {tab === 'tasks' && housePushState(token, me) !== 'on' && <HousePushCard token={token} me={me} open="piso" />}
        {tab === 'tasks' && <HouseTasks token={token} me={me} items={snap.items} />}
        {tab === 'shop' && <SharedShopping token={token} me={me} items={snap.items} />}
        {tab === 'money' && <HouseMoney token={token} me={me} items={snap.items} />}
        <div className="mt-10">
          <InstallHint />
        </div>
        <div className="space-y-3 text-center text-[13px] text-muted">
          {housePushState(token, me) === 'on' && <HousePushCard token={token} me={me} open="piso" compact />}
          <button
            type="button"
            onClick={() => {
              // Los avisos eran para quien eras
              if (housePushState(token, me) === 'on') void disableHousePush(token)
              setGuestMe(token, '')
              setMe(null)
            }}
            className="font-semibold text-blue"
          >
            No soy {ms.find((m) => m.id === me)?.data.name}
          </button>
          {sync.user && mine === null && (
            <div>
              <Button
                variant="primary"
                onClick={async () => {
                  await saveMyHouse({ token, me })
                  navigate('/house')
                }}
              >
                <Plus size={15} /> Añadir a mi LUNO
              </Button>
            </div>
          )}
          {mine?.token === token && (
            <div>
              <Button onClick={() => navigate('/house')}>Ir a mi LUNO</Button>
            </div>
          )}
          {guest && (
            <button
              type="button"
              onClick={() => {
                setGuestHome(null)
                navigate('/today')
              }}
              className="block w-full text-[12.5px] text-faint"
            >
              ¿Quieres LUNO para organizar lo tuyo? Empieza aquí
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="h-full overflow-y-auto" id="main">
      <div className="mx-auto w-full max-w-2xl px-4 pt-[max(env(safe-area-inset-top),20px)] pb-20 sm:px-6">
        <header className="mb-6">
          <div className="mb-5 flex items-center text-fg">
            <LunoLockup height={10} />
          </div>
          <h1 className="text-[32px] leading-tight font-bold tracking-[-0.025em]">{snap?.name || 'Piso'}</h1>
          {snap?.ready && !snap.gone && <p className="mt-1 text-[15px] text-muted">{me ? membersLabel(snap.items, me) : `${members(snap.items).length} en el piso`}{snap.offline && ' · sin conexión'}</p>}
        </header>
        {body()}
      </div>
    </div>
  )
}

/** Al entrar por primera vez: quién eres (o añadirte si no estás) */
function WhoAreYou({ token, names, onChoose }: { token: string; names: { id: string; name: string }[]; onChoose: (id: string) => void }) {
  const [adding, setAdding] = useState(names.length === 0)
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (!n) return
    const id = uid()
    act(token, [{ op: 'put', kind: 'member', id, data: { name: n, order: names.length } }])
    onChoose(id)
  }
  return (
    <div>
      <p className="mb-3 text-[17px] font-semibold">¿Quién eres?</p>
      <Group>
        {names.map((n) => (
          <button key={n.id} type="button" onClick={() => onChoose(n.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[16px] shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none hover:bg-hover">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fill font-bold">{n.name.charAt(0).toUpperCase()}</span>
            <span className="flex-1">{n.name}</span>
            <Check size={16} className="text-faint" />
          </button>
        ))}
      </Group>
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
          className="mt-3 flex gap-2"
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" className="flex-1" />
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Entrar
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 text-[14px] font-semibold text-blue">
          No estoy en la lista
        </button>
      )}
    </div>
  )
}

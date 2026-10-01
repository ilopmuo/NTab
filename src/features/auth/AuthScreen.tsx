import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { authErrorMessage, sendPasswordReset, setLocalOnly, signIn, signUp } from '@/sync/service'
import { m as motion } from 'motion/react'
import { Input, cx, softSpring } from '@/components/ui'
import { LunoMark, LunoWordmark } from '@/components/Brand'

type Mode = 'signin' | 'signup' | 'reset'

export function AuthScreen({ onCancel, initialEmail = '' }: { onCancel?: () => void; initialEmail?: string }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signin') await signIn(email.trim(), password)
      else if (mode === 'signup') {
        const mustConfirm = await signUp(email.trim(), password)
        if (mustConfirm) {
          setInfo('Te hemos enviado un email para confirmar la cuenta. Ábrelo, y después vuelve aquí y entra con tu email y contraseña.')
          setMode('signin')
        }
      } else {
        await sendPasswordReset(email.trim())
        setInfo('Si el email tiene cuenta, te llegará un enlace para elegir una contraseña nueva.')
        setMode('signin')
      }
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const valid = /\S+@\S+\.\S+/.test(email) && (mode === 'reset' || password.length >= 6)

  return (
    <div className="relative z-10 flex min-h-full items-center justify-center overflow-x-hidden overflow-y-auto px-5 py-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="relative w-full max-w-[380px]">
        <div className="relative mb-9 flex flex-col items-center text-center">
          {/* Órbitas muy tenues alrededor del símbolo: el sistema, sin decirlo */}
          <div aria-hidden className="pointer-events-none absolute -z-10 top-[26px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 [mask-image:linear-gradient(to_bottom,black_25%,transparent_62%)]">
            <span className="absolute inset-0 rounded-full border border-line" />
            <span className="absolute inset-[110px] rounded-full border border-line" />
            <span className="absolute top-[72px] right-[72px] h-2 w-2 rounded-full bg-accent opacity-70" />
          </div>
          <LunoMark size={52} className="mb-6 text-fg" />
          <h1 className="text-fg">
            <LunoWordmark height={26} title="LUNO" />
          </h1>
          <p className="mt-4 text-[17px] font-medium tracking-[-0.015em] text-fg">Tu sistema personal.</p>
          <p className="mt-1 max-w-[300px] text-[14px] leading-snug text-muted">Tareas, proyectos, hábitos y notas, conectados en todos tus dispositivos.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !busy) void submit()
          }}
          className="rounded-[22px] bg-surface p-5 shadow-[var(--c-shadow)]"
        >
          {mode !== 'reset' && (
            <div className="mb-5 grid grid-cols-2 rounded-[10px] bg-fill p-[2px]">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setError('')
                  }}
                  className={cx(
                    'h-8 rounded-[8px] text-[14px] font-semibold transition-all',
                    mode === m ? 'bg-surface text-fg shadow-[0_1px_3px_rgb(0_0_0/0.16)] dark:bg-[#636366]' : 'text-muted hover:text-fg',
                  )}
                >
                  {m === 'signin' ? 'Entrar' : 'Crear cuenta'}
                </button>
              ))}
            </div>
          )}
          {mode === 'reset' && <p className="mb-4 text-[14px] font-medium">Recuperar contraseña</p>}

          <div className="space-y-3">
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="h-12 text-[16px]"
            />
            {mode !== 'reset' && (
              <Input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Contraseña (mínimo 6 caracteres)' : 'Contraseña'}
                className="h-12 text-[16px]"
              />
            )}
          </div>

          {error && <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-red">{error}</p>}
          {info && <p className="mt-3 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[14px] text-blue">{info}</p>}

          <button
            type="submit"
            disabled={!valid || busy}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent-fill text-[16px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <>
                {mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'} <ArrowRight size={16} />
              </>
            )}
          </button>

          <div className="mt-4 text-center text-[12.5px]">
            {mode === 'signin' ? (
              <button type="button" onClick={() => setMode('reset')} className="text-muted hover:text-fg">
                ¿Has olvidado la contraseña?
              </button>
            ) : mode === 'reset' ? (
              <button type="button" onClick={() => setMode('signin')} className="text-muted hover:text-fg">
                Volver
              </button>
            ) : (
              <span className="text-muted">Solo tú puedes ver tus datos.</span>
            )}
          </div>
        </form>

        <div className="mt-6 text-center">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="text-[13px] text-muted hover:text-fg">
              Cancelar
            </button>
          ) : (
            <button type="button" onClick={() => setLocalOnly(true)} className="text-[13px] text-muted hover:text-fg">
              Usar sin cuenta en este dispositivo
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

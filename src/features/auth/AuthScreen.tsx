import { useState } from 'react'
import { ArrowRight, Cloud, Laptop, Loader2, Smartphone, Tablet } from 'lucide-react'
import { authErrorMessage, sendPasswordReset, setLocalOnly, signIn, signUp } from '@/sync/service'
import { Input, cx } from '@/components/ui'

type Mode = 'signin' | 'signup' | 'reset'

export function AuthScreen({ onCancel }: { onCancel?: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
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
    <div className="flex min-h-full items-center justify-center overflow-y-auto bg-bg px-5 py-10">
      <div className="w-full max-w-sm animate-pop-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="./icon.svg" alt="" className="mb-5 h-16 w-16 rounded-[18px] shadow-2xl shadow-accent/20" />
          <h1 className="text-[28px] font-bold tracking-[-0.025em]">NTab</h1>
          <p className="mt-1.5 text-[14px] text-muted">Tu vida, organizada. En todos tus dispositivos.</p>
          <div className="mt-5 flex items-center gap-3 text-faint">
            <Smartphone size={18} />
            <span className="h-px w-5 bg-line-strong" />
            <Cloud size={20} className="text-accent" />
            <span className="h-px w-5 bg-line-strong" />
            <Laptop size={18} />
            <Tablet size={18} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !busy) void submit()
          }}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          {mode !== 'reset' && (
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-bg p-0.5">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setError('')
                  }}
                  className={cx(
                    'h-8 rounded-md text-[13px] font-medium transition-all',
                    mode === m ? 'bg-elevated text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
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
              className="h-11 text-[15px]"
            />
            {mode !== 'reset' && (
              <Input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Contraseña (mínimo 6 caracteres)' : 'Contraseña'}
                className="h-11 text-[15px]"
              />
            )}
          </div>

          {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          {info && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent">{info}</p>}

          <button
            type="submit"
            disabled={!valid || busy}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14.5px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
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
              <span className="text-faint">Solo tú puedes ver tus datos.</span>
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
      </div>
    </div>
  )
}

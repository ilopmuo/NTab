import { useState } from 'react'
import { ArrowRight, Cloud, Laptop, Loader2, Smartphone, Tablet } from 'lucide-react'
import { authErrorMessage, sendPasswordReset, setLocalOnly, signIn, signUp } from '@/sync/service'
import { motion } from 'motion/react'
import { Input, cx, softSpring } from '@/components/ui'

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
    <div className="relative z-10 flex min-h-full items-center justify-center overflow-y-auto px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={softSpring} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="./icon-512.png" alt="" className="mb-5 h-20 w-20 rounded-[22px] shadow-2xl" />
          <h1 className="text-[34px] font-bold tracking-[-0.025em]">NTab</h1>
          <p className="mt-1.5 text-[16px] text-muted">Tu vida, organizada. En todos tus dispositivos.</p>
          <div className="mt-5 flex items-center gap-3 text-faint">
            <Smartphone size={18} />
            <span className="h-px w-5 bg-line-strong" />
            <Cloud size={20} className="text-blue" strokeWidth={2.3} />
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
          className="glass-thick rounded-[26px] p-5"
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
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-white shadow-[0_8px_24px_-8px_var(--c-blue)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
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
      </motion.div>
    </div>
  )
}

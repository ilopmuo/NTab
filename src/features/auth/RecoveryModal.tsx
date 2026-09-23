import { useState } from 'react'
import { authErrorMessage, dismissRecovery, updatePassword, useSync } from '@/sync/service'
import { toast } from '@/app/store'
import { Button, Input, Modal, ModalHeader } from '@/components/ui'

/** Se abre al volver del enlace "recuperar contraseña" del email */
export function RecoveryModal() {
  const { recovery } = useSync()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  return (
    <Modal open={recovery} onClose={dismissRecovery} position="center" className="max-w-sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await updatePassword(password)
            toast('Contraseña actualizada')
          } catch (err) {
            setError(authErrorMessage(err))
          }
        }}
      >
        <ModalHeader title="Nueva contraseña" onClose={dismissRecovery} />
        <div className="space-y-3 p-5">
          <Input autoFocus type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          {error && <p className="text-[13px] text-red">{error}</p>}
        </div>
        <div className="flex justify-end px-5 pt-1 pb-5">
          <Button type="submit" variant="primary" disabled={password.length < 6}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

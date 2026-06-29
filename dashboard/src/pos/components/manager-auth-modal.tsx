import { useState } from 'react'
import { ShieldCheck, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Numpad } from '@/pos/components/numpad'
import { USERS } from '@/pos/data/mock'
import { useAuthorizePosAction } from '@/hooks/use-pos-staff'
import { usePos } from '@/pos/lib/pos-context'

interface ManagerAuthModalProps {
  open: boolean
  action: string
  onCancel: () => void
  onAuthorized: (managerName: string) => void
}

/**
 * Manager authorisation gate. Required for price overrides, line discounts,
 * voids, and restricted sales types (checklist items 7, 8, 16).
 */
export function ManagerAuthModal({ open, action, onCancel, onAuthorized }: ManagerAuthModalProps) {
  const { mode, user } = usePos()
  const authorizeAction = useAuthorizePosAction()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const submit = async () => {
    if (mode === 'live') {
      if (!user?.sessionId) {
        setError(true)
        return
      }
      try {
        const result = await authorizeAction.mutateAsync({
          sessionId: user.sessionId,
          passcode: pin,
          action,
        })
        setPin('')
        setError(false)
        onAuthorized(result.approver.display_name)
      } catch {
        setError(true)
      }
      return
    }

    const manager = USERS.find((u) => u.role === 'manager' && u.pin === pin)
    if (manager) {
      setPin('')
      setError(false)
      onAuthorized(manager.name)
    } else {
      setError(true)
    }
  }

  const close = () => {
    setPin('')
    setError(false)
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm" onClose={close}>
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldCheck className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold">Manager Authorisation</h2>
          <p className="mt-1 text-sm text-muted-foreground">{action}</p>

          <div className="my-4 flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-3 flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> Invalid manager passcode
            </div>
          )}

          <Numpad
            className="w-full"
            onPress={(k) => {
              setError(false)
              setPin((p) => (p.length < 12 ? p + k : p))
            }}
            onBackspace={() => setPin((p) => p.slice(0, -1))}
          />

          <div className="mt-4 flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={pin.length < 4 || authorizeAction.isPending}>
              {authorizeAction.isPending ? 'Checking...' : 'Authorise'}
            </Button>
          </div>
          {mode === 'demo' && <p className="mt-3 text-xs text-muted-foreground">Demo manager PIN: 9999</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

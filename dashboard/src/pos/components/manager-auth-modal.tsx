import { useState } from 'react'
import { ShieldCheck, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Numpad } from '@/pos/components/numpad'
import { USERS } from '@/pos/data/mock'
import { usePos } from '@/pos/lib/pos-context'
import { cn } from '@/lib/utils'
import {
  HRM_POS_PIN_DIGITS,
  isHrmManagerPlus,
  loadRegisterBinding,
  verifyHrmManagerPin,
} from '@/pos/lib/hrm-pos-auth'

interface ManagerAuthModalProps {
  open: boolean
  action: string
  onCancel: () => void
  onAuthorized: (managerName: string) => void
}

function liveAuthErrorMessage(err: unknown): string {
  const e = err as Error & { reason?: string; status?: number }
  if (e?.reason === 'not_manager') {
    return 'This employee is not a manager, admin, HQ admin, or owner'
  }
  if (e?.status === 401) return 'Invalid PIN'
  if (e?.status === 423) return 'PIN is locked. Try again later'
  if (e instanceof Error && e.message) return e.message
  return 'Invalid PIN'
}

export function ManagerAuthModal({ open, action, onCancel, onAuthorized }: ManagerAuthModalProps) {
  const { mode, user } = usePos()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [peerOverride, setPeerOverride] = useState(false)
  const [peerEmployeeCode, setPeerEmployeeCode] = useState('')

  const pinDigits = mode === 'live' ? HRM_POS_PIN_DIGITS : 4
  const selfManager = Boolean(user?.employeeCode && isHrmManagerPlus(user.hrmRole))
  const useSelfPin = mode === 'live' && selfManager && !peerOverride

  const resetFields = () => {
    setPin('')
    setError(null)
    setPeerOverride(false)
    setPeerEmployeeCode('')
  }

  const submit = async () => {
    if (mode === 'live') {
      const binding = loadRegisterBinding()
      if (!binding) {
        setError('Register is not bound')
        return
      }
      const employeeCode = useSelfPin ? user?.employeeCode : peerEmployeeCode
      if (!employeeCode?.trim()) {
        setError('Enter a manager employee code')
        return
      }
      setSubmitting(true)
      setError(null)
      try {
        const { staff } = await verifyHrmManagerPin({
          employeeCode,
          pin,
          binding,
        })
        resetFields()
        onAuthorized(staff.display_name)
      } catch (err) {
        setError(liveAuthErrorMessage(err))
      } finally {
        setSubmitting(false)
      }
      return
    }

    const manager = USERS.find((u) => u.role === 'manager' && u.pin === pin)
    if (manager) {
      setPin('')
      setError(null)
      onAuthorized(manager.name)
    } else {
      setError('Invalid PIN')
    }
  }

  const close = () => {
    resetFields()
    setSubmitting(false)
    onCancel()
  }

  const canSubmit =
    mode === 'live'
      ? pin.length === pinDigits && !submitting && (useSelfPin || peerEmployeeCode.trim().length > 0)
      : pin.length >= 4

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm" onClose={close}>
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldCheck className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold">Manager Authorisation</h2>
          <p className="mt-1 text-sm text-muted-foreground">{action}</p>
          {useSelfPin && (
            <p className="mt-1 text-sm text-muted-foreground">Enter your PIN</p>
          )}

          {mode === 'live' && !useSelfPin && (
            <label className="mt-3 w-full text-left text-sm">
              <span className="text-muted-foreground">Manager employee code</span>
              <input
                className="mt-1.5 w-full rounded-md border px-3 py-2.5 font-mono text-lg uppercase"
                value={peerEmployeeCode}
                onChange={(e) => {
                  setPeerEmployeeCode(e.target.value.toUpperCase())
                  setError(null)
                }}
                placeholder="ADM-AD26"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
          )}

          <div className={cn('my-4 flex justify-center', pinDigits === HRM_POS_PIN_DIGITS ? 'gap-1.5' : 'gap-2')}>
            {Array.from({ length: pinDigits }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-full',
                  pinDigits === HRM_POS_PIN_DIGITS ? 'h-2.5 w-2.5' : 'h-3 w-3',
                  i < pin.length ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>

          {error && (
            <div className="mb-3 flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          <Numpad
            className="w-full"
            onPress={(k) => {
              setError(null)
              setPin((p) => (p.length < pinDigits ? p + k : p))
            }}
            onBackspace={() => setPin((p) => p.slice(0, -1))}
          />

          {mode === 'live' && selfManager && (
            <button
              type="button"
              className="mt-3 text-xs text-muted-foreground underline"
              onClick={() => {
                setPeerOverride((v) => !v)
                setPin('')
                setError(null)
              }}
            >
              {peerOverride ? 'Use my PIN' : 'Another manager'}
            </button>
          )}

          <div className="mt-4 flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void submit()} disabled={!canSubmit}>
              {submitting ? 'Checking...' : 'Authorise'}
            </Button>
          </div>
          {mode === 'demo' && <p className="mt-3 text-xs text-muted-foreground">Demo manager PIN: 9999</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

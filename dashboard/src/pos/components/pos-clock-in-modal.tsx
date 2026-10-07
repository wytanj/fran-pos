import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, KeyRound, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  HRM_POS_PIN_DIGITS,
  loadRegisterBinding,
  verifyHrmPosPin,
  type RegisterBinding,
} from '@/pos/lib/hrm-pos-auth'
import { clockInViaHrm, POS_CLOCK_IN_STEPS, type PosClockInStep } from '@/pos/lib/hrm-pos-clock'

interface PosClockInModalProps {
  open: boolean
  onClose: () => void
  /** Optional binding override (login screen already has it in state). */
  binding?: RegisterBinding | null
}

export function PosClockInModal({ open, onClose, binding: bindingProp }: PosClockInModalProps) {
  const [step, setStep] = useState<PosClockInStep>('photo')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneName, setDoneName] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const binding = bindingProp ?? loadRegisterBinding()

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  useEffect(() => {
    if (!open) {
      stopCamera()
      setStep('photo')
      setPhotoUrl(null)
      setEmployeeCode('')
      setPin('')
      setError(null)
      setDoneName(null)
      setBusy(false)
      return
    }
    let cancelled = false
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {})
        }
      } catch {
        // File picker fallback remains available.
      }
    }
    void start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open])

  if (!open) return null

  const captureFromVideo = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      setError('Camera not ready — use Choose photo instead.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const url = canvas.toDataURL('image/jpeg', 0.85)
    setPhotoUrl(url)
    stopCamera()
    setError(null)
  }

  const onFile = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoUrl(typeof reader.result === 'string' ? reader.result : null)
      stopCamera()
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  const continueToPin = () => {
    if (!photoUrl) {
      setError('Take or choose a photo first.')
      return
    }
    setStep('pin')
    setError(null)
  }

  const submitClockIn = async () => {
    if (!binding) {
      setError('Bind this register before clock-in.')
      return
    }
    if (!photoUrl) {
      setError('Photo required.')
      setStep('photo')
      return
    }
    if (employeeCode.trim().length < 1 || pin.length !== HRM_POS_PIN_DIGITS) {
      setError(`Enter employee code and ${HRM_POS_PIN_DIGITS}-digit PIN.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { staff } = await verifyHrmPosPin({ employeeCode, pin, binding })
      const storeId = staff.home_store_id?.trim()
      if (!storeId) {
        throw new Error('HRM staff has no home_store_id — cannot clock in from POS.')
      }
      await clockInViaHrm({
        staffId: staff.id,
        storeId,
        binding,
        photoCaptured: true,
      })
      setDoneName(staff.display_name || staff.employee_code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clock-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      data-testid="pos-clock-in-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Clock in"
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Clock in</p>
            <p className="text-xs text-muted-foreground" data-testid="pos-clock-in-step">
              Step {POS_CLOCK_IN_STEPS.indexOf(step) + 1} of {POS_CLOCK_IN_STEPS.length}:{' '}
              {step === 'photo' ? 'Photo' : 'Employee PIN'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {doneName ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center" data-testid="pos-clock-in-done">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-lg font-semibold">Clocked in</p>
              <p className="text-muted-foreground">{doneName}</p>
              <Button className="mt-4" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : step === 'photo' ? (
            <div className="space-y-3" data-testid="pos-clock-in-photo">
              <div className="overflow-hidden rounded-xl bg-black">
                {photoUrl ? (
                  <img src={photoUrl} alt="Clock-in capture" className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {!photoUrl ? (
                  <Button type="button" className="h-12" onClick={captureFromVideo}>
                    <Camera className="h-4 w-4" /> Capture
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12"
                    onClick={() => {
                      setPhotoUrl(null)
                      setStep('photo')
                      void navigator.mediaDevices
                        .getUserMedia({ video: { facingMode: 'user' }, audio: false })
                        .then((stream) => {
                          streamRef.current = stream
                          if (videoRef.current) {
                            videoRef.current.srcObject = stream
                            void videoRef.current.play().catch(() => {})
                          }
                        })
                        .catch(() => {})
                    }}
                  >
                    Retake
                  </Button>
                )}
                <Button type="button" variant="outline" className="h-12" onClick={() => fileRef.current?.click()}>
                  Choose photo
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" className="h-12 w-full" disabled={!photoUrl} onClick={continueToPin}>
                Continue to PIN
              </Button>
            </div>
          ) : (
            <div className="space-y-4" data-testid="pos-clock-in-pin">
              {photoUrl && (
                <img src={photoUrl} alt="" className="mx-auto h-24 w-24 rounded-full object-cover" />
              )}
              <label className="block">
                <span className="text-sm text-muted-foreground">Employee code</span>
                <input
                  className="mt-1.5 w-full rounded-md border px-4 py-3 font-mono text-xl uppercase"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  placeholder="EMP-CODE"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </label>
              <div>
                <div className="mb-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  {HRM_POS_PIN_DIGITS}-digit PIN
                </div>
                <div className="mb-3 flex justify-center gap-2">
                  {Array.from({ length: HRM_POS_PIN_DIGITS }).map((_, i) => (
                    <div
                      key={i}
                      className={cn('h-3.5 w-3.5 rounded-full', i < pin.length ? 'bg-primary' : 'bg-muted')}
                    />
                  ))}
                </div>
                <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
                    k === '' ? (
                      <span key="pad" />
                    ) : (
                      <Button
                        key={k}
                        type="button"
                        variant="outline"
                        className="h-14 text-xl"
                        onClick={() => {
                          if (k === '⌫') setPin((p) => p.slice(0, -1))
                          else setPin((p) => (p.length < HRM_POS_PIN_DIGITS ? p + k : p))
                        }}
                      >
                        {k}
                      </Button>
                    ),
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-12" onClick={() => setStep('photo')}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="h-12"
                  disabled={busy || employeeCode.length < 1 || pin.length !== HRM_POS_PIN_DIGITS}
                  onClick={() => void submitClockIn()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {busy ? 'Clocking in…' : 'Clock in'}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-center text-sm text-destructive" data-testid="pos-clock-in-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

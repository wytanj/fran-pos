import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AlertCircle, Camera } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Numpad } from '@/pos/components/numpad'
import {
  HRM_POS_PIN_DIGITS,
  clockHrmPosIn,
  loadRegisterBinding,
  verifyHrmPosPin,
} from '@/pos/lib/hrm-pos-auth'
import {
  clockInControls,
  hrmStoreId,
  initialClockInStep,
  reduceClockInStep,
  type ClockInStep,
} from '@/pos/lib/pos-clock-in'
import { cn } from '@/lib/utils'

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

async function openClockCamera(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: 'user' } },
    { audio: false, video: true },
  ]
  let lastError: unknown = null
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Camera is unavailable')
}

export function PosClockInModal({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [step, setStep] = useState<ClockInStep>(initialClockInStep)
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resultName, setResultName] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const controls = clockInControls(step)
  const previewing = controls.photo && step.step === 'photo' && step.shot === null

  useEffect(() => {
    if (!previewing) return
    let cancelled = false
    const video = videoRef.current

    void openClockCamera()
      .then(async (stream) => {
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        if (!video) return
        video.srcObject = stream
        await video.play()
        if (!cancelled) setCameraReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setCameraReady(false)
          setCameraError('Camera is blocked. Choose a photo instead.')
        }
      })

    return () => {
      cancelled = true
      stopStream(streamRef.current)
      streamRef.current = null
      setCameraReady(false)
    }
  }, [previewing])

  const captureFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const photo = canvas.toDataURL('image/jpeg', 0.85)
    setStep((current) => reduceClockInStep(current, { type: 'capture', photo }))
  }

  const onPickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const photo = typeof reader.result === 'string' ? reader.result : ''
      setStep((current) => reduceClockInStep(current, { type: 'capture', photo }))
    }
    reader.readAsDataURL(file)
  }

  const submitPin = async () => {
    if (step.step !== 'pin') return
    const binding = loadRegisterBinding()
    if (!binding) {
      setError('Bind this register before clocking in')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { staff } = await verifyHrmPosPin({
        employeeCode,
        pin,
        binding,
      })
      const storeId = hrmStoreId(staff.home_store_id)
      if (!storeId) throw new Error('HRM did not return a home store for this employee')
      await clockHrmPosIn({ staffId: staff.id, storeId })
      setResultName(staff.display_name || staff.employee_code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clock in failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = employeeCode.trim().length > 0 && pin.length === HRM_POS_PIN_DIGITS && !submitting

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        {resultName ? (
          <div className="flex flex-col items-center text-center">
            <h2 className="text-lg font-semibold">Clocked in</h2>
            <p className="mt-2 text-sm text-muted-foreground">{resultName}</p>
            <Button className="mt-5 h-11 w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : controls.photo && step.step === 'photo' ? (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold">Clock in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Take a photo first. It stays on this tablet.
              </p>
            </div>
            {step.shot ? (
              <img src={step.shot} alt="Clock-in photo" className="h-56 w-full rounded-lg object-cover" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-56 w-full rounded-lg bg-black object-cover"
              />
            )}
            {cameraError && !step.shot && (
              <p className="text-sm text-destructive">{cameraError}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={captureFrame} disabled={!cameraReady || Boolean(step.shot)}>
                <Camera className="h-4 w-4" />
                Capture
              </Button>
              <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-md border border-line bg-background px-3 text-sm font-medium">
                Choose a photo
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="sr-only"
                  onChange={onPickPhoto}
                />
              </label>
            </div>
            {step.shot && (
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => setStep((current) => reduceClockInStep(current, { type: 'retake' }))}
              >
                Retake
              </Button>
            )}
            <Button
              type="button"
              className="h-12"
              disabled={!controls.canContinue}
              onClick={() => setStep((current) => reduceClockInStep(current, { type: 'continue' }))}
            >
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold">Employee PIN</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Employee code + {HRM_POS_PIN_DIGITS}-digit PIN
            </p>
            <label className="mt-3 block text-sm">
              <span className="text-muted-foreground">Employee code</span>
              <input
                className="mt-1.5 w-full rounded-md border px-3 py-2.5 font-mono text-lg uppercase"
                value={employeeCode}
                onChange={(event) => {
                  setEmployeeCode(event.target.value.toUpperCase())
                  setError(null)
                }}
                placeholder="ADM-AD26"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <div className="my-4 flex justify-center gap-1.5">
              {Array.from({ length: HRM_POS_PIN_DIGITS }).map((_, i) => (
                <div
                  key={i}
                  className={cn('h-2.5 w-2.5 rounded-full', i < pin.length ? 'bg-primary' : 'bg-muted')}
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
              onPress={(key) => {
                setError(null)
                setPin((current) => (current.length < HRM_POS_PIN_DIGITS ? current + key : current))
              }}
              onBackspace={() => setPin((current) => current.slice(0, -1))}
            />
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setError(null)
                  setPin('')
                  setStep((current) => reduceClockInStep(current, { type: 'retake' }))
                }}
              >
                Back
              </Button>
              <Button type="button" className="flex-1" disabled={!canSubmit} onClick={() => void submitPin()}>
                {submitting ? 'Clocking in…' : 'Clock in'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

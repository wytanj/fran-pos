import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MEMBER_PHONE_COUNTRIES,
  MEMBER_PHONE_DEFAULT_DIAL,
  composeMemberPhoneRaw,
} from '@/pos/fran/lib/member-phone-countries'
import type { MirrorMemberPhonePrompt } from './mirror-snapshot'
import { submitMirrorFaceInput } from './mirror-api'

export function MemberPhonePromptView({
  prompt,
  displayToken,
}: {
  prompt: MirrorMemberPhonePrompt
  displayToken: string
}) {
  const [dial, setDial] = useState(MEMBER_PHONE_DEFAULT_DIAL)
  const [national, setNational] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (prompt.status === 'result') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center" data-testid="mirror-member-phone-result">
        <p className="font-display text-5xl font-bold leading-tight">
          {prompt.found ? 'You are already a member' : 'Not a member yet'}
        </p>
        {prompt.found && prompt.memberName && (
          <p className="text-3xl text-muted-foreground">Welcome back, {prompt.memberName}</p>
        )}
        <p className="text-2xl tabular-nums text-muted-foreground">
          {prompt.dial} {prompt.nationalNumber}
        </p>
        {!prompt.found && (
          <p className="max-w-md text-xl text-brown-soft">Our team can finish signup at the counter.</p>
        )}
      </div>
    )
  }

  const submit = async () => {
    const raw = composeMemberPhoneRaw(dial, national)
    if (!raw) {
      setError('Enter your mobile number')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await submitMirrorFaceInput(displayToken, {
        kind: 'member_phone',
        dial,
        nationalNumber: national.replace(/\D/g, ''),
        raw,
        at: new Date().toISOString(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send number')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-6" data-testid="mirror-member-phone-prompt">
      <div className="text-center">
        <p className="eyebrow text-lg">Fran With Benefits</p>
        <p className="mt-2 font-display text-4xl font-bold">Enter your mobile</p>
        <p className="mt-2 text-xl text-muted-foreground">Country code + number only</p>
      </div>

      <label className="block space-y-2">
        <span className="text-lg font-medium">Country</span>
        <select
          className="h-16 w-full rounded-2xl border border-line bg-white px-4 text-2xl"
          value={dial}
          onChange={(e) => setDial(e.target.value)}
          data-testid="mirror-member-phone-dial"
        >
          {MEMBER_PHONE_COUNTRIES.map((c) => (
            <option key={`${c.dial}-${c.name}`} value={c.dial}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-lg font-medium">Mobile number</span>
        <Input
          inputMode="tel"
          autoComplete="tel-national"
          className="h-20 rounded-2xl px-5 text-3xl tracking-wide"
          value={national}
          onChange={(e) => setNational(e.target.value)}
          placeholder={dial === '+65' ? '91234567' : 'Number'}
          data-testid="mirror-member-phone-national"
        />
      </label>

      {error && <p className="text-center text-xl text-warning">{error}</p>}

      <Button
        type="button"
        className="h-20 rounded-2xl text-2xl font-semibold"
        disabled={busy || !national.trim()}
        onClick={() => void submit()}
        data-testid="mirror-member-phone-submit"
      >
        {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : null}
        {busy ? 'Sending…' : 'Submit'}
      </Button>
    </div>
  )
}

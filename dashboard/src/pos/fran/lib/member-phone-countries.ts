/** Dial list for mirror + cashier member phone prompt. Priority group first, then the rest. */

export type MemberPhoneCountry = { dial: string; label: string; name: string }

const PRIORITY: MemberPhoneCountry[] = [
  { dial: '+65', name: 'Singapore', label: 'Singapore +65' },
  { dial: '+60', name: 'Malaysia', label: 'Malaysia +60' },
  { dial: '+62', name: 'Indonesia', label: 'Indonesia +62' },
  { dial: '+86', name: 'China', label: 'China +86' },
  { dial: '+82', name: 'Korea', label: 'Korea +82' },
  { dial: '+81', name: 'Japan', label: 'Japan +81' },
  { dial: '+1', name: 'US', label: 'US +1' },
  { dial: '+44', name: 'UK', label: 'UK +44' },
]

const REST: MemberPhoneCountry[] = [
  { dial: '+852', name: 'Hong Kong', label: 'Hong Kong +852' },
  { dial: '+886', name: 'Taiwan', label: 'Taiwan +886' },
  { dial: '+91', name: 'India', label: 'India +91' },
  { dial: '+63', name: 'Philippines', label: 'Philippines +63' },
  { dial: '+66', name: 'Thailand', label: 'Thailand +66' },
  { dial: '+84', name: 'Vietnam', label: 'Vietnam +84' },
  { dial: '+673', name: 'Brunei', label: 'Brunei +673' },
  { dial: '+61', name: 'Australia', label: 'Australia +61' },
  { dial: '+64', name: 'New Zealand', label: 'New Zealand +64' },
  { dial: '+49', name: 'Germany', label: 'Germany +49' },
  { dial: '+33', name: 'France', label: 'France +33' },
  { dial: '+971', name: 'UAE', label: 'UAE +971' },
].sort((a, b) => a.name.localeCompare(b.name))

export const MEMBER_PHONE_DEFAULT_DIAL = '+65'

export const MEMBER_PHONE_COUNTRIES: MemberPhoneCountry[] = [...PRIORITY, ...REST]

export const MEMBER_PHONE_PRIORITY_DIALS = PRIORITY.map((c) => c.dial)

/** Build E.164-ish raw for resolveMember; SG local 8-digit stays local (CRM convention). */
export function composeMemberPhoneRaw(dial: string, national: string): string {
  const digits = national.replace(/\D/g, '')
  if (!digits) return ''
  if (dial === '+65') {
    const sg = digits.match(/^(?:65)?(\d{8})$/)
    return sg ? sg[1] : digits
  }
  const stripped = digits.replace(/^0+/, '')
  return `${dial}${stripped}`
}

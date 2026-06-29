import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Plus, RefreshCcw, ShieldCheck, UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  useCreatePosStaffMember,
  usePosStaffMembers,
  useSetPosStaffPasscode,
  useUpdatePosStaffMember,
} from '@/hooks/use-pos-staff'
import type { PosStaffMember, UserRole } from '@pos/shared'

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'cashier', label: 'Cashier' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]

const employmentTypes = ['full-time', 'part-time', 'temporary']

const emptyForm = {
  displayName: '',
  role: 'cashier' as UserRole,
  passcode: '',
  employmentStatus: 'active',
  employmentType: 'part-time',
  isEor: true,
  eorProvider: 'rippling',
}

export default function StaffSettingsPage() {
  const { data: staff = [], isLoading } = usePosStaffMembers()
  const createStaff = useCreatePosStaffMember()
  const updateStaff = useUpdatePosStaffMember()
  const setPasscode = useSetPosStaffPasscode()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [passcodeDialog, setPasscodeDialog] = useState<PosStaffMember | null>(null)
  const [newPasscode, setNewPasscode] = useState('')
  const [form, setForm] = useState(emptyForm)

  const rosterStats = useMemo(() => {
    const active = staff.filter((s) => s.pos_access_enabled && s.employment_status.toLowerCase() !== 'terminated').length
    const sourced = staff.filter((s) => s.source_provider !== 'manual').length
    const eor = staff.filter((s) => s.is_eor).length
    return { active, sourced, eor }
  }, [staff])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createStaff.mutateAsync({
        displayName: form.displayName,
        role: form.role,
        passcode: form.passcode || undefined,
        sourceProvider: 'manual',
        employmentStatus: form.employmentStatus,
        employmentType: form.employmentType,
        isEor: form.isEor,
        eorProvider: form.isEor ? form.eorProvider : undefined,
      })
      toast.success('POS staff member created')
      setDialogOpen(false)
      setForm(emptyForm)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create staff member')
    }
  }

  const handleToggleAccess = async (member: PosStaffMember, enabled: boolean) => {
    try {
      await updateStaff.mutateAsync({ id: member.id, pos_access_enabled: enabled })
      toast.success(enabled ? 'POS access enabled' : 'POS access disabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update POS access')
    }
  }

  const handleRoleChange = async (member: PosStaffMember, role: UserRole) => {
    try {
      await updateStaff.mutateAsync({ id: member.id, role })
      toast.success('POS role updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  const handleResetPasscode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passcodeDialog) return
    try {
      await setPasscode.mutateAsync({ staffMemberId: passcodeDialog.id, passcode: newPasscode })
      toast.success('Passcode reset')
      setPasscodeDialog(null)
      setNewPasscode('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset passcode')
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="POS-enabled" value={rosterStats.active} />
        <Stat label="Synced identities" value={rosterStats.sourced} />
        <Stat label="EOR covered" value={rosterStats.eor} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>POS Staff</CardTitle>
            <CardDescription>Manage register passcodes, POS roles, and external roster identity.</CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : staff.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <UserCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No POS staff yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add manual staff now, then sync Rippling workers later.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Employment</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>POS Access</TableHead>
                  <TableHead className="w-24">Passcode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <p className="font-medium">{member.display_name}</p>
                      <p className="text-xs text-muted-foreground">{member.email || member.external_subject_id || 'Manual POS identity'}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={member.source_provider === 'manual' ? 'secondary' : 'default'} className="capitalize">
                          {member.source_provider}
                        </Badge>
                        {member.is_eor && <Badge variant="success">EOR</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="capitalize">{member.employment_status}</p>
                      <p className="text-xs capitalize text-muted-foreground">{member.employment_type || 'Not set'}</p>
                    </TableCell>
                    <TableCell>
                      <Select value={member.role} onChange={(e) => handleRoleChange(member, e.target.value as UserRole)}>
                        {roleOptions.map((role) => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={member.pos_access_enabled}
                        onCheckedChange={(enabled) => handleToggleAccess(member, enabled)}
                        aria-label={`Toggle POS access for ${member.display_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setPasscodeDialog(member)}>
                        <KeyRound className="h-4 w-4" /> Reset
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster Sync Contract</CardTitle>
          <CardDescription>External sources can upsert workers into this same staff model.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <RefreshCcw className="h-4 w-4" /> Source-neutral identity
            </div>
            <p className="text-sm text-muted-foreground">
              Staff rows keep `source_provider`, `external_subject_id`, and employment fields so Rippling, Shopify, or a custom HR source can sync into one POS access API.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" /> Local POS authority
            </div>
            <p className="text-sm text-muted-foreground">
              Passcodes, sessions, and manager approvals stay local to POS so store operations continue even when the upstream roster source changes.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add POS Staff</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>POS Role</Label>
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Passcode</Label>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]{4,12}"
                  value={form.passcode}
                  onChange={(e) => setForm({ ...form, passcode: e.target.value })}
                  placeholder="4-12 digits"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <Select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                  {employmentTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.employmentStatus} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })}>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="terminated">terminated</option>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>EOR via Rippling</Label>
                <p className="text-sm text-muted-foreground">Track EOR coverage without coupling login to Rippling.</p>
              </div>
              <Switch checked={form.isEor} onCheckedChange={(isEor) => setForm({ ...form, isEor })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createStaff.isPending}>Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={passcodeDialog !== null} onOpenChange={(open) => !open && setPasscodeDialog(null)}>
        <DialogContent onClose={() => setPasscodeDialog(null)}>
          <DialogHeader>
            <DialogTitle>Reset Passcode</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPasscode} className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Set a new register passcode for {passcodeDialog?.display_name}.
            </p>
            <div className="space-y-2">
              <Label>New Passcode</Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]{4,12}"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPasscodeDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={setPasscode.isPending}>Reset</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

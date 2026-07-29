import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/providers/auth-provider'
import {
  companyInviteUrl,
  useCompanyInvites,
  useCompanyMembers,
  useCreateCompanyInvite,
  useRevokeCompanyInvite,
  type CompanyInviteRole,
} from '@/hooks/use-company-invites'

const roleOptions: { value: CompanyInviteRole; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'cashier', label: 'Cashier (dashboard)' },
]

export default function TeamSettingsPage() {
  const { company, profile } = useAuth()
  const { data: members = [], isLoading: membersLoading } = useCompanyMembers()
  const { data: invites = [], isLoading: invitesLoading } = useCompanyInvites()
  const createInvite = useCreateCompanyInvite()
  const revokeInvite = useRevokeCompanyInvite()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<CompanyInviteRole>('manager')

  const canManage = profile?.role === 'owner' || profile?.role === 'admin'

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const invite = await createInvite.mutateAsync({ email, role })
      const url = companyInviteUrl(invite.token)
      try {
        await navigator.clipboard.writeText(url)
        toast.success(`Invite created for ${email}. Link copied.`)
      } catch {
        toast.success(`Invite created for ${email}. Copy the link from the pending list.`)
      }
      setEmail('')
      setRole('manager')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invite')
    }
  }

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(companyInviteUrl(token))
      toast.success('Invite link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this invite?')) return
    try {
      await revokeInvite.mutateAsync(id)
      toast.success('Invite revoked')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard team</CardTitle>
          <CardDescription>
            Invite people to <strong>{company?.name || 'this company'}</strong> with Google sign-in.
            They join this POS company (same products and SKUMS connector). Floor PIN cashiers are under{' '}
            <strong>Staff</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canManage && (
            <form onSubmit={handleInvite} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_10rem_auto]">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="colleague@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as CompanyInviteRole)}
                >
                  {roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={createInvite.isPending || !email.trim()}>
                  <UserPlus className="h-4 w-4" />
                  {createInvite.isPending ? 'Sending…' : 'Invite'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Invitee must sign in with Google using the same email. Link is valid 7 days. Copy link works when email
                delivery is unavailable (test Gmail).
              </p>
            </form>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Members</h3>
            {membersLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.display_name || m.user_id.slice(0, 8)}</TableCell>
                      <TableCell className="capitalize">{m.role}</TableCell>
                      <TableCell>
                        <Badge variant={m.is_active ? 'success' : 'secondary'}>
                          {m.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Pending invites</h3>
            {invitesLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-40">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell className="capitalize">{inv.role}</TableCell>
                      <TableCell>{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                      <TableCell className="space-x-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleCopy(inv.token)}>
                          <Copy className="h-3.5 w-3.5" />
                          Copy link
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)}>
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

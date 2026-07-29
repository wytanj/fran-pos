import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import type { UserRole } from '@pos/shared'

export type CompanyInviteRole = Extract<UserRole, 'admin' | 'manager' | 'cashier'>

export interface CompanyInvite {
  id: string
  company_id: string
  email: string
  role: CompanyInviteRole
  status: string
  token: string
  expires_at: string
  created_at: string
}

export interface CompanyInvitePreview {
  status: string
  company_id?: string
  company_name?: string
  role?: string
  email?: string
  expires_at?: string
}

export interface PendingCompanyInvite {
  id: string
  token: string
  role: string
  email: string
  expires_at: string
  created_at: string
  company_id: string
  company_name: string
}

export interface CompanyMemberRow {
  id: string
  user_id: string
  role: UserRole
  display_name: string | null
  is_active: boolean
  created_at: string
}

export function useCompanyMembers() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['company-members', company?.id],
    queryFn: async () => {
      if (!company) return [] as CompanyMemberRow[]
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, role, display_name, is_active, created_at')
        .eq('company_id', company.id)
        .order('created_at')
      if (error) throw error
      return (data || []) as CompanyMemberRow[]
    },
    enabled: !!company,
  })
}

export function useCompanyInvites() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['company-invites', company?.id],
    queryFn: async () => {
      if (!company) return [] as CompanyInvite[]
      const { data, error } = await supabase
        .from('company_invites')
        .select('id, company_id, email, role, status, token, expires_at, created_at')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as CompanyInvite[]
    },
    enabled: !!company,
  })
}

export function useCreateCompanyInvite() {
  const { company, user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; role: CompanyInviteRole }) => {
      if (!company || !user) throw new Error('No company selected')
      const email = input.email.trim().toLowerCase()
      if (!email.includes('@')) throw new Error('Valid email required')
      if (input.role === 'owner' as CompanyInviteRole) {
        throw new Error('Cannot invite as owner')
      }

      const { data, error } = await supabase
        .from('company_invites')
        .insert({
          company_id: company.id,
          email,
          role: input.role,
          invited_by: user.id,
        })
        .select('id, company_id, email, role, status, token, expires_at, created_at')
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('A pending invite already exists for this email')
        }
        throw error
      }
      return data as CompanyInvite
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-invites', company?.id] })
    },
  })
}

export function useRevokeCompanyInvite() {
  const { company } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('company_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-invites', company?.id] })
    },
  })
}

export async function previewCompanyInvite(token: string): Promise<CompanyInvitePreview> {
  const { data, error } = await supabase.rpc('get_company_invite_preview', { p_token: token })
  if (error) throw error
  return (data || { status: 'not_found' }) as CompanyInvitePreview
}

export async function acceptCompanyInvite(token: string): Promise<{ status: string; company_id: string }> {
  const { data, error } = await supabase.rpc('accept_company_invite', { p_token: token })
  if (error) throw error
  return data as { status: string; company_id: string }
}

export async function listMyPendingCompanyInvites(): Promise<PendingCompanyInvite[]> {
  const { data, error } = await supabase.rpc('list_my_pending_company_invites')
  if (error) throw error
  return (Array.isArray(data) ? data : []) as PendingCompanyInvite[]
}

export function companyInviteUrl(token: string) {
  if (typeof window === 'undefined') return `/invite/${token}`
  return `${window.location.origin}/invite/${token}`
}

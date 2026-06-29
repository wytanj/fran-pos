import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import type { PosStaffMember, UserRole } from '@pos/shared'

export interface PosStaffLoginResult {
  session: {
    id: string
    started_at: string
  }
  staff: {
    id: string
    display_name: string
    role: UserRole
    source_provider: string
    employment_type: string | null
    is_eor: boolean
    eor_provider: string | null
  }
}

export interface PosAuthorizationResult {
  authorization: {
    id: string
    authorized_at: string
  }
  approver: {
    id: string
    display_name: string
    role: UserRole
  }
}

export function usePosStaffMembers() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['pos_staff_members', company?.id],
    queryFn: async () => {
      if (!company) return []
      const { data, error } = await supabase
        .from('pos_staff_members')
        .select('*')
        .eq('company_id', company.id)
        .order('display_name')
      if (error) throw error
      return data as PosStaffMember[]
    },
    enabled: !!company,
  })
}

export function useCreatePosStaffMember() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      displayName: string
      role: UserRole
      passcode?: string
      sourceProvider?: string
      employmentStatus?: string
      employmentType?: string
      isEor?: boolean
      eorProvider?: string
    }) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase.rpc('create_pos_staff_member', {
        p_company_id: company.id,
        p_display_name: input.displayName,
        p_role: input.role,
        p_passcode: input.passcode || null,
        p_source_provider: input.sourceProvider || 'manual',
        p_external_subject_id: null,
        p_employment_status: input.employmentStatus || 'active',
        p_employment_type: input.employmentType || null,
        p_is_eor: input.isEor ?? false,
        p_eor_provider: input.eorProvider || null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos_staff_members', company?.id] })
    },
  })
}

export function useUpdatePosStaffMember() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      id: string
      role?: UserRole
      pos_access_enabled?: boolean
      employment_status?: string
      employment_type?: string | null
      is_eor?: boolean
      eor_provider?: string | null
    }) => {
      const { id, ...patch } = input
      const { data, error } = await supabase
        .from('pos_staff_members')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as PosStaffMember
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos_staff_members', company?.id] })
    },
  })
}

export function useSetPosStaffPasscode() {
  return useMutation({
    mutationFn: async (input: { staffMemberId: string; passcode: string }) => {
      const { data, error } = await supabase.rpc('set_pos_staff_passcode', {
        p_staff_member_id: input.staffMemberId,
        p_passcode: input.passcode,
        p_expires_at: null,
      })
      if (error) throw error
      return data as string
    },
  })
}

export function useStartPosStaffSession() {
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: { staffMemberId: string; passcode: string; registerId?: string; deviceId?: string }) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase.rpc('start_pos_staff_session', {
        p_company_id: company.id,
        p_staff_member_id: input.staffMemberId,
        p_passcode: input.passcode,
        p_register_id: input.registerId || 'web-register',
        p_device_id: input.deviceId || null,
      })
      if (error) throw error
      return data as PosStaffLoginResult
    },
  })
}

export function useAuthorizePosAction() {
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: { sessionId: string; passcode: string; action: string; reason?: string; metadata?: Record<string, unknown> }) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase.rpc('authorize_pos_action', {
        p_company_id: company.id,
        p_session_id: input.sessionId,
        p_passcode: input.passcode,
        p_action: input.action,
        p_reason: input.reason || null,
        p_metadata: input.metadata || {},
      })
      if (error) throw error
      return data as PosAuthorizationResult
    },
  })
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import type { CompanySettings, TaxRate, PaymentMethod } from '@pos/shared'

export function useCompanySettings() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['settings', company?.id],
    queryFn: async () => {
      if (!company) return null
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', company.id)
        .single()
      if (error) throw error
      return data as CompanySettings
    },
    enabled: !!company,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: Partial<CompanySettings>) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('company_settings')
        .update(input)
        .eq('company_id', company.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', company?.id] })
    },
  })
}

export function useUpdateCompany() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: { name?: string }) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('companies')
        .update(input)
        .eq('id', company.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', company?.id] })
    },
  })
}

// Tax Rates
export function useTaxRates() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['tax_rates', company?.id],
    queryFn: async () => {
      if (!company) return []
      const { data, error } = await supabase
        .from('tax_rates')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at')
      if (error) throw error
      return data as TaxRate[]
    },
    enabled: !!company,
  })
}

export function useCreateTaxRate() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; rate: number; is_inclusive?: boolean; is_default?: boolean }) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('tax_rates')
        .insert({ ...input, company_id: company.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax_rates', company?.id] })
    },
  })
}

export function useDeleteTaxRate() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tax_rates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax_rates', company?.id] })
    },
  })
}

// Payment Methods
export function usePaymentMethods() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['payment_methods', company?.id],
    queryFn: async () => {
      if (!company) return []
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('company_id', company.id)
        .order('sort_order')
      if (error) throw error
      return data as PaymentMethod[]
    },
    enabled: !!company,
  })
}

export function useCreatePaymentMethod() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; type: string }) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('payment_methods')
        .insert({ ...input, company_id: company.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_methods', company?.id] })
    },
  })
}

export function useDeletePaymentMethod() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_methods', company?.id] })
    },
  })
}

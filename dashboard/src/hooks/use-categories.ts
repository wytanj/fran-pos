import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import type { Category } from '@pos/shared'

export function useCategories() {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['categories', company?.id],
    queryFn: async () => {
      if (!company) return []
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('company_id', company.id)
        .order('sort_order')
      if (error) throw error
      return data as Category[]
    },
    enabled: !!company,
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('categories')
        .insert({ ...input, company_id: company.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', company?.id] })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('categories')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', company?.id] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', company?.id] })
    },
  })
}

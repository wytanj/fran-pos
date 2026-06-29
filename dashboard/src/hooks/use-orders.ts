import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import type { Order, OrderItem } from '@pos/shared'

export function useOrders(filters?: { status?: string; from?: string; to?: string }) {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['orders', company?.id, filters],
    queryFn: async () => {
      if (!company) return []
      let query = supabase
        .from('orders')
        .select('*, payment_method:payment_methods(id, name)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.from) {
        query = query.gte('created_at', filters.from)
      }
      if (filters?.to) {
        query = query.lte('created_at', filters.to + 'T23:59:59')
      }

      const { data, error } = await query
      if (error) throw error
      return data as Order[]
    },
    enabled: !!company,
  })
}

export function useOrderDetails(orderId: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*, payment_method:payment_methods(id, name)')
        .eq('id', orderId)
        .single()
      if (orderError) throw orderError

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at')
      if (itemsError) throw itemsError

      return { ...order, items } as Order & { items: OrderItem[] }
    },
    enabled: !!orderId,
  })
}

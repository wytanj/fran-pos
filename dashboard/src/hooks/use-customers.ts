import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import type {
  Customer,
  PosCustomerExternalLink,
  PosCustomerIdentifier,
  PosCustomerIdentifierType,
  PosCustomerResolution,
} from '@pos/shared'

function sanitizeSearch(value: string) {
  return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ')
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ''
}

function normalizePhone(value: string | null | undefined) {
  return value?.replace(/\D/g, '') || ''
}

function optionalIdentityLinkError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  return error.code === '42P01' || /pos_customer_(identifiers|external_links)/i.test(error.message || '')
}

function customerSearchClauses(search: string) {
  const normalized = sanitizeSearch(search)
  if (!normalized) return []

  const clauses = [
    `first_name.ilike.%${normalized}%`,
    `last_name.ilike.%${normalized}%`,
    `email.ilike.%${normalized}%`,
    `phone.ilike.%${normalized}%`,
  ]

  for (const term of normalized.split(' ').filter(Boolean).slice(0, 4)) {
    if (term !== normalized) {
      clauses.push(`first_name.ilike.%${term}%`, `last_name.ilike.%${term}%`)
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    clauses.push(`birthday.eq.${normalized}`)
  }

  return clauses
}

function identifierSearchClauses(search: string) {
  const normalized = sanitizeSearch(search).toLowerCase()
  const phone = normalizePhone(search)
  const clauses: string[] = []

  if (normalized.length >= 2) clauses.push(`normalized_value.ilike.%${normalized}%`)
  if (phone.length >= 2 && phone !== normalized) clauses.push(`normalized_value.ilike.%${phone}%`)

  return clauses
}

function uniqueCustomers(customers: Customer[]) {
  const byId = new Map<string, Customer>()
  for (const customer of customers) byId.set(customer.id, customer)
  return [...byId.values()]
}

function customerResolution(customers: Customer[], source: PosCustomerResolution['source'], warnings: string[] = []): PosCustomerResolution {
  return {
    status: customers.length === 0 ? 'none' : customers.length === 1 ? 'exact' : 'candidates',
    source,
    customers,
    warnings,
  }
}

function identityRowsForCustomer(customer: Customer) {
  const rows: Array<Omit<PosCustomerIdentifier, 'id' | 'created_at' | 'updated_at'>> = []
  const email = normalizeEmail(customer.email)
  const phone = normalizePhone(customer.phone)
  const provider = customer.source || 'pos'

  if (email) {
    rows.push({
      company_id: customer.company_id,
      customer_id: customer.id,
      identifier_type: 'email',
      normalized_value: email,
      display_value: customer.email,
      provider,
      verified_at: null,
      metadata: { source: 'customers.email' },
    })
  }

  if (phone) {
    rows.push({
      company_id: customer.company_id,
      customer_id: customer.id,
      identifier_type: 'phone',
      normalized_value: phone,
      display_value: customer.phone,
      provider,
      verified_at: null,
      metadata: { source: 'customers.phone' },
    })
  }

  return rows
}

function externalLinkRowsForCustomer(customer: Customer) {
  if (!customer.external_id?.trim()) return []

  return [{
    company_id: customer.company_id,
    customer_id: customer.id,
    provider: customer.source || 'external',
    external_id: customer.external_id.trim(),
    external_ref: { legacy_source: customer.source },
    is_primary: true,
    last_seen_at: customer.updated_at,
    metadata: { source: 'customers.external_id' },
  } satisfies Omit<PosCustomerExternalLink, 'id' | 'created_at' | 'updated_at'>]
}

async function syncCustomerIdentityLinks(customer: Customer) {
  const identifierRows = identityRowsForCustomer(customer)
  if (identifierRows.length > 0) {
    const { error } = await supabase
      .from('pos_customer_identifiers')
      .upsert(identifierRows, {
        onConflict: 'company_id,identifier_type,normalized_value',
        ignoreDuplicates: true,
      })

    if (error && !optionalIdentityLinkError(error)) throw error
  }

  const externalLinkRows = externalLinkRowsForCustomer(customer)
  if (externalLinkRows.length > 0) {
    const { error } = await supabase
      .from('pos_customer_external_links')
      .upsert(externalLinkRows, {
        onConflict: 'company_id,provider,external_id',
        ignoreDuplicates: true,
      })

    if (error && !optionalIdentityLinkError(error)) throw error
  }
}

async function loadCustomersByIds(companyId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean)
  if (uniqueIds.length === 0) return []

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('id', uniqueIds)
    .limit(50)

  if (error) throw error
  return (data || []) as Customer[]
}

async function loadIdentifierCustomerIds(companyId: string, search: string) {
  const clauses = identifierSearchClauses(search)
  if (clauses.length === 0) return { ids: [] as string[], warnings: [] as string[] }

  const { data, error } = await supabase
    .from('pos_customer_identifiers')
    .select('customer_id')
    .eq('company_id', companyId)
    .or(clauses.join(','))
    .limit(50)

  if (error) {
    if (optionalIdentityLinkError(error)) {
      return { ids: [] as string[], warnings: ['Customer identifier table is not migrated yet.'] }
    }
    throw error
  }

  return { ids: ((data || []) as Array<Pick<PosCustomerIdentifier, 'customer_id'>>).map((row) => row.customer_id), warnings: [] as string[] }
}

async function loadExternalLinkCustomerIds(companyId: string, search: string) {
  const normalized = sanitizeSearch(search)
  if (normalized.length < 2) return { ids: [] as string[], warnings: [] as string[] }

  const { data, error } = await supabase
    .from('pos_customer_external_links')
    .select('customer_id')
    .eq('company_id', companyId)
    .ilike('external_id', `%${normalized}%`)
    .limit(50)

  if (error) {
    if (optionalIdentityLinkError(error)) {
      return { ids: [] as string[], warnings: ['Customer external-link table is not migrated yet.'] }
    }
    throw error
  }

  return { ids: ((data || []) as Array<Pick<PosCustomerExternalLink, 'customer_id'>>).map((row) => row.customer_id), warnings: [] as string[] }
}

async function loadDirectCustomerMatches(companyId: string, search?: string) {
  let query = supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (search && search.length >= 2) {
    const clauses = customerSearchClauses(search)
    if (clauses.length > 0) query = query.or(clauses.join(','))
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []) as Customer[]
}

export function useCustomers(search?: string) {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['customers', company?.id, search],
    queryFn: async () => {
      if (!company) return []
      return loadDirectCustomerMatches(company.id, search)
    },
    enabled: !!company,
  })
}

export function useResolvedCustomers(search?: string, enabled = true) {
  const { company } = useAuth()
  return useQuery({
    queryKey: ['customer-resolution', company?.id, search],
    queryFn: async (): Promise<PosCustomerResolution> => {
      if (!company) return customerResolution([], 'local')

      const directMatches = await loadDirectCustomerMatches(company.id, search)
      if (!search || search.trim().length < 2) {
        return customerResolution(directMatches, 'local')
      }

      const [identifierMatches, externalLinkMatches] = await Promise.all([
        loadIdentifierCustomerIds(company.id, search),
        loadExternalLinkCustomerIds(company.id, search),
      ])
      const linkedCustomers = await loadCustomersByIds(
        company.id,
        [...identifierMatches.ids, ...externalLinkMatches.ids]
      )
      const customers = uniqueCustomers([...linkedCustomers, ...directMatches])
      const source: PosCustomerResolution['source'] =
        linkedCustomers.length > 0
          ? identifierMatches.ids.length > 0
            ? 'identity_link'
            : 'external_link'
          : directMatches.length > 0
            ? 'local'
            : 'fallback'

      return customerResolution(customers, source, [
        ...identifierMatches.warnings,
        ...externalLinkMatches.warnings,
      ])
    },
    enabled: enabled && !!company,
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Customer
    },
    enabled: !!id,
  })
}

export function useCustomerOrders(customerId: string) {
  return useQuery({
    queryKey: ['customer-orders', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, payment_method:payment_methods(id, name)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
    enabled: !!customerId,
  })
}

interface CustomerInput {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  birthday?: string
  notes?: string
  tags?: string[]
  external_id?: string
  source?: string
}

export type CustomerIdentifierInput = CustomerInput
export type CustomerIdentifierKind = PosCustomerIdentifierType

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (input: CustomerInput) => {
      if (!company) throw new Error('No company selected')
      const { data, error } = await supabase
        .from('customers')
        .insert({ ...input, company_id: company.id })
        .select()
        .single()
      if (error) throw error
      await syncCustomerIdentityLinks(data as Customer)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', company?.id] })
      queryClient.invalidateQueries({ queryKey: ['customer-resolution', company?.id] })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async ({ id, ...input }: CustomerInput & { id: string }) => {
      const { data, error } = await supabase
        .from('customers')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      await syncCustomerIdentityLinks(data as Customer)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', company?.id] })
      queryClient.invalidateQueries({ queryKey: ['customer-resolution', company?.id] })
    },
  })
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', company?.id] })
    },
  })
}

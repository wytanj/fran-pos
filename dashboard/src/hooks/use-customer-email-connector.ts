import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import { useCompanySettings } from '@/hooks/use-settings'
import {
  buildCustomerEmailConnectorSettings,
  toCustomerEmailConnectorConfig,
  type CustomerEmailConnectorConfig,
} from '@/pos/lib/customer-email-connector'
import type { CompanySettings } from '@pos/shared'

const defaultPosConfig = {
  quick_sale_mode: false,
  require_customer: false,
  allow_negative_inventory: false,
  default_tax_rate_id: null,
}

export function useCustomerEmailConnector() {
  const query = useCompanySettings()
  return {
    ...query,
    connector: toCustomerEmailConnectorConfig(query.data),
    isConfigured: Boolean(toCustomerEmailConnectorConfig(query.data)),
  }
}

export async function loadCustomerEmailConnectorForCompany(
  companyId: string
): Promise<CustomerEmailConnectorConfig | null> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('pos_config')
    .eq('company_id', companyId)
    .single()

  if (error) throw error
  return toCustomerEmailConnectorConfig(data as Pick<CompanySettings, 'pos_config'>)
}

export function useSaveCustomerEmailConnector() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  const { data: settings } = useCompanySettings()

  return useMutation({
    mutationFn: async (input: {
      enabled?: boolean
      provider_label: string
      endpoint_url: string
      auth_type?: 'none' | 'bearer'
      auth_token?: string
      from_email?: string
      reply_to_email?: string
    }) => {
      if (!company) throw new Error('No company selected')

      let currentPosConfig = settings?.pos_config
      if (!currentPosConfig) {
        const { data: currentSettings, error: settingsError } = await supabase
          .from('company_settings')
          .select('pos_config')
          .eq('company_id', company.id)
          .single()

        if (settingsError) throw settingsError
        currentPosConfig = (currentSettings as Pick<CompanySettings, 'pos_config'> | null)?.pos_config
      }

      const posConfig = {
        ...defaultPosConfig,
        ...(currentPosConfig || {}),
        customer_email_connector: buildCustomerEmailConnectorSettings(input),
      }

      const { data, error } = await supabase
        .from('company_settings')
        .update({ pos_config: posConfig })
        .eq('company_id', company.id)
        .select()
        .single()

      if (error) throw error
      return data as CompanySettings
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', company?.id] })
    },
  })
}

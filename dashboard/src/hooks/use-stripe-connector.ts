import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth-provider'
import { useCompanySettings } from '@/hooks/use-settings'
import {
  buildStripeTerminalSettings,
  mergePosConfigWithStripe,
  toStripeTerminalConfig,
} from '@/pos/lib/stripe-connector'
import type { CompanySettings, StripeTerminalSettings } from '@pos/shared'

export function useStripeConnector() {
  const query = useCompanySettings()
  return {
    ...query,
    connector: toStripeTerminalConfig(query.data),
    isConfigured: Boolean(toStripeTerminalConfig(query.data)),
  }
}

export function useSaveStripeConnector() {
  const queryClient = useQueryClient()
  const { company } = useAuth()
  const { data: settings } = useCompanySettings()

  return useMutation({
    mutationFn: async (input: Partial<StripeTerminalSettings> & { enabled?: boolean }) => {
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

      const { data, error } = await supabase
        .from('company_settings')
        .update({
          pos_config: mergePosConfigWithStripe(currentPosConfig, buildStripeTerminalSettings(input)),
        })
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

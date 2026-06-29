import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sharedTypes = readFileSync(new URL('../packages/shared/src/types/database.ts', import.meta.url), 'utf8')
const connector = readFileSync(new URL('../dashboard/src/pos/lib/customer-email-connector.ts', import.meta.url), 'utf8')
const hook = readFileSync(new URL('../dashboard/src/hooks/use-customer-email-connector.ts', import.meta.url), 'utf8')
const integrationsPage = readFileSync(new URL('../dashboard/src/pages/settings/integrations.tsx', import.meta.url), 'utf8')
const saleCompleteModal = readFileSync(new URL('../dashboard/src/pos/components/sale-complete-modal.tsx', import.meta.url), 'utf8')

test('POS settings carry a provider-neutral customer email connector', () => {
  assert.match(sharedTypes, /customer_email_connector\?: CustomerEmailConnectorSettings \| null/)
  assert.match(sharedTypes, /export interface CustomerEmailConnectorSettings/)
  assert.match(sharedTypes, /endpoint_url: string/)
  assert.match(sharedTypes, /auth_type: CustomerEmailConnectorAuthType/)
  assert.match(sharedTypes, /export interface CustomerEmailReceiptPayload/)
  assert.match(sharedTypes, /event: 'receipt\.email\.requested'/)
  assert.match(sharedTypes, /provider_ref: string \| null/)
  assert.match(sharedTypes, /provider_metadata: Record<string, unknown>/)
})

test('customer email connector builds and invokes a standard receipt payload', () => {
  assert.match(connector, /export function buildCustomerEmailReceiptPayload\(sale: CompletedSale\)/)
  assert.match(connector, /recipientEmail/)
  assert.match(connector, /receipt: \{/)
  assert.match(connector, /payments: sale\.payments\.map/)
  assert.match(connector, /provider: payment\.provider \?\? null/)
  assert.match(connector, /provider_metadata: payment\.providerMetadata \?\? \{\}/)
  assert.match(connector, /plain_text_receipt/)
  assert.match(connector, /export async function invokeCustomerEmailConnector/)
  assert.match(connector, /'x-pos-event': payload\.event/)
  assert.match(connector, /headers\.authorization = `Bearer \$\{connector\.authToken\}`/)
})

test('live settings can save a customer-owned email API endpoint', () => {
  assert.match(hook, /useSaveCustomerEmailConnector/)
  assert.match(hook, /customer_email_connector: buildCustomerEmailConnectorSettings\(input\)/)
  assert.match(integrationsPage, /Customer Email Connector/)
  assert.match(integrationsPage, /Endpoint URL/)
  assert.match(integrationsPage, /Save Email Connector/)
  assert.match(integrationsPage, /pos_skums_connector_last_success/)
  assert.match(integrationsPage, /Last successful check/)
  assert.match(integrationsPage, /receiving endpoint owns template rendering/)
})

test('receipt email button uses the connector instead of hardcoded email vendors', () => {
  assert.match(saleCompleteModal, /useCustomerEmailConnector/)
  assert.match(saleCompleteModal, /buildCustomerEmailReceiptPayload\(sale\)/)
  assert.match(saleCompleteModal, /invokeCustomerEmailConnector\(connector, payload\)/)
  assert.match(saleCompleteModal, /CUSTOMER_EMAIL_CONNECTOR_MISSING_MESSAGE/)
  assert.doesNotMatch(saleCompleteModal + connector + integrationsPage, /sendgrid|mailchimp|klaviyo|postmark/i)
})

import {
  mockCommitRewardRedemption,
  mockGetCounterSession,
  mockPreviewBasket,
  mockQuoteRewardRedemption,
  mockResolveMember,
  mockReverseRewardRedemption,
  mockSendEvent,
} from '../mock-crm'
import type {
  FranBasketPreview,
  FranBasketPreviewInput,
  FranCounterSession,
  FranCounterSessionInput,
  FranCrmEventAck,
  FranCrmEventInput,
  FranMemberResolution,
  FranMemberResolutionInput,
  FranRewardCommit,
  FranRewardCommitInput,
  FranRewardQuote,
  FranRewardQuoteInput,
  FranRewardReverse,
  FranRewardReverseInput,
} from '../types'

export interface FranCrmClient {
  resolveMember(input: FranMemberResolutionInput): Promise<FranMemberResolution>
  getCounterSession(input: FranCounterSessionInput): Promise<FranCounterSession>
  previewBasket(input: FranBasketPreviewInput): Promise<FranBasketPreview>
  quoteRewardRedemption(input: FranRewardQuoteInput): Promise<FranRewardQuote>
  commitRewardRedemption(input: FranRewardCommitInput): Promise<FranRewardCommit>
  reverseRewardRedemption(input: FranRewardReverseInput): Promise<FranRewardReverse>
  sendEvent(input: FranCrmEventInput): Promise<FranCrmEventAck>
}

export interface FranCrmClientOptions {
  endpointUrl?: string
  mode?: 'mock' | 'live'
}

function browserFranCrmSettings() {
  if (typeof window === 'undefined') return { endpointUrl: '', offlineMode: true }
  return {
    endpointUrl: localStorage.getItem('fran_crm_endpoint_url') || '',
    offlineMode: localStorage.getItem('fran_crm_offline_mode') !== 'false',
  }
}

function normalizeEndpoint(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

async function postJson<TInput, TOutput>(endpointUrl: string, path: string, input: TInput): Promise<TOutput> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 4000)
  let response: Response

  try {
    response = await fetch(`${endpointUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pos-client': 'fran-pos',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === 'AbortError'
      ? 'Fran CRM unreachable. Continue checkout offline.'
      : 'Fran CRM unreachable. Continue checkout offline.')
  } finally {
    window.clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Fran CRM request failed (${response.status})${body ? `: ${body}` : ''}`)
  }

  return response.json() as Promise<TOutput>
}

export function createFranCrmClient(options: FranCrmClientOptions = {}): FranCrmClient {
  const saved = browserFranCrmSettings()
  const configuredEndpoint = options.endpointUrl ?? import.meta.env.VITE_FRAN_CRM_URL
  const endpointUrl = normalizeEndpoint(configuredEndpoint ?? saved.endpointUrl)
  const mode = options.mode ?? (configuredEndpoint ? 'live' : saved.offlineMode ? 'mock' : endpointUrl ? 'live' : 'mock')

  if (mode === 'mock') {
    return {
      resolveMember: mockResolveMember,
      getCounterSession: mockGetCounterSession,
      previewBasket: mockPreviewBasket,
      quoteRewardRedemption: mockQuoteRewardRedemption,
      commitRewardRedemption: mockCommitRewardRedemption,
      reverseRewardRedemption: mockReverseRewardRedemption,
      sendEvent: mockSendEvent,
    }
  }

  if (!endpointUrl) throw new Error('Set VITE_FRAN_CRM_URL before enabling live Fran CRM mode.')

  return {
    resolveMember: (input) => postJson(endpointUrl, '/fran/pos/member/resolve', input),
    getCounterSession: (input) => postJson(endpointUrl, '/fran/pos/counter-session', input),
    previewBasket: (input) => postJson(endpointUrl, '/fran/pos/basket/preview', input),
    quoteRewardRedemption: (input) => postJson(endpointUrl, '/fran/pos/rewards/quote', input),
    commitRewardRedemption: (input) => postJson(endpointUrl, '/fran/pos/rewards/commit', input),
    reverseRewardRedemption: (input) => postJson(endpointUrl, '/fran/pos/rewards/reverse', input),
    sendEvent: (input) => postJson(endpointUrl, '/api/v1/events', input),
  }
}

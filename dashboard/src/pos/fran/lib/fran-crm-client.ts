import {
  mockCommitRewardRedemption,
  mockGetActivePolicy,
  mockGetCounterSession,
  mockPreviewBasket,
  mockQuoteRewardRedemption,
  mockResolveMember,
  mockReverseRewardRedemption,
  mockSendEvent,
} from '../mock-crm'
import type {
  FranActivePolicyInput,
  FranBasketPreview,
  FranBasketPreviewInput,
  FranCounterSession,
  FranCounterSessionInput,
  FranCrmEventAck,
  FranCrmEventInput,
  FranLoyaltyPolicyBundle,
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
  getActivePolicy(input: FranActivePolicyInput): Promise<FranLoyaltyPolicyBundle>
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

async function getJson<TOutput>(endpointUrl: string, path: string): Promise<TOutput> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 4000)
  let response: Response

  try {
    response = await fetch(`${endpointUrl}${path}`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-pos-client': 'fran-pos',
      },
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

const policyCachePrefix = 'fran_loyalty_policy_cache:v1'

function policyCacheIndexKey(input: FranActivePolicyInput) {
  return `${policyCachePrefix}:index:${input.workspaceId}:${input.programKey}`
}

function policyCacheKey(bundle: Pick<FranLoyaltyPolicyBundle, 'workspaceId' | 'programKey' | 'policyVersionId' | 'assignmentId'>) {
  return `${policyCachePrefix}:${bundle.workspaceId}:${bundle.programKey}:${bundle.policyVersionId}:${bundle.assignmentId}`
}

function policyWithCacheMeta(bundle: FranLoyaltyPolicyBundle, status: FranLoyaltyPolicyBundle['cache']['status']) {
  const cachedAt = new Date().toISOString()
  const staleAt = new Date(Date.now() + Math.max(1, bundle.allowedTtlSeconds) * 1000).toISOString()
  const cacheKey = policyCacheKey(bundle)
  return {
    ...bundle,
    cache: {
      status,
      cacheKey,
      cachedAt,
      staleAt,
    },
  }
}

function writePolicyCache(input: FranActivePolicyInput, bundle: FranLoyaltyPolicyBundle) {
  if (typeof window === 'undefined') return bundle
  const cached = policyWithCacheMeta(bundle, 'fresh')
  localStorage.setItem(cached.cache.cacheKey, JSON.stringify(cached))
  localStorage.setItem(policyCacheIndexKey(input), cached.cache.cacheKey)
  return cached
}

function readPolicyCache(input: FranActivePolicyInput): FranLoyaltyPolicyBundle | null {
  if (typeof window === 'undefined') return null
  const cacheKey = localStorage.getItem(policyCacheIndexKey(input))
  if (!cacheKey) return null

  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey) || 'null') as FranLoyaltyPolicyBundle | null
    if (!parsed?.policyVersionId || !parsed.assignmentId) return null
    const stale = new Date(parsed.cache.staleAt).getTime() <= Date.now()
    return {
      ...parsed,
      cache: {
        ...parsed.cache,
        cacheKey,
        status: stale ? 'stale' : 'offline_fallback',
      },
      warnings: [
        ...parsed.warnings,
        stale
          ? 'Cached loyalty policy is past its allowed TTL. Earn can be queued; redemption requires live policy refresh.'
          : 'Using cached loyalty policy because Fran CRM is offline.',
      ],
    }
  } catch {
    return null
  }
}

async function getActivePolicy(endpointUrl: string, input: FranActivePolicyInput) {
  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    programKey: input.programKey,
  })

  try {
    const bundle = await getJson<FranLoyaltyPolicyBundle>(
      endpointUrl,
      `/api/fran/loyalty/policy-versions/active?${params.toString()}`
    )
    return writePolicyCache(input, bundle)
  } catch (error) {
    const cached = readPolicyCache(input)
    if (cached) return cached
    throw error
  }
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
      getActivePolicy: mockGetActivePolicy,
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
    getActivePolicy: (input) => getActivePolicy(endpointUrl, input),
    previewBasket: (input) => postJson(endpointUrl, '/fran/pos/basket/preview', input),
    quoteRewardRedemption: (input) => postJson(endpointUrl, '/fran/pos/rewards/quote', input),
    commitRewardRedemption: (input) => postJson(endpointUrl, '/fran/pos/rewards/commit', input),
    reverseRewardRedemption: (input) => postJson(endpointUrl, '/fran/pos/rewards/reverse', input),
    sendEvent: (input) => postJson(endpointUrl, '/api/v1/events', input),
  }
}

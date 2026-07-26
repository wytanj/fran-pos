import {
  mockAuthorizeVoucher,
  mockCommitRewardRedemption,
  mockCommitSale,
  mockGetActivePolicy,
  mockGetCounterSession,
  mockIssueEarnVoucher,
  mockPreviewBasket,
  mockQuoteRedeemDens,
  mockQuoteRewardRedemption,
  mockResolveMember,
  mockReverseRewardRedemption,
  mockSendEvent,
} from '../mock-crm'
import type {
  FranActivePolicyInput,
  FranAuthorizeVoucherInput,
  FranAuthorizeVoucherResult,
  FranBasketPreview,
  FranBasketPreviewInput,
  FranCounterSession,
  FranCounterSessionInput,
  FranCrmEventAck,
  FranCrmEventInput,
  FranIssuedVoucher,
  FranLoyaltyCommitSaleInput,
  FranLoyaltyCommitSaleResult,
  FranLoyaltyPolicyBundle,
  FranMemberResolution,
  FranMemberResolutionInput,
  FranQuoteRedeemDensInput,
  FranQuoteRedeemDensResult,
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
  /** L-pos: settle earn/redeem after payment (same sale_id as SKUMS sale). */
  commitSale(input: FranLoyaltyCommitSaleInput): Promise<FranLoyaltyCommitSaleResult>
  quoteRedeemDens(input: FranQuoteRedeemDensInput): Promise<FranQuoteRedeemDensResult>
  authorizeVoucher(input: FranAuthorizeVoucherInput): Promise<FranAuthorizeVoucherResult>
  issueEarnVoucher(input: {
    memberId: string
    kind: 'birthday' | 'category_bonus'
    currency?: string
  }): Promise<{ ok: true; voucher: FranIssuedVoucher }>
  sendEvent(input: FranCrmEventInput): Promise<FranCrmEventAck>
}

export interface FranCrmSkumsBridge {
  apiUrl: string
  apiKey: string
}

export interface FranCrmClientOptions {
  endpointUrl?: string
  mode?: 'mock' | 'live' | 'skums'
  /** Preferred: loyalty via SKUMS workspace key (POS → SKUMS → CRM). */
  skums?: FranCrmSkumsBridge | null
}

/** Shared demo workspace UUID used by fran-crm tests and POS live bridge. */
export const FRAN_CRM_DEMO_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111'

function browserFranCrmSettings() {
  if (typeof window === 'undefined') {
    return { endpointUrl: '', offlineMode: true, workspaceId: FRAN_CRM_DEMO_WORKSPACE_ID }
  }
  return {
    endpointUrl: localStorage.getItem('fran_crm_endpoint_url') || '',
    offlineMode: localStorage.getItem('fran_crm_offline_mode') !== 'false',
    workspaceId:
      localStorage.getItem('fran_crm_workspace_id')?.trim() || FRAN_CRM_DEMO_WORKSPACE_ID,
  }
}

function hasSkumsBridge(skums?: FranCrmSkumsBridge | null) {
  return Boolean(skums?.apiUrl?.trim() && skums?.apiKey?.trim())
}

/**
 * Live loyalty available when:
 * - SKUMS connector is set (target architecture), or
 * - legacy direct CRM URL with offline mock off.
 */
export function isFranCrmLiveConfigured(options: FranCrmClientOptions = {}) {
  if (options.mode === 'mock') return false
  if (hasSkumsBridge(options.skums)) return true
  const saved = browserFranCrmSettings()
  const configuredEndpoint = options.endpointUrl ?? import.meta.env.VITE_FRAN_CRM_URL
  const endpointUrl = normalizeEndpoint(configuredEndpoint ?? saved.endpointUrl)
  if (options.mode === 'live' || options.mode === 'skums') return Boolean(endpointUrl || hasSkumsBridge(options.skums))
  if (configuredEndpoint) return true
  return Boolean(endpointUrl) && !saved.offlineMode
}

function withWorkspaceId<T extends Record<string, unknown>>(input: T, workspaceId: string): T & { workspaceId: string } {
  return {
    ...input,
    workspaceId: (input as { workspaceId?: string }).workspaceId || workspaceId,
  }
}

function normalizeEndpoint(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

type FetchAuth = { apiKey?: string }

async function postJson<TInput, TOutput>(
  endpointUrl: string,
  path: string,
  input: TInput,
  auth: FetchAuth = {},
): Promise<TOutput> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  let response: Response
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-pos-client': 'fran-pos',
  }
  if (auth.apiKey) {
    headers.authorization = `Bearer ${auth.apiKey}`
    headers['x-api-key'] = auth.apiKey
  }

  try {
    response = await fetch(`${endpointUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === 'AbortError'
      ? 'Loyalty service unreachable. Continue checkout offline.'
      : 'Loyalty service unreachable. Continue checkout offline.')
  } finally {
    window.clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Loyalty request failed (${response.status})${body ? `: ${body}` : ''}`)
  }

  return response.json() as Promise<TOutput>
}

async function getJson<TOutput>(
  endpointUrl: string,
  path: string,
  auth: FetchAuth = {},
): Promise<TOutput> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  let response: Response
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-pos-client': 'fran-pos',
  }
  if (auth.apiKey) {
    headers.authorization = `Bearer ${auth.apiKey}`
    headers['x-api-key'] = auth.apiKey
  }

  try {
    response = await fetch(`${endpointUrl}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === 'AbortError'
      ? 'Loyalty service unreachable. Continue checkout offline.'
      : 'Loyalty service unreachable. Continue checkout offline.')
  } finally {
    window.clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Loyalty request failed (${response.status})${body ? `: ${body}` : ''}`)
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

async function getActivePolicy(
  endpointUrl: string,
  input: FranActivePolicyInput,
  opts: { viaSkums?: boolean; apiKey?: string } = {},
) {
  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    programKey: input.programKey,
    format: 'pos',
  })

  const path = opts.viaSkums
    ? `/fran/pos/loyalty/policy/active?${params.toString()}`
    : `/api/fran/loyalty/policy-versions/active?${params.toString()}`

  try {
    const raw = await getJson<FranLoyaltyPolicyBundle & { posPolicyBundle?: FranLoyaltyPolicyBundle }>(
      endpointUrl,
      path,
      { apiKey: opts.apiKey },
    )
    const bundle =
      raw && typeof raw === 'object' && 'posPolicyBundle' in raw && raw.posPolicyBundle
        ? raw.posPolicyBundle
        : (raw as FranLoyaltyPolicyBundle)
    if (!bundle?.policyVersionId) {
      throw new Error('Active loyalty policy missing policyVersionId')
    }
    return writePolicyCache(input, bundle)
  } catch (error) {
    const cached = readPolicyCache(input)
    if (cached) return cached
    throw error
  }
}

/** Fetch POS capabilities (SKUMS + loyalty) when using workspace key. */
export async function fetchPosCapabilities(skums: FranCrmSkumsBridge) {
  const base = normalizeEndpoint(skums.apiUrl)
  return getJson<{
    skums: { ok: boolean }
    loyalty: { ok: boolean; status: string; message: string }
    ready_for_member_loyalty: boolean
    architecture: string
  }>(base, '/fran/pos/capabilities', { apiKey: skums.apiKey })
}

function mapCommitSaleResult(raw: unknown): FranLoyaltyCommitSaleResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  // CRM L-base: { mode, ok, result: FwbCommitSaleResult }
  const result = r.result && typeof r.result === 'object' ? r.result : r
  return {
    commitId: String(result.commitId || r.commitId || `crm-commit-${Date.now()}`),
    saleId: String(result.saleId || r.saleId || ''),
    status: result.status === 'duplicate' ? 'duplicate' : result.status === 'queued' ? 'queued' : 'committed',
    pointsEarned: Number(result.pointsEarned ?? 0),
    pointsRedeemed: Number(result.pointsRedeemed ?? 0),
    pointsBalanceAfter:
      result.pointsBalanceAfter != null ? Number(result.pointsBalanceAfter) : null,
    tierAfter: result.tierAfter != null ? String(result.tierAfter) : null,
    ledgerEntryIds: Array.isArray(result.ledgerEntryIds) ? result.ledgerEntryIds.map(String) : [],
    warnings: [
      ...(Array.isArray(result.warnings) ? result.warnings.map(String) : []),
      r.mode ? `crm_mode:${r.mode}` : null,
    ].filter(Boolean) as string[],
  }
}

export function createFranCrmClient(options: FranCrmClientOptions = {}): FranCrmClient {
  const saved = browserFranCrmSettings()
  const skums = options.skums
  const useSkums = hasSkumsBridge(skums) && options.mode !== 'mock'
  const configuredEndpoint = options.endpointUrl ?? import.meta.env.VITE_FRAN_CRM_URL
  const directCrmUrl = normalizeEndpoint(configuredEndpoint ?? saved.endpointUrl)
  const workspaceId = saved.workspaceId || FRAN_CRM_DEMO_WORKSPACE_ID

  // Prefer SKUMS facade when workspace key is present (target architecture).
  if (useSkums && skums) {
    const base = normalizeEndpoint(skums.apiUrl)
    const auth = { apiKey: skums.apiKey.trim() }
    return {
      resolveMember: (input) =>
        postJson(base, '/fran/pos/loyalty/member/resolve', withWorkspaceId(input as any, workspaceId), auth),
      getCounterSession: (input) =>
        postJson(base, '/fran/pos/loyalty/counter-session', withWorkspaceId(input as any, workspaceId), auth),
      getActivePolicy: (input) =>
        getActivePolicy(
          base,
          { ...input, workspaceId: input.workspaceId || workspaceId },
          { viaSkums: true, apiKey: auth.apiKey },
        ),
      // Basket preview / reward catalogue may still be local mock if CRM has no route
      previewBasket: mockPreviewBasket,
      quoteRewardRedemption: mockQuoteRewardRedemption,
      commitRewardRedemption: mockCommitRewardRedemption,
      reverseRewardRedemption: mockReverseRewardRedemption,
      commitSale: async (input) => {
        const raw = await postJson(
          base,
          '/fran/pos/loyalty/commit-sale',
          withWorkspaceId(
            {
              ...input,
              tierKey: input.session?.member?.tier || undefined,
            } as any,
            workspaceId,
          ),
          auth,
        )
        return mapCommitSaleResult(raw)
      },
      quoteRedeemDens: (input) =>
        postJson(
          base,
          '/fran/pos/loyalty/vouchers/quote-redeem',
          withWorkspaceId(input as any, workspaceId),
          auth,
        ),
      authorizeVoucher: (input) =>
        postJson(
          base,
          '/fran/pos/loyalty/vouchers/authorize',
          withWorkspaceId(input as any, workspaceId),
          auth,
        ),
      issueEarnVoucher: (input) =>
        postJson(
          base,
          '/fran/pos/loyalty/vouchers/issue',
          withWorkspaceId(input as any, workspaceId),
          auth,
        ),
      sendEvent: mockSendEvent,
    }
  }

  const mode =
    options.mode ??
    (configuredEndpoint ? 'live' : saved.offlineMode ? 'mock' : directCrmUrl ? 'live' : 'mock')

  if (mode === 'mock' || mode === 'skums') {
    // mode skums without bridge falls through to mock
    if (mode === 'mock' || !directCrmUrl) {
      return {
        resolveMember: mockResolveMember,
        getCounterSession: mockGetCounterSession,
        getActivePolicy: mockGetActivePolicy,
        previewBasket: mockPreviewBasket,
        quoteRewardRedemption: mockQuoteRewardRedemption,
        commitRewardRedemption: mockCommitRewardRedemption,
        reverseRewardRedemption: mockReverseRewardRedemption,
        commitSale: mockCommitSale,
        quoteRedeemDens: mockQuoteRedeemDens,
        authorizeVoucher: mockAuthorizeVoucher,
        issueEarnVoucher: mockIssueEarnVoucher,
        sendEvent: mockSendEvent,
      }
    }
  }

  if (!directCrmUrl) {
    throw new Error(
      'Configure SKUMS connector (preferred) or legacy Fran CRM URL before live loyalty mode.',
    )
  }

  // Legacy direct CRM (dev shim)
  return {
    resolveMember: (input) =>
      postJson(directCrmUrl, '/fran/pos/member/resolve', withWorkspaceId(input as any, workspaceId)),
    getCounterSession: (input) =>
      postJson(directCrmUrl, '/fran/pos/counter-session', withWorkspaceId(input as any, workspaceId)),
    getActivePolicy: (input) =>
      getActivePolicy(directCrmUrl, { ...input, workspaceId: input.workspaceId || workspaceId }),
    previewBasket: (input) =>
      postJson(directCrmUrl, '/fran/pos/basket/preview', withWorkspaceId(input as any, workspaceId)),
    quoteRewardRedemption: (input) =>
      postJson(directCrmUrl, '/fran/pos/rewards/quote', withWorkspaceId(input as any, workspaceId)),
    commitRewardRedemption: (input) =>
      postJson(directCrmUrl, '/fran/pos/rewards/commit', withWorkspaceId(input as any, workspaceId)),
    reverseRewardRedemption: (input) =>
      postJson(directCrmUrl, '/fran/pos/rewards/reverse', withWorkspaceId(input as any, workspaceId)),
    commitSale: async (input) => {
      const raw = await postJson(
        directCrmUrl,
        '/fran/pos/loyalty/commit-sale',
        withWorkspaceId(
          {
            ...input,
            tierKey: input.session?.member?.tier || undefined,
          } as any,
          workspaceId,
        ),
      )
      return mapCommitSaleResult(raw)
    },
    quoteRedeemDens: (input) =>
      postJson(
        directCrmUrl,
        '/fran/pos/loyalty/vouchers/quote-redeem',
        withWorkspaceId(input as any, workspaceId),
      ),
    authorizeVoucher: (input) =>
      postJson(
        directCrmUrl,
        '/fran/pos/loyalty/vouchers/authorize',
        withWorkspaceId(input as any, workspaceId),
      ),
    issueEarnVoucher: (input) =>
      postJson(
        directCrmUrl,
        '/fran/pos/loyalty/vouchers/issue',
        withWorkspaceId(input as any, workspaceId),
      ),
    sendEvent: (input) =>
      postJson(directCrmUrl, '/api/v1/events', withWorkspaceId(input as any, workspaceId)),
  }
}

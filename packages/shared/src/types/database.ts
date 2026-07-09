export type UserRole = 'owner' | 'admin' | 'manager' | 'cashier';
export type OrderStatus = 'draft' | 'completed' | 'refunded' | 'voided';
export type BusinessType = 'retail' | 'restaurant';
export type PaymentMethodType = 'cash' | 'card' | 'digital' | 'square_pos' | 'other';
export type PosStaffSourceProvider = 'manual' | 'rippling' | 'shopify' | 'custom';
export type PosInventoryEventType = 'inventory.damage.reported' | 'inventory.found_stock.reported' | 'inventory.transfer_receive.reported';
export type PosInventoryEventStatus = 'queued' | 'sent' | 'synced' | 'pending_approval' | 'failed';
export type PosReturnRequestedAction = 'refund' | 'exchange' | 'store_credit' | 'either';
export type PosReturnAllowedAction = 'refund' | 'exchange' | 'store_credit';
export type PosReturnEligibilityDecision =
  | 'eligible'
  | 'exchange_only'
  | 'store_credit_only'
  | 'manager_review'
  | 'ineligible'
  | 'not_found'
  | 'insufficient_context';
export type PosReturnLineMatchType =
  | 'exact_order_line'
  | 'customer_history'
  | 'same_email_product_date'
  | 'no_matched_sale'
  | 'manager_override';
export type PosSourceEventType =
  | 'pos.customer.attached'
  | 'pos.sale.completed'
  | 'pos.return.completed'
  | 'pos.reward.redeem_requested'
  | 'pos.reward.refund_requested'
  | 'fran.member.resolved'
  | 'fran.counter_session.previewed'
  | 'fran.reward.quoted'
  | 'fran.reward.committed'
  | 'fran.reward.reversed'
  | 'fran.reward.commit_failed'
  | 'fran.loyalty_execution.committed'
  | 'fran.points_earn.queued';
export type PosOutboxEventStatus = 'queued' | 'sent' | 'acked' | 'failed';

export interface Company {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  business_type: BusinessType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  company_id: string;
  role: UserRole;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PosIdentitySource {
  id: string;
  company_id: string;
  provider: PosStaffSourceProvider | string;
  external_account_id: string | null;
  display_name: string;
  status: string;
  config: Record<string, unknown>;
  last_sync_at: string | null;
  sync_cursor: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PosStaffMember {
  id: string;
  company_id: string;
  profile_id: string | null;
  source_id: string | null;
  source_provider: PosStaffSourceProvider | string;
  external_subject_id: string | null;
  external_user_id: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  employment_status: string;
  employment_type: string | null;
  is_eor: boolean;
  eor_provider: string | null;
  pos_access_enabled: boolean;
  synced_at: string | null;
  source_updated_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PosStaffSession {
  id: string;
  company_id: string;
  staff_member_id: string;
  register_id: string | null;
  device_id: string | null;
  auth_method: string;
  staff_snapshot: Record<string, unknown>;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
}

export interface PosAuthorization {
  id: string;
  company_id: string;
  session_id: string | null;
  requested_by_staff_member_id: string | null;
  authorized_by_staff_member_id: string | null;
  provider: string;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  authorized_at: string;
}

export interface PosInventoryEvent {
  id: string;
  company_id: string;
  event_type: PosInventoryEventType;
  status: PosInventoryEventStatus;
  idempotency_key: string | null;
  product_id: string | null;
  sku: string | null;
  quantity: number | null;
  store_code: string;
  storage_location_code: string | null;
  reference: string | null;
  reason_code: string | null;
  skums_event_id: string | null;
  skums_status: string | null;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  synced_at: string | null;
}

export interface PosSourceEventEnvelope {
  event_id: string;
  event_type: PosSourceEventType;
  workspace_id: string;
  source_system: 'pos';
  occurred_at: string;
  idempotency_key: string;
  actor: {
    type: 'cashier' | 'system';
    id: string | null;
    display_name: string | null;
  };
  subject: {
    customer_key: string | null;
    external_customer_refs: Array<{
      system: string;
      id: string;
    }>;
  };
  context: {
    channel: 'pos';
    country: string;
    currency: string;
    location_id: string;
    register_id: string;
    listing_id: string | null;
  };
  payload: Record<string, unknown>;
  schema_version: number;
}

export interface PosSale {
  id: string;
  company_id: string;
  receipt_number: string;
  register_id: string;
  location_id: string;
  customer_id: string | null;
  cashier_ref: string | null;
  sale_type: 'sale' | 'exchange';
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  idempotency_key: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PosSaleLine {
  id: string;
  company_id: string;
  sale_id: string;
  line_number: number;
  line_id: string;
  sku: string | null;
  product_id: string | null;
  product_identity_id: string | null;
  trade_unit_id: string | null;
  listing_id: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  line_total: number;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PosReturn {
  id: string;
  company_id: string;
  return_number: string;
  register_id: string;
  location_id: string;
  customer_id: string | null;
  cashier_ref: string | null;
  currency: string;
  subtotal: number;
  refund_total: number;
  idempotency_key: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  crmos_decision_id: string | null;
  crmos_authorization_id: string | null;
  return_check_id: string | null;
  eligibility_decision: PosReturnEligibilityDecision | null;
  manager_ref: string | null;
  manager_reason: string | null;
  created_at: string;
}

export interface PosReturnLine {
  id: string;
  company_id: string;
  return_id: string;
  line_number: number;
  line_id: string;
  sku: string | null;
  product_id: string | null;
  product_identity_id: string | null;
  trade_unit_id: string | null;
  listing_id: string | null;
  quantity: number;
  unit_price: number;
  refund_amount: number;
  reason_code: string | null;
  source_receipt_number: string | null;
  original_line_ref: string | null;
  crmos_order_line_id: string | null;
  source_system: string | null;
  source_order_ref: string | null;
  match_type: PosReturnLineMatchType;
  eligibility_reason_codes: string[];
  disposition: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PosReturnCheck {
  id: string;
  company_id: string;
  crmos_decision_id: string | null;
  crmos_authorization_id: string | null;
  email_hint: string;
  order_date_hint: string | null;
  receipt_or_order_hint: string | null;
  product_ref: Record<string, unknown>;
  sku: string | null;
  requested_qty: number;
  requested_action: PosReturnRequestedAction;
  decision: PosReturnEligibilityDecision;
  allowed_actions: PosReturnAllowedAction[];
  reason_codes: string[];
  manager_required: boolean;
  matched_source_system: string | null;
  matched_order_ref: string | null;
  matched_order_line_ref: string | null;
  raw_decision: Record<string, unknown>;
  checked_by_staff_id: string | null;
  checked_at: string;
  expires_at: string | null;
}

export interface PosOutboxEvent {
  id: string;
  company_id: string;
  event_id: string;
  event_type: PosSourceEventType;
  status: PosOutboxEventStatus;
  source_system: 'pos';
  idempotency_key: string;
  aggregate_type: string;
  aggregate_id: string;
  workspace_id: string;
  occurred_at: string;
  payload: PosSourceEventEnvelope;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  acked_at: string | null;
}

export type PosCustomerIdentifierType = 'email' | 'phone' | 'member_number' | 'qr' | 'external_ref' | 'card';
export type PosCustomerResolutionStatus = 'none' | 'exact' | 'candidates';
export type PosCustomerResolutionSource = 'local' | 'identity_link' | 'external_link' | 'fallback';

export interface PosCustomerIdentifier {
  id: string;
  company_id: string;
  customer_id: string;
  identifier_type: PosCustomerIdentifierType;
  normalized_value: string;
  display_value: string | null;
  provider: string;
  verified_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PosCustomerExternalLink {
  id: string;
  company_id: string;
  customer_id: string;
  provider: string;
  external_id: string;
  external_ref: Record<string, unknown>;
  is_primary: boolean;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PosCustomerResolution {
  status: PosCustomerResolutionStatus;
  source: PosCustomerResolutionSource;
  customers: Customer[];
  warnings: string[];
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost_price: number | null;
  track_inventory: boolean;
  inventory_count: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  category?: Category | null;
}

export interface Order {
  id: string;
  company_id: string;
  order_number: number;
  status: OrderStatus;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  customer_id: string | null;
  payment_method_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  items?: OrderItem[];
  payment_method?: PaymentMethod | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  line_total: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  company_id: string;
  name: string;
  type: PaymentMethodType;
  provider?: string | null;
  provider_config?: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface TaxRate {
  id: string;
  company_id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_inclusive: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Branding {
  primary_color: string;
  logo_url: string | null;
}

export interface ReceiptTemplate {
  show_logo: boolean;
  header_text: string;
  footer_text: string;
  show_tax_breakdown: boolean;
}

export interface PosConfig {
  quick_sale_mode: boolean;
  require_customer: boolean;
  allow_negative_inventory: boolean;
  default_tax_rate_id: string | null;
  skums_connector?: SkumsConnectorSettings | null;
  customer_email_connector?: CustomerEmailConnectorSettings | null;
  crmos_return_eligibility?: CrmosReturnEligibilitySettings | null;
}

export type CrmosReturnFallbackBehavior = 'block' | 'manager_review' | 'store_credit_only';

export interface CrmosReturnEligibilitySettings {
  enabled: boolean;
  provider_label: string;
  endpoint_url: string;
  unavailable_fallback: CrmosReturnFallbackBehavior;
  no_match_fallback: 'ineligible' | 'manager_review' | 'store_credit_only' | 'exchange_only';
  decision_cache_minutes: number;
  updated_at?: string;
}

export interface PosReturnProductRef {
  sku: string | null;
  barcode?: string | null;
  product_id?: string | null;
  product_identity_id?: string | null;
  name?: string | null;
}

export interface PosReturnEligibilityRequest {
  workspaceId: string;
  sourceSystem: 'pos';
  store: {
    id: string;
    registerId: string;
  };
  staff: {
    id: string | null;
  };
  customer: {
    email: string;
  };
  product: PosReturnProductRef;
  purchaseHint: {
    orderDate: string | null;
    receiptOrOrderNumber: string | null;
  };
  requested: {
    quantity: number;
    action: PosReturnRequestedAction;
  };
}

export interface PosReturnEligibilityResponse {
  decisionId: string;
  authorizationId: string | null;
  decision: PosReturnEligibilityDecision;
  allowedActions: PosReturnAllowedAction[];
  managerRequired: boolean;
  expiresAt: string | null;
  reasonCodes: string[];
  message: string;
  matchedPurchase: {
    sourceSystem: string;
    orderRef: string;
    orderDate: string;
    orderLineRef: string | null;
    productName: string;
    sku: string | null;
    quantityPurchased: number;
    quantityAlreadyReturned: number;
    quantityReturnable: number;
    returnableUntil: string | null;
    unitPrice: number | null;
  } | null;
  policy: {
    version: number;
    label: string;
  } | null;
  counterEvidence: Array<{
    label: string;
    value: string;
  }>;
}

export interface SkumsConnectorSettings {
  enabled: boolean;
  api_url: string;
  api_key: string;
  updated_at?: string;
}

export type CustomerEmailConnectorAuthType = 'none' | 'bearer';

export interface CustomerEmailConnectorSettings {
  enabled: boolean;
  provider_label: string;
  endpoint_url: string;
  auth_type: CustomerEmailConnectorAuthType;
  auth_token: string;
  from_email: string | null;
  reply_to_email: string | null;
  updated_at?: string;
}

export interface CustomerEmailReceiptPayload {
  event: 'receipt.email.requested';
  source: 'vantage_pos';
  recipient: {
    email: string;
    name: string | null;
    phone: string | null;
  };
  customer: {
    id: string | null;
    tier: string | null;
    points_balance: number | null;
  };
  receipt: {
    number: string;
    timestamp: string;
    cashier: string;
    sale_type: 'sale' | 'exchange';
    currency: string;
    subtotal: number;
    discount_total: number;
    tax_total: number;
    total: number;
    points_earned: number;
    fran_reward_redemption?: number;
  };
  rewards_redeemed: Array<{
    line_id: string;
    reward_name: string;
    reward_id: string | null;
    reward_quote_id: string | null;
    status: 'redeemed' | 'reversed' | 'failed' | 'quoted';
    points_used: number;
    dollar_equivalent: number | null;
    net_dollar_value_applied: number;
    currency: string;
  }>;
  lines: Array<{
    sku: string;
    name: string;
    line_kind?: string;
    quantity: number;
    unit_price: number;
    line_discount: number;
    line_total: number;
  }>;
  payments: Array<{
    method: string;
    label: string;
    amount: number;
    detail: string | null;
    provider: string | null;
    provider_ref: string | null;
    provider_metadata: Record<string, unknown>;
  }>;
  message: {
    subject: string;
    preview_text: string;
    plain_text_receipt: string;
  };
  metadata: Record<string, unknown>;
}

export interface CompanySettings {
  id: string;
  company_id: string;
  currency: string;
  timezone: string;
  locale: string;
  branding: Branding;
  receipt_template: ReceiptTemplate;
  pos_config: PosConfig;
  custom_fields: unknown[];
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  external_id: string | null;
  source: string;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed/joined
  order_count?: number;
  total_spent?: number;
}

export interface DashboardStats {
  today_revenue: number;
  today_orders: number;
  week_revenue: number;
  week_orders: number;
}

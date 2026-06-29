export interface SkumsGraphRefs {
  product_identity_id: string | null;
  trade_unit_id: string | null;
  listing_id: string | null;
  channel_id: string | null;
  sku_assignment_id: string | null;
  identifier_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  batch_id: string | null;
}

export interface SkumsPosScanMatch extends SkumsGraphRefs {
  confidence: number;
  candidate_source: 'identity_identifier' | 'sku_assignment' | 'listing_identifier' | 'listing_seller_sku';
  display_name: string;
  matched_value: string;
  sku: string | null;
  metadata: Record<string, unknown>;
}

export interface SkumsPosScanResolution {
  match_status: 'none' | 'single' | 'ambiguous';
  identifier: string;
  workspace_id: string;
  channel_id: string | null;
  location_id: string | null;
  warnings: string[];
  matches: SkumsPosScanMatch[];
}

export interface SkumsPosCatalogItem extends SkumsGraphRefs {
  id: string;
  sku: string;
  title: string;
  display_name: string;
  brand_name: string | null;
  category_name: string | null;
  unit_price: number;
  list_price: number;
  currency: string;
  storage_location_code: string | null;
  stock_quantity: number;
  track_inventory: boolean;
  status: 'draft' | 'active' | 'archived';
  pos_enabled: boolean;
  identifiers: {
    sku: string | null;
    ean: string | null;
    upc: string | null;
    gtin: string | null;
    asin: string | null;
    mpn: string | null;
  };
  metadata: Record<string, unknown>;
  revision_id?: string | null;
  row_revision?: number | null;
  updated_at?: string | null;
}

export interface SkumsPosCatalogRevision {
  revision_id: string | null;
  generated_at: string | null;
  source_event_id: string | null;
}

export interface SkumsPosCatalogResponse {
  data: SkumsPosCatalogItem[];
  total: number;
  limit: number;
  offset: number;
  has_more?: boolean;
  next_offset?: number | null;
  revision?: SkumsPosCatalogRevision | null;
}

export type SkumsPosAttentionStatus =
  | 'open'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'resolved'
  | 'failed';

export interface SkumsPosAttentionState {
  id: string;
  status: SkumsPosAttentionStatus;
  reason_code: string | null;
  message: string | null;
}

export type SkumsPosProposalStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed';

export interface SkumsPosProposalState {
  id: string;
  status: SkumsPosProposalStatus;
  approval_id: string | null;
  execution_log_id: string | null;
}

export type SkumsPosLineType =
  | 'sale'
  | 'return'
  | 'exchange_in'
  | 'sample'
  | 'tester'
  | 'bundle_component'
  | 'writeoff';

export interface SkumsPosSaleItemInput extends SkumsGraphRefs {
  line_number?: number;
  display_name: string;
  scanned_value?: string | null;
  quantity: number;
  unit_price: number;
  list_price?: number | null;
  discount_amount?: number;
  tax_amount?: number;
  line_total: number;
  line_type?: SkumsPosLineType;
  reason_code?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SkumsPosPaymentInput {
  payment_method: string;
  payment_ref?: string | null;
  amount: number;
  currency?: string;
  status?: 'pending' | 'captured' | 'failed' | 'refunded' | 'voided';
  metadata?: Record<string, unknown>;
}

export type SkumsPosInventoryEventType =
  | 'inventory.damage.reported'
  | 'inventory.found_stock.reported'
  | 'inventory.transfer_receive.reported';

export type SkumsPosInventoryEventStatus =
  | 'received'
  | 'pending_approval'
  | 'applied'
  | 'rejected'
  | 'failed';

export interface SkumsPosInventoryEventItemInput {
  sku?: string | null;
  product_id?: string | null;
  product?: Partial<SkumsGraphRefs> & {
    id?: string | null;
    product_id?: string | null;
    sku?: string | null;
    name?: string | null;
  };
  line_id?: string | null;
  qty?: number;
  quantity?: number;
}

export interface SkumsPosInventoryEventInput extends Partial<SkumsGraphRefs> {
  event_type: SkumsPosInventoryEventType;
  idempotency_key?: string | null;
  source?: 'vantage_pos' | string;
  pos_location_code?: string | null;
  inventory_location_id?: string | null;
  store?: {
    code: string;
    name?: string;
    inventory_location_id?: string | null;
  };
  product?: Partial<SkumsGraphRefs> & {
    id?: string | null;
    product_id?: string | null;
    sku?: string | null;
    name?: string | null;
  };
  sku?: string | null;
  quantity?: number;
  storage_location_code?: string | null;
  reason_code?: string | null;
  reference?: string | null;
  note?: string | null;
  transfer_id?: string | null;
  transfer_number?: string | null;
  receipts?: SkumsPosInventoryEventItemInput[];
  items?: SkumsPosInventoryEventItemInput[];
  occurred_at?: string;
  metadata?: Record<string, unknown>;
}

export interface SkumsPosInventoryEventResponse {
  data: {
    id: string;
    event_type: SkumsPosInventoryEventType;
    status: SkumsPosInventoryEventStatus;
    idempotency_key: string | null;
    product_id: string | null;
    sku: string | null;
    quantity: number | null;
    reference: string | null;
    adjustment_id: string | null;
    transfer_id: string | null;
    result: Record<string, unknown>;
    error_message: string | null;
  };
  duplicate?: boolean;
}

export interface SkumsPosSaleInput {
  location_id?: string | null;
  register_id?: string | null;
  register_session_id?: string | null;
  receipt_number: string;
  sale_type?: 'sale' | 'return' | 'exchange' | 'sample_issue' | 'tester_conversion' | 'writeoff';
  status?: 'draft' | 'completed' | 'voided' | 'refunded' | 'failed';
  customer_ref?: string | null;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  source?: 'pos' | 'api' | 'import' | 'sync' | 'system';
  idempotency_key: string;
  completed_at?: string;
  items: SkumsPosSaleItemInput[];
  payments?: SkumsPosPaymentInput[];
  metadata?: Record<string, unknown>;
}

export interface SkumsPosSaleResponse {
  data: {
    id: string;
    receipt_number: string;
    status: 'draft' | 'completed' | 'voided' | 'refunded' | 'failed';
    idempotency_key: string;
    line_ids: string[];
    payment_ids: string[];
    domain_event_ids: string[];
    execution_log_ids: string[];
    attention?: SkumsPosAttentionState | null;
    proposal?: SkumsPosProposalState | null;
  };
  duplicate?: boolean;
}

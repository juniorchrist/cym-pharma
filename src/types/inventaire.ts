// Types du module Inventaire — CYM Pharma
// Règle : aucune de ces données ne sort jamais vers le client public.

export type MovementType =
  | 'opening'
  | 'purchase'
  | 'sale_shop'
  | 'sale_online'
  | 'return'
  | 'loss'
  | 'adjustment'
  | 'count_correction';

export type PeriodStatus = 'open' | 'counting' | 'closed';
export type CountStatus = 'draft' | 'validated' | 'skipped';
export type ItemStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'negative' | 'untracked';

export interface InventoryItem {
  id: string;
  code: string;
  designation: string;
  designation_norm: string;
  unit_label: string;
  product_id: string | null;
  min_stock: number | null;
  is_tracked: boolean;
  qty_on_hand: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  item_id: string;
  type: MovementType;
  quantity: number;
  movement_date: string;
  reason: string | null;
  order_id: string | null;
  order_item_id: string | null;
  period_id: string | null;
  created_by: string;
  created_at: string;
}

export interface InventoryPeriod {
  id: string;
  year_month: string;
  status: PeriodStatus;
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
}

export interface InventoryCount {
  id: string;
  period_id: string;
  item_id: string;
  counted_qty: number | null;
  theoretical_qty: number;
  variance: number | null;
  note: string | null;
  counted_by: string | null;
  counted_at: string | null;
  status: CountStatus;
}

export interface PeriodItem {
  period_id: string;
  item_id: string;
  opening_qty: number;
  entries: number;
  exits: number;
  closing_qty: number;
}

export interface CreateItemPayload {
  designation: string;
  unit_label?: string;
  product_id?: string | null;
  min_stock?: number | null;
  is_tracked?: boolean;
  opening_qty?: number;
  opening_reason?: string;
  movement_date?: string;
}

export interface UpdateItemPayload {
  designation?: string;
  unit_label?: string;
  product_id?: string | null;
  min_stock?: number | null;
  is_tracked?: boolean;
  is_active?: boolean;
}

export interface CreateMovementPayload {
  item_id: string;
  type: MovementType;
  quantity: number;
  movement_date: string;
  reason?: string | null;
  order_id?: string | null;
  order_item_id?: string | null;
  period_id?: string | null;
}

export interface UpdateCountPayload {
  counted_qty: number | null;
  note?: string | null;
  status?: CountStatus;
}

export interface ImportPreviewRow {
  row_index: number;
  designation_raw: string;
  designation_clean: string;
  unit_label: string;
  stock_opening: number;
  stock_current: number;
  is_negative: boolean;
  is_duplicate: boolean;
  duplicate_of?: string;
  is_tracked: boolean;
  action: 'import' | 'skip' | 'import_as_zero';
  note?: string;
}

export interface ImportPreviewResult {
  total_rows: number;
  valid: number;
  duplicates: number;
  negative: number;
  zero_stock: number;
  rows: ImportPreviewRow[];
}

export interface ImportCommitPayload {
  rows: ImportPreviewRow[];
  period_id?: string | null;
  movement_date: string;
}

export interface InventoryItemWithStatus extends InventoryItem {
  status: ItemStatus;
}

export interface MovementWithItem extends StockMovement {
  designation?: string;
  unit_label?: string;
}

export interface PeriodWithCounts extends InventoryPeriod {
  total_items: number;
  counted_items: number;
  items_with_variance: number;
}

export interface InventoryStats {
  total_tracked: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  negative: number;
  untracked: number;
  open_period: InventoryPeriod | null;
}

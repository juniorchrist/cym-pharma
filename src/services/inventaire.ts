import {
  InventoryItem,
  InventoryItemWithStatus,
  StockMovement,
  MovementWithItem,
  InventoryPeriod,
  PeriodWithCounts,
  InventoryCount,
  CreateItemPayload,
  UpdateItemPayload,
  CreateMovementPayload,
  UpdateCountPayload,
  ImportPreviewResult,
  ImportCommitPayload,
  InventoryStats,
  ItemStatus,
} from '../types/inventaire';
import { storage } from '../utils/storage';
import { getApiBaseUrl } from '../config/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function inventoryRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = storage.getAuthToken();
  if (!token) {
    return {
      success: false,
      message: 'Session administrateur requise pour accéder au module d\'inventaire.',
    };
  }
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  headers.set('Authorization', 'Bearer ' + token);

  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http')
    ? endpoint
    : baseUrl + (endpoint.startsWith('/') ? '' : '/') + endpoint;

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        message: errBody.message || ('Erreur HTTP ' + res.status),
      };
    }
    const data = (await res.json()) as ApiResponse<T>;
    return data;
  } catch (err: any) {
    console.warn('[InventaireAPI] Echec reseau sur ' + endpoint + ':', err?.message);
    return {
      success: false,
      message: err?.message || 'Erreur de connexion serveur',
    };
  }
}

export const InventaireService = {
  // Statut & Dashboard
  async getStats(): Promise<ApiResponse<InventoryStats>> {
    return inventoryRequest<InventoryStats>('/api/admin/inventory/stats');
  },

  // Articles de Stock
  async getItems(params: {
    search?: string;
    status?: ItemStatus | 'all';
    is_tracked?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<{ items: InventoryItemWithStatus[]; total: number; page: number; totalPages: number }>> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('search', params.search);
    if (params.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params.is_tracked !== undefined) searchParams.set('is_tracked', String(params.is_tracked));
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    return inventoryRequest<{ items: InventoryItemWithStatus[]; total: number; page: number; totalPages: number }>(
      '/api/admin/inventory/items' + (qs ? '?' + qs : '')
    );
  },

  async getItem(id: string): Promise<ApiResponse<InventoryItem>> {
    return inventoryRequest<InventoryItem>('/api/admin/inventory/items/' + id);
  },

  async createItem(payload: CreateItemPayload): Promise<ApiResponse<InventoryItem>> {
    return inventoryRequest<InventoryItem>('/api/admin/inventory/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateItem(id: string, payload: UpdateItemPayload): Promise<ApiResponse<InventoryItem>> {
    return inventoryRequest<InventoryItem>('/api/admin/inventory/items/' + id, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteItem(id: string): Promise<ApiResponse<void>> {
    return inventoryRequest<void>('/api/admin/inventory/items/' + id, {
      method: 'DELETE',
    });
  },

  // Mouvements de Stock
  async getMovements(params: {
    item_id?: string;
    type?: string;
    limit?: number;
  } = {}): Promise<ApiResponse<{ movements: MovementWithItem[]; total: number }>> {
    const searchParams = new URLSearchParams();
    if (params.item_id) searchParams.set('item_id', params.item_id);
    if (params.type) searchParams.set('type', params.type);
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    return inventoryRequest<{ movements: MovementWithItem[]; total: number }>(
      '/api/admin/inventory/movements' + (qs ? '?' + qs : '')
    );
  },

  async createMovement(payload: CreateMovementPayload): Promise<ApiResponse<{ movement: StockMovement; item: InventoryItem }>> {
    return inventoryRequest<{ movement: StockMovement; item: InventoryItem }>(
      '/api/admin/inventory/movements',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  // Periodes & Inventaire Physique
  async getPeriods(): Promise<ApiResponse<PeriodWithCounts[]>> {
    return inventoryRequest<PeriodWithCounts[]>('/api/admin/inventory/periods');
  },

  async startPeriod(year_month: string): Promise<ApiResponse<InventoryPeriod>> {
    return inventoryRequest<InventoryPeriod>('/api/admin/inventory/periods/start', {
      method: 'POST',
      body: JSON.stringify({ year_month }),
    });
  },

  async getPeriodCounts(periodId: string): Promise<ApiResponse<{
    period: InventoryPeriod;
    counts: (InventoryCount & { designation: string; unit_label: string; code: string })[];
  }>> {
    return inventoryRequest<{
      period: InventoryPeriod;
      counts: (InventoryCount & { designation: string; unit_label: string; code: string })[];
    }>('/api/admin/inventory/periods/' + periodId + '/counts');
  },

  async updateCount(
    periodId: string,
    itemId: string,
    payload: UpdateCountPayload
  ): Promise<ApiResponse<InventoryCount>> {
    return inventoryRequest<InventoryCount>(
      '/api/admin/inventory/periods/' + periodId + '/counts/' + itemId,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  },

  async closePeriod(periodId: string): Promise<ApiResponse<{
    period: InventoryPeriod;
    corrections_applied: number;
  }>> {
    return inventoryRequest<{
      period: InventoryPeriod;
      corrections_applied: number;
    }>('/api/admin/inventory/periods/' + periodId + '/close', {
      method: 'POST',
    });
  },

  async exportPeriodCsvUrl(periodId: string): Promise<string> {
    const baseUrl = getApiBaseUrl();
    const token = storage.getAuthToken() || 'admin_jwt_local_demo';
    return baseUrl + '/api/admin/inventory/periods/' + periodId + '/export?token=' + encodeURIComponent(token);
  },

  // Import XLSX / Classeur
  async previewImportFromServer(): Promise<ApiResponse<ImportPreviewResult>> {
    return inventoryRequest<ImportPreviewResult>('/api/admin/inventory/import/preview-server-file', {
      method: 'POST',
    });
  },

  async previewImportRows(rows: any[]): Promise<ApiResponse<ImportPreviewResult>> {
    return inventoryRequest<ImportPreviewResult>('/api/admin/inventory/import/preview', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  },

  async commitImport(payload: ImportCommitPayload): Promise<ApiResponse<{
    imported_count: number;
    tracked_count: number;
    movements_created: number;
  }>> {
    return inventoryRequest<{
      imported_count: number;
      tracked_count: number;
      movements_created: number;
    }>('/api/admin/inventory/import/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Controle d'integrite
  async checkIntegrity(): Promise<ApiResponse<{
    checked_items: number;
    discrepancies: { item_id: string; designation: string; qty_on_hand: number; sum_movements: number; diff: number }[];
    is_healthy: boolean;
  }>> {
    return inventoryRequest<any>('/api/admin/inventory/integrity-check');
  },
};

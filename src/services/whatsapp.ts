/**
 * src/services/whatsapp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Service frontend pour appeler les Edge Functions Supabase WhatsApp.
 *
 * ARCHITECTURE DE SÉCURITÉ :
 *   - Le frontend appelle les Edge Functions via l'URL Supabase + la clé anon publique.
 *   - Les secrets WhatsApp Business API (token, phone_number_id) sont stockés
 *     UNIQUEMENT côté serveur (Supabase Edge Functions Secrets).
 *   - La clé service_role ne transite JAMAIS dans le navigateur.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WhatsAppRelanceResult {
  success: boolean;
  message: string;
  relance?: {
    id: string;
    userId: string | number;
    userName: string;
    status: 'sent' | 'failed' | 'pending';
    sent_at: string;
    whatsappDirectUrl?: string;
  };
  user?: Record<string, unknown>;
}

export interface WhatsAppNotifyResult {
  success: boolean;
  message: string;
  orderId?: string;
  orderNumber?: string;
  adminNotified: boolean;
  clientNotified: boolean;
  adminMessageId?: string | null;
  waEnabled: boolean;
}

export interface OrderNotifyPayload {
  orderId: string;
  orderNumber?: string;
  clientName?: string;
  establishmentName?: string;
  total?: number;
  currency?: string;
  itemCount?: number;
  clientPhone?: string;
  notifyClient?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Récupère l'URL des Edge Functions Supabase depuis les variables d'environnement.
 * Format : https://<project-ref>.supabase.co/functions/v1
 */
function getEdgeFunctionsBaseUrl(): string | null {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  if (!supabaseUrl || supabaseUrl.includes('votre-projet')) return null;
  return `${supabaseUrl}/functions/v1`;
}

/**
 * Appelle une Edge Function Supabase de manière sécurisée en incluant
 * le token de session de l'utilisateur connecté pour l'authentification.
 */
async function callEdgeFunction<T>(
  functionName: string,
  body?: Record<string, unknown>
): Promise<T> {
  // Utiliser le client Supabase official si disponible (inclut le token auth auto)
  if (supabase) {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });
    if (error) throw new Error(error.message || `Erreur Edge Function ${functionName}`);
    return data as T;
  }

  // Fallback HTTP direct si le client Supabase n'est pas initialisé
  const baseUrl = getEdgeFunctionsBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'Supabase non configuré. Veuillez définir VITE_SUPABASE_URL dans votre fichier .env.local.'
    );
  }

  const anonKey = (
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    ''
  ).trim();

  const resp = await fetch(`${baseUrl}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.message || json?.error || `HTTP ${resp.status}`);
  }
  return json as T;
}

// ── API publique du service ───────────────────────────────────────────────────

/**
 * Envoie une relance WhatsApp à un client inactif.
 * Appelle la Edge Function `whatsapp-relance`.
 *
 * @param userId   - ID Supabase de l'utilisateur à relancer
 * @param options  - Sujet, message personnalisé, canal de communication
 */
export async function sendWhatsAppRelance(
  userId: string | number,
  options?: {
    subject?: string;
    message?: string;
    channel?: 'whatsapp' | 'email' | 'multichannel';
    force?: boolean;
  }
): Promise<WhatsAppRelanceResult> {
  return callEdgeFunction<WhatsAppRelanceResult>('whatsapp-relance', {
    userId: String(userId),
    ...options,
  });
}

/**
 * Déclenche le scan global des clients inactifs et envoie les relances automatiques.
 * Appelle la Edge Function `whatsapp-relance` sans userId (mode scan global).
 */
export async function triggerInactivityCheck(): Promise<{
  success: boolean;
  message: string;
  newlyInactive: unknown[];
  relancesSent: unknown[];
}> {
  return callEdgeFunction('whatsapp-relance');
}

/**
 * Notifie l'admin WhatsApp d'une nouvelle commande passée sur le site.
 * Appelle la Edge Function `whatsapp-notify`.
 *
 * @param payload - Informations de la commande à notifier
 */
export async function notifyOrderWhatsApp(
  payload: OrderNotifyPayload
): Promise<WhatsAppNotifyResult> {
  return callEdgeFunction<WhatsAppNotifyResult>('whatsapp-notify', payload as unknown as Record<string, unknown>);
}

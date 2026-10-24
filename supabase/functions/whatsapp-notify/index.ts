/**
 * supabase/functions/whatsapp-notify/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Edge Function Supabase — Notification WhatsApp de nouvelles commandes
 *
 * Déclenchement :
 *   POST /functions/v1/whatsapp-notify
 *   body: { orderId, orderNumber, clientName, establishmentName, total, phone?, adminPhone? }
 *
 * Variables d'environnement requises (Supabase → Edge Functions → Secrets) :
 *   WHATSAPP_PHONE_NUMBER_ID         — ID du numéro WhatsApp Business
 *   WHATSAPP_ACCESS_TOKEN            — Token d'accès permanent WhatsApp Business Cloud API
 *   WHATSAPP_ORDER_TEMPLATE_NAME     — Template approuvé pour nouvelles commandes (ex: "nouvelle_commande_b2b")
 *   WHATSAPP_ORDER_TEMPLATE_LANG     — Code langue (ex: "fr")
 *   WHATSAPP_ADMIN_PHONE             — Numéro admin à notifier (format E.164 sans +, ex: 2250709554020)
 *   SUPABASE_URL                     — Auto-injecté
 *   SUPABASE_SERVICE_ROLE_KEY        — Auto-injecté
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderNotifyRequest {
  orderId: string;
  orderNumber?: string;
  clientName?: string;
  establishmentName?: string;
  total?: number;
  currency?: string;
  itemCount?: number;
  /** Numéro WhatsApp du client (optionnel, pour confirmation côté client) */
  clientPhone?: string;
  /** Envoyer aussi une confirmation au client */
  notifyClient?: boolean;
}

interface WhatsAppApiResponse {
  messages?: Array<{ id: string; message_status?: string }>;
  error?: { message: string; type: string; code: number };
}

// ── Constantes ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhoneCI(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('225') && digits.length >= 11) return digits;
  if (digits.length === 10) return `225${digits}`;
  if (digits.length === 8) return `225${digits}`;
  return null;
}

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FCFA';
}

async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  lang: string,
  bodyParams: string[],
  phoneNumberId: string,
  accessToken: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: bodyParams.length > 0
        ? [
            {
              type: 'body',
              parameters: bodyParams.map((p) => ({ type: 'text', text: p })),
            },
          ]
        : [],
    },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data: WhatsAppApiResponse = await resp.json();

    if (!resp.ok || data.error) {
      return {
        success: false,
        error: data.error?.message || `HTTP ${resp.status}`,
      };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur réseau';
    return { success: false, error: message };
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Secrets ────────────────────────────────────────────────────────────────
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const WA_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
  const WA_ORDER_TEMPLATE = Deno.env.get('WHATSAPP_ORDER_TEMPLATE_NAME') || 'nouvelle_commande_b2b';
  const WA_LANG = Deno.env.get('WHATSAPP_ORDER_TEMPLATE_LANG') || 'fr';
  const WA_ADMIN_PHONE = Deno.env.get('WHATSAPP_ADMIN_PHONE') || '2250709554020';

  const waEnabled = Boolean(WA_PHONE_ID && WA_TOKEN);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── Lecture du body ────────────────────────────────────────────────────────
  let payload: OrderNotifyRequest;
  try {
    payload = await req.json() as OrderNotifyRequest;
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Corps de requête JSON invalide' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  if (!payload.orderId) {
    return new Response(
      JSON.stringify({ success: false, message: 'orderId est requis' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // ── Récupération de la commande depuis Supabase si infos manquantes ────────
  let orderNumber = payload.orderNumber;
  let clientName = payload.clientName;
  let establishmentName = payload.establishmentName;
  let total = payload.total ?? 0;
  let currency = payload.currency || 'FCFA';
  let itemCount = payload.itemCount ?? 0;
  let clientPhone = payload.clientPhone;

  if (!orderNumber || !clientName) {
    const { data: order } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total_amount,
        currency,
        status,
        profiles!orders_user_id_fkey(first_name, last_name, phone, establishment_name),
        order_items(id)
      `)
      .eq('id', payload.orderId)
      .single();

    if (order) {
      orderNumber = orderNumber || order.order_number || `CMD-${payload.orderId.slice(0, 8).toUpperCase()}`;
      const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
      clientName = clientName || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Client';
      establishmentName = establishmentName || profile?.establishment_name || 'Établissement';
      total = total || order.total_amount || 0;
      currency = order.currency || currency;
      itemCount = itemCount || (order.order_items?.length ?? 0);
      clientPhone = clientPhone || profile?.phone || null;
    }
  }

  const now = new Date().toISOString();
  const results: {
    admin: { success: boolean; messageId?: string; error?: string };
    client?: { success: boolean; messageId?: string; error?: string };
  } = {
    admin: { success: false },
  };

  // ── Notification admin WhatsApp ────────────────────────────────────────────
  if (waEnabled) {
    const adminParams = [
      orderNumber || 'N/A',
      clientName || 'Client',
      establishmentName || 'Structure',
      formatFCFA(total),
      String(itemCount),
    ];

    results.admin = await sendWhatsAppTemplate(
      WA_ADMIN_PHONE,
      WA_ORDER_TEMPLATE,
      WA_LANG,
      adminParams,
      WA_PHONE_ID,
      WA_TOKEN
    );

    if (!results.admin.success) {
      console.error('[whatsapp-notify] Échec notification admin:', results.admin.error);
    }
  } else {
    console.warn('[whatsapp-notify] WhatsApp non configuré. Notification admin non envoyée.');
    results.admin = { success: false, error: 'WhatsApp non configuré' };
  }

  // ── Confirmation client WhatsApp (optionnel) ───────────────────────────────
  if (waEnabled && payload.notifyClient && clientPhone) {
    const normalizedClientPhone = normalizePhoneCI(clientPhone);
    if (normalizedClientPhone) {
      const confirmTemplate = Deno.env.get('WHATSAPP_CONFIRM_TEMPLATE_NAME') || 'confirmation_commande_client';
      const clientParams = [
        clientName || 'Client',
        orderNumber || 'N/A',
        String(itemCount),
        formatFCFA(total),
      ];

      results.client = await sendWhatsAppTemplate(
        normalizedClientPhone,
        confirmTemplate,
        WA_LANG,
        clientParams,
        WA_PHONE_ID,
        WA_TOKEN
      );

      if (!results.client.success) {
        console.error('[whatsapp-notify] Échec confirmation client:', results.client.error);
      }
    }
  }

  // ── Log de l'événement dans order_status_history ──────────────────────────
  await supabase.from('order_status_history').insert({
    order_id: payload.orderId,
    status: 'notification_whatsapp',
    note: results.admin.success
      ? `Notification WhatsApp admin envoyée (ID: ${results.admin.messageId})`
      : `Notification WhatsApp admin échouée : ${results.admin.error || 'non configurée'}`,
    changed_at: now,
  });

  return new Response(
    JSON.stringify({
      success: results.admin.success || Boolean(results.client?.success),
      message: results.admin.success
        ? `Notification WhatsApp envoyée à l'admin pour la commande ${orderNumber}`
        : `Notification WhatsApp non envoyée (${results.admin.error || 'WhatsApp non configuré'})`,
      orderId: payload.orderId,
      orderNumber,
      adminNotified: results.admin.success,
      clientNotified: results.client?.success ?? false,
      adminMessageId: results.admin.messageId || null,
      waEnabled,
    }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
});

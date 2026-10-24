/**
 * supabase/functions/whatsapp-relance/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Edge Function Supabase — Relances WhatsApp Business Cloud API
 *
 * Déclenchement possible par :
 *   1. POST /functions/v1/whatsapp-relance
 *      body: { userId, channel, subject, message }
 *   2. Cron job Supabase (pg_cron) → POST sans body → vérifie tous les clients inactifs
 *
 * Variables d'environnement requises (Supabase → Edge Functions → Secrets) :
 *   WHATSAPP_PHONE_NUMBER_ID   — ID du numéro WhatsApp Business
 *   WHATSAPP_ACCESS_TOKEN      — Token d'accès permanent WhatsApp Business Cloud API
 *   WHATSAPP_TEMPLATE_NAME     — Nom du modèle de message approuvé (ex: "relance_b2b")
 *   WHATSAPP_TEMPLATE_LANG     — Code langue du modèle (ex: "fr")
 *   SUPABASE_URL               — Automatiquement injecté par Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  — Automatiquement injecté par Supabase
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RelanceRequest {
  userId?: string;
  channel?: 'whatsapp' | 'email' | 'multichannel';
  subject?: string;
  message?: string;
  /** Si true, force la relance même si le client a déjà été relancé récemment */
  force?: boolean;
}

interface WhatsAppApiResponse {
  messages?: Array<{ id: string; message_status?: string }>;
  error?: { message: string; type: string; code: number };
}

// ── Constantes ────────────────────────────────────────────────────────────────

const INACTIVITY_THRESHOLD_DAYS = 60;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise un numéro de téléphone ivoirien au format E.164 international.
 * Exemples : "07 09 55 40 20" → "2250709554020"
 *            "+225 07 09 55 40 20" → "2250709554020"
 */
function normalizePhoneCI(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('225') && digits.length >= 11) return digits;
  if (digits.length === 10) return `225${digits}`;
  if (digits.length === 8) return `225${digits}`;
  return null;
}

/**
 * Envoie un message WhatsApp via l'API Cloud Business.
 * Utilise le template approuvé si disponible, sinon tente un message freeform
 * (uniquement possible dans la fenêtre 24h après le dernier message du client).
 */
async function sendWhatsAppMessage(
  toPhone: string,
  templateName: string,
  templateLang: string,
  templateParams: string[],
  phoneNumberId: string,
  accessToken: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: templateParams.length > 0
        ? [
            {
              type: 'body',
              parameters: templateParams.map((p) => ({ type: 'text', text: p })),
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

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur réseau WhatsApp API';
    return { success: false, error: message };
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Récupération des secrets Supabase (auto-injectés) ──────────────────────
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const WA_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
  const WA_TEMPLATE = Deno.env.get('WHATSAPP_TEMPLATE_NAME') || 'relance_b2b';
  const WA_LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'fr';

  const waEnabled = Boolean(WA_PHONE_ID && WA_TOKEN);

  // Client admin (service_role) — ne jamais exposer au frontend
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── Lecture du body ────────────────────────────────────────────────────────
  let payload: RelanceRequest = {};
  try {
    const text = await req.text();
    if (text) payload = JSON.parse(text) as RelanceRequest;
  } catch {
    // body vide → mode scan global
  }

  const isSingleUser = Boolean(payload.userId);

  // ── Mode 1 : relance d'un client spécifique ────────────────────────────────
  if (isSingleUser) {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, phone, establishment_name, commune, status, last_order_at, relance_count, last_relance_at')
      .eq('id', payload.userId!)
      .single();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ success: false, message: 'Utilisateur introuvable' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const clientName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
    const phone = normalizePhoneCI(profile.phone || '');
    const daysInactive = profile.last_order_at
      ? Math.floor((Date.now() - new Date(profile.last_order_at).getTime()) / 86_400_000)
      : null;

    const subject = payload.subject || `Reprise de vos approvisionnements — CYM Pharma`;
    const message = payload.message || `Bonjour ${clientName}, nous constatons que vous n'avez pas commandé depuis ${daysInactive ?? 'plus de 60'} jours. Nos stocks sont renouvelés. Contactez-nous : +225 07 09 55 40 20.`;
    const channel = payload.channel || 'multichannel';

    let waStatus: 'sent' | 'failed' | 'pending' = 'pending';
    let waMessageId: string | undefined;
    const whatsappDirectUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : undefined;

    // ── Envoi WhatsApp réel ──────────────────────────────────────────────────
    if (waEnabled && phone && (channel === 'whatsapp' || channel === 'multichannel')) {
      const templateParams = [
        clientName,
        profile.establishment_name || 'votre établissement',
        String(daysInactive ?? '60+'),
        '+225 07 09 55 40 20',
      ];

      const waResult = await sendWhatsAppMessage(
        phone,
        WA_TEMPLATE,
        WA_LANG,
        templateParams,
        WA_PHONE_ID,
        WA_TOKEN
      );

      waStatus = waResult.success ? 'sent' : 'failed';
      waMessageId = waResult.messageId;

      if (!waResult.success) {
        console.error('[whatsapp-relance] Échec WhatsApp API:', waResult.error);
      }
    } else if (!waEnabled) {
      // WhatsApp non configuré → on enregistre tout de même l'intention
      console.warn('[whatsapp-relance] WhatsApp non configuré. Enregistrement de la relance sans envoi réel.');
      waStatus = 'pending';
    }

    // ── Insertion du log de relance ──────────────────────────────────────────
    const now = new Date().toISOString();
    const { data: logData, error: logErr } = await supabase
      .from('relance_logs')
      .insert({
        user_id: profile.id,
        user_name: clientName,
        establishment_name: profile.establishment_name || null,
        recipient_email: profile.email,
        recipient_phone: profile.phone || null,
        channel,
        subject,
        message,
        trigger_reason: daysInactive
          ? `Inactif depuis ${daysInactive} jours (seuil : ${INACTIVITY_THRESHOLD_DAYS}j)`
          : 'Relance manuelle admin',
        days_since_last_order: daysInactive,
        status: waStatus,
        whatsapp_message_id: waMessageId || null,
        whatsapp_direct_url: whatsappDirectUrl || null,
        sent_at: waStatus === 'sent' ? now : null,
        created_at: now,
      })
      .select()
      .single();

    if (logErr) {
      console.error('[whatsapp-relance] Erreur insertion log:', logErr);
    }

    // ── Mise à jour du profil client ─────────────────────────────────────────
    if (waStatus !== 'failed') {
      await supabase
        .from('profiles')
        .update({
          last_relance_at: now,
          last_relance_channel: channel,
          last_relance_status: waStatus,
          relance_count: (profile.relance_count || 0) + 1,
          status: 'inactive',
          updated_at: now,
        })
        .eq('id', profile.id);
    }

    const relanceLog = {
      id: logData?.id || crypto.randomUUID(),
      userId: profile.id,
      userName: clientName,
      establishmentName: profile.establishment_name || '',
      recipientEmail: profile.email,
      recipientPhone: profile.phone || null,
      channel,
      triggerReason: `Inactif depuis ${daysInactive ?? '?'} jours`,
      daysSinceLastOrder: daysInactive,
      subject,
      message,
      status: waStatus,
      sent_at: now,
      whatsappDirectUrl: whatsappDirectUrl || null,
    };

    return new Response(
      JSON.stringify({
        success: waStatus !== 'failed',
        message: waStatus === 'sent'
          ? `Relance WhatsApp envoyée à ${clientName} (${profile.phone})`
          : waEnabled
            ? `Échec WhatsApp. Lien direct généré.`
            : 'WhatsApp non configuré — relance enregistrée sans envoi réel.',
        relance: relanceLog,
        user: {
          ...profile,
          last_relance_at: now,
          last_relance_status: waStatus,
          relance_count: (profile.relance_count || 0) + 1,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // ── Mode 2 : scan global des clients inactifs (cron ou appel sans userId) ──
  const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_DAYS * 86_400_000).toISOString();

  const { data: inactiveProfiles, error: scanErr } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, phone, establishment_name, commune, status, last_order_at, last_relance_at, relance_count')
    .eq('role', 'client')
    .or(`last_order_at.lt.${cutoff},last_order_at.is.null`)
    .order('last_order_at', { ascending: true, nullsFirst: true });

  if (scanErr) {
    return new Response(
      JSON.stringify({ success: false, message: 'Erreur lors du scan des inactifs', error: scanErr }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const newlyInactive: Record<string, unknown>[] = [];
  const relancesSent: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const profile of inactiveProfiles || []) {
    const daysInactive = profile.last_order_at
      ? Math.floor((Date.now() - new Date(profile.last_order_at).getTime()) / 86_400_000)
      : INACTIVITY_THRESHOLD_DAYS + 1;

    // Ne pas relancer si déjà relancé dans les 30 derniers jours
    if (profile.last_relance_at) {
      const daysSinceRelance = Math.floor(
        (Date.now() - new Date(profile.last_relance_at).getTime()) / 86_400_000
      );
      if (daysSinceRelance < 30) continue;
    }

    // Marquer comme inactif si ce n'est pas encore fait
    if (profile.status !== 'inactive') {
      await supabase
        .from('profiles')
        .update({ status: 'inactive', updated_at: now })
        .eq('id', profile.id);
      newlyInactive.push(profile);
    }

    const clientName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
    const phone = normalizePhoneCI(profile.phone || '');
    const message = `Bonjour ${clientName}, l'équipe CYM Pharma constate que ${profile.establishment_name || 'votre établissement'} n'a pas commandé depuis ${daysInactive} jours. Nos stocks de consommables médicaux certifiés CE sont disponibles. Commandez maintenant : +225 07 09 55 40 20.`;

    let waStatus: 'sent' | 'failed' | 'pending' = 'pending';
    let waMessageId: string | undefined;
    const whatsappDirectUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : undefined;

    if (waEnabled && phone) {
      const waResult = await sendWhatsAppMessage(
        phone,
        WA_TEMPLATE,
        WA_LANG,
        [clientName, profile.establishment_name || 'votre établissement', String(daysInactive), '+225 07 09 55 40 20'],
        WA_PHONE_ID,
        WA_TOKEN
      );
      waStatus = waResult.success ? 'sent' : 'failed';
      waMessageId = waResult.messageId;
    }

    const { data: log } = await supabase
      .from('relance_logs')
      .insert({
        user_id: profile.id,
        user_name: clientName,
        establishment_name: profile.establishment_name || null,
        recipient_email: profile.email,
        recipient_phone: profile.phone || null,
        channel: 'whatsapp',
        subject: 'Relance automatique — Inactivité détectée',
        message,
        trigger_reason: `Auto-détection : inactif depuis ${daysInactive} jours`,
        days_since_last_order: daysInactive,
        status: waStatus,
        whatsapp_message_id: waMessageId || null,
        whatsapp_direct_url: whatsappDirectUrl || null,
        sent_at: waStatus === 'sent' ? now : null,
        created_at: now,
      })
      .select()
      .single();

    if (waStatus !== 'failed') {
      await supabase
        .from('profiles')
        .update({
          last_relance_at: now,
          last_relance_channel: 'whatsapp',
          last_relance_status: waStatus,
          relance_count: (profile.relance_count || 0) + 1,
          updated_at: now,
        })
        .eq('id', profile.id);
    }

    relancesSent.push({
      id: log?.id || crypto.randomUUID(),
      userId: profile.id,
      userName: clientName,
      status: waStatus,
      sent_at: now,
      whatsappDirectUrl: whatsappDirectUrl || null,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Scan terminé : ${newlyInactive.length} nouveau(x) inactif(s), ${relancesSent.filter((r) => (r as any).status === 'sent').length} relance(s) WhatsApp envoyée(s).`,
      newlyInactive,
      relancesSent,
    }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
});

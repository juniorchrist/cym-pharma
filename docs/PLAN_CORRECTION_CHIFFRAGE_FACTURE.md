# PLAN DE CORRECTION — CHIFFRAGE, FACTURE, ACTUALISATION

**Version** : 1.0  
**Date** : 02/11/2026  
**Référence** : DIAGNOSTIC_CHIFFRAGE_FACTURE_02-11-2026.md

---

## PROBLÈME 1 — CHIFFRAGE ENREGISTRE UN STATUT MAIS PAS LES PRIX

### Cause racine prouvée

**L'API écrit dans des colonnes qui n'existent pas** : `quoted_at`, `quoted_by`, `subtotal_ht`, `total_amount`, `discount_amount`, `vat_amount` sont utilisées dans `api/index.php:390` mais **absentes** des schémas MySQL et PostgreSQL v2.0.

**Preuve** :
```php
// api/index.php ligne 390
$updOrder = $pdo->prepare("UPDATE orders SET 
  status = 'quoted', 
  total = :total, 
  subtotal = :subtotal, 
  subtotal_ht = :subtotal_ht,      -- ❌ COLONNE INEXISTANTE
  total_amount = :total_amount,     -- ❌ COLONNE INEXISTANTE
  discount_amount = 0.00,           -- ❌ COLONNE INEXISTANTE
  vat_amount = 0.00,                -- ❌ COLONNE INEXISTANTE
  quoted_at = NOW(),                -- ❌ COLONNE INEXISTANTE
  priced_at = NOW(), 
  quoted_by = :quoted_by,           -- ❌ COLONNE INEXISTANTE
  ...
WHERE id = :oid");
```

**Résultat** : La requête échoue silencieusement (erreur SQL non tracée), le statut peut être mis à jour mais les prix ne sont jamais écrits.

---

### Corrections à apporter

#### 1.1 Créer les migrations SQL

**Fichiers à créer** :
- `database/mysql/migrations/003_add_quote_columns.sql`
- `database/postgres/migrations/003_add_quote_columns.sql`

**Contenu** : Voir DIAGNOSTIC_CHIFFRAGE_FACTURE_02-11-2026.md section "MIGRATIONS REQUISES"

**Actions** :
```bash
# MySQL (InfinityFree production)
mysql -u <user> -p <database> < database/mysql/migrations/003_add_quote_columns.sql

# PostgreSQL (Supabase test)
psql -U <user> -d <database> -f database/postgres/migrations/003_add_quote_columns.sql
```

#### 1.2 Ajouter des logs de débogage dans l'API

**Fichier** : `api/index.php`  
**Lignes** : 326-440 (bloc de chiffrage)

```php
// Après validation des items (ligne ~360)
error_log("=== CHIFFRAGE DEBUG ===");
error_log("Order ID: $orderId");
error_log("Admin ID: $adminId");
error_log("Validated items: " . json_encode($validatedItems));
error_log("Total calculé: $total");

// Après chaque UPDATE order_items (ligne ~382)
$rowsAffected = $updItem->rowCount();
error_log("UPDATE order_items: $rowsAffected lignes modifiées pour iid={$it['iid']}");
if ($rowsAffected === 0) {
    error_log("ATTENTION: Aucune ligne modifiée pour orderItemId={$it['iid']}");
}

// Après UPDATE orders (ligne ~399)
$rowsAffected = $updOrder->rowCount();
error_log("UPDATE orders: $rowsAffected commandes modifiées");
if ($rowsAffected === 0) {
    error_log("ERREUR: La commande $orderId n'a pas été mise à jour");
}
```

**Activer les logs** :
- `api/config/env.php` : `'debug' => true`
- Consulter : `/tmp/php_error.log` ou dans le panel d'hébergement

#### 1.3 Créer une fonction de normalisation `mapOrder()`

**Fichier** : `api/helpers/orderMapper.php` (nouveau)

```php
<?php
/**
 * api/helpers/orderMapper.php
 * Normalisation des données de commande : snake_case → camelCase
 */

declare(strict_types=1);

/**
 * Convertit une commande de la base (snake_case) vers le format API (camelCase)
 * @param array $row Ligne de base de données
 * @return array Commande normalisée
 */
function mapOrder(array $row): array {
    return [
        'id'                => $row['id'] ?? null,
        'orderNumber'       => $row['order_number'] ?? null,
        'userId'            => $row['user_id'] ?? null,
        'establishmentName' => $row['establishment_name'] ?? null,
        'shippingAddress'   => $row['shipping_address'] ?? null,
        'shippingCity'      => $row['shipping_city'] ?? null,
        'status'            => $row['status'] ?? 'pending_quote',
        'notes'             => $row['notes'] ?? null,
        
        // Montants en entiers FCFA
        'subtotal'          => isset($row['subtotal']) ? (int)round((float)$row['subtotal']) : null,
        'subtotalHt'        => isset($row['subtotal_ht']) ? (int)round((float)$row['subtotal_ht']) : null,
        'total'             => isset($row['total']) ? (int)round((float)$row['total']) : null,
        'totalAmount'       => isset($row['total_amount']) ? (int)round((float)$row['total_amount']) : null,
        'discountAmount'    => isset($row['discount_amount']) ? (int)round((float)$row['discount_amount']) : 0,
        'vatAmount'         => isset($row['vat_amount']) ? (int)round((float)$row['vat_amount']) : 0,
        
        'currency'          => $row['currency'] ?? 'FCFA',
        'invoiceNumber'     => $row['invoice_number'] ?? null,
        'invoiceDate'       => $row['invoice_date'] ?? null,
        'pricedAt'          => $row['priced_at'] ?? null,
        'quotedAt'          => $row['quoted_at'] ?? null,
        'quotedBy'          => $row['quoted_by'] ?? null,
        'shippedAt'         => $row['shipped_at'] ?? null,
        'deliveredAt'       => $row['delivered_at'] ?? null,
        'cancelledAt'       => $row['cancelled_at'] ?? null,
        'cancelReason'      => $row['cancel_reason'] ?? null,
        'createdAt'         => $row['created_at'] ?? null,
        'updatedAt'         => $row['updated_at'] ?? null,
    ];
}

/**
 * Convertit une ligne de commande de la base vers le format API
 * @param array $row Ligne de base de données
 * @return array Ligne normalisée
 */
function mapOrderItem(array $row): array {
    return [
        'id'         => $row['id'] ?? null,
        'orderId'    => $row['order_id'] ?? null,
        'productId'  => $row['product_id'] ?? null,
        'reference'  => $row['reference'] ?? null,
        'name'       => $row['name'] ?? '',
        'unit'       => $row['unit'] ?? 'Unité',
        'quantity'   => isset($row['quantity']) ? (int)$row['quantity'] : 1,
        'unitPrice'  => isset($row['unit_price']) ? (int)round((float)$row['unit_price']) : null,
        'lineTotal'  => isset($row['line_total']) ? (int)round((float)$row['line_total']) : null,
        'currency'   => $row['currency'] ?? 'FCFA',
        'createdAt'  => $row['created_at'] ?? null,
    ];
}

/**
 * Valide qu'une commande a bien un montant valide
 * @param array $order Commande normalisée
 * @return bool
 */
function orderHasValidAmount(array $order): bool {
    return isset($order['totalAmount']) 
        && is_numeric($order['totalAmount']) 
        && (int)$order['totalAmount'] > 0;
}
```

**Intégration dans l'API** :

```php
// api/index.php (en haut)
require_once __DIR__ . '/helpers/orderMapper.php';

// Après la lecture d'une commande (ex: ligne ~450)
$order = $stmt->fetch();
if (!$order) {
    json_error("Commande introuvable.", 404);
}
$order = mapOrder($order); // ← Normalisation

// Pour les listes
$orders = $stmt->fetchAll();
$orders = array_map('mapOrder', $orders);
```

#### 1.4 Validation stricte côté serveur

**Fichier** : `api/index.php` ligne 340-362 (déjà présent)

✅ **Déjà implémenté** : La validation refuse les prix négatifs ou non numériques.

**À ajouter** : Refus si tous les prix sont à 0 (sauf pour le brouillon)

```php
// Ligne 360 (déjà présent)
if (!$isDraft && !$hasPositive) {
    json_error("Le chiffrage doit comporter au moins un article avec un montant supérieur à 0 FCFA.", 422);
}
```

#### 1.5 Relecture des données après écriture

**Fichier** : `api/index.php` ligne 427-435

✅ **Déjà implémenté** : L'API renvoie la commande après l'avoir relue.

```php
// Ligne 415 (après commit)
$stmt = $pdo->prepare("SELECT * FROM orders WHERE id = :oid");
$stmt->execute([':oid' => $orderId]);
$orderRow = $stmt->fetch();
$orderRow = mapOrder($orderRow); // ← À ajouter

json_response([
    'success' => true,
    'message' => '...',
    'data'    => [
        'order' => $orderRow, // ← Le frontend doit utiliser CECI, pas ses valeurs locales
        ...
    ],
]);
```

**Côté frontend** : Le composant de chiffrage doit afficher `response.data.order`, pas les valeurs saisies.

#### 1.6 Gestion des commandes chiffrées sans prix

**Fichier** : `database/migrations/004_fix_quoted_without_amount.sql`

```sql
-- Rapport : Commandes marquées chiffrées sans montant
SELECT 
  id, 
  order_number, 
  status, 
  COALESCE(total, 0) AS total,
  COALESCE(total_amount, 0) AS total_amount,
  priced_at,
  quoted_at,
  created_at
FROM orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL)
ORDER BY created_at DESC;

-- ⚠ NE PAS EXÉCUTER SANS ACCORD
-- Correction : repasser en pending_quote
-- UPDATE orders
-- SET 
--   status = 'pending_quote',
--   priced_at = NULL,
--   quoted_at = NULL,
--   quoted_by = NULL,
--   invoice_number = NULL,
--   invoice_date = NULL,
--   updated_at = NOW()
-- WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
--   AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);
```

**Procédure** :
1. Exécuter la requête SELECT et enregistrer le résultat
2. Partager la liste avec le gérant
3. Après accord, décommenter et exécuter l'UPDATE

---

### Critères de réussite Problème 1

- [ ] Les migrations sont exécutées sur MySQL et PostgreSQL
- [ ] Un admin saisit les prix d'une commande et enregistre
- [ ] La carte admin affiche le montant exact (plus "À chiffrer")
- [ ] Le client voit le même montant sur son tableau de bord
- [ ] La facture affiche prix unitaire, total ligne et NET À PAYER corrects
- [ ] Une tentative de chiffrage sans prix valide est refusée avec HTTP 422
- [ ] Le statut reste `pending_quote` tant que le chiffrage n'est pas validé
- [ ] Les logs de débogage confirment que les requêtes UPDATE affectent bien les lignes

---

## PROBLÈME 2 — IL FAUT RAFRAÎCHIR LA PAGE À LA MAIN POUR VOIR LES CHANGEMENTS

### Cause racine prouvée

**Aucun mécanisme de rechargement automatique** : Pas de hook React avec intervalle détecté, pas de `BroadcastChannel`, pas de synchronisation entre onglets.

---

### Corrections à apporter

#### 2.1 Créer le hook `useLiveResource()`

**Fichier** : `src/hooks/useLiveResource.ts` (nouveau)

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';

interface UseLiveResourceOptions<T> {
  /** Clé unique de la ressource (pour le cache et la diffusion) */
  key: string;
  /** Fonction de chargement qui retourne une promesse */
  loader: () => Promise<T>;
  /** Intervalle de rechargement en millisecondes (0 = pas de polling) */
  interval?: number;
  /** Activer le rechargement au retour sur l'onglet */
  reloadOnFocus?: boolean;
  /** Activer le rechargement au retour du réseau */
  reloadOnOnline?: boolean;
  /** Activer la synchronisation inter-onglets */
  syncTabs?: boolean;
}

interface UseLiveResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
  lastUpdate: Date | null;
}

/**
 * Hook React pour charger et maintenir à jour une ressource distante
 * 
 * Fonctionnalités :
 * - Rechargement périodique (configurable)
 * - Rechargement au retour sur l'onglet (visibilitychange)
 * - Rechargement au retour du réseau (online)
 * - Suspension du polling quand l'onglet est caché
 * - Annulation des requêtes en vol (AbortController)
 * - Dédoublonnage des requêtes simultanées
 * - Recul progressif en cas d'erreur
 * - Synchronisation inter-onglets (BroadcastChannel)
 */
export function useLiveResource<T>({
  key,
  loader,
  interval = 0,
  reloadOnFocus = true,
  reloadOnOnline = true,
  syncTabs = true,
}: UseLiveResourceOptions<T>): UseLiveResourceResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const errorCountRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const load = useCallback(async () => {
    // Dédoublonnage : ne pas lancer si un chargement est en cours
    if (loadingRef.current) return;

    // Annuler la requête précédente si elle existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    loadingRef.current = true;
    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const result = await loader();
      setData(result);
      setLastUpdate(new Date());
      errorCountRef.current = 0; // Reset du compteur d'erreurs

      // Diffuser le changement aux autres onglets
      if (syncTabs && channelRef.current) {
        channelRef.current.postMessage({ type: 'reload', key });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Requête annulée, ne pas traiter comme une erreur
        return;
      }
      console.error(`[useLiveResource] Error loading ${key}:`, err);
      setError(err as Error);
      errorCountRef.current += 1;
    } finally {
      loadingRef.current = false;
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [key, loader, syncTabs]);

  // Chargement initial
  useEffect(() => {
    load();
  }, [load]);

  // Polling périodique (avec suspension si onglet caché)
  useEffect(() => {
    if (interval <= 0) return;

    const tick = () => {
      // Recul progressif en cas d'erreurs répétées
      const backoff = Math.min(errorCountRef.current * 5000, 60000);
      if (document.visibilityState === 'visible') {
        load();
      }
      return interval + backoff;
    };

    const timer = setInterval(() => {
      const nextInterval = tick();
      if (nextInterval !== interval) {
        clearInterval(timer);
        setInterval(tick, nextInterval);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [interval, load]);

  // Rechargement au retour sur l'onglet
  useEffect(() => {
    if (!reloadOnFocus) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        load();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadOnFocus, load]);

  // Rechargement au retour du réseau
  useEffect(() => {
    if (!reloadOnOnline) return;

    const handleOnline = () => load();

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [reloadOnOnline, load]);

  // Synchronisation inter-onglets via BroadcastChannel
  useEffect(() => {
    if (!syncTabs) return;

    try {
      const channel = new BroadcastChannel(`cym_resource_${key}`);
      channelRef.current = channel;

      channel.onmessage = (event) => {
        if (event.data.type === 'reload' && event.data.key === key) {
          load();
        }
      };

      return () => {
        channel.close();
        channelRef.current = null;
      };
    } catch (err) {
      console.warn('[useLiveResource] BroadcastChannel not supported, falling back to storage events');

      // Repli sur storage events (moins fiable)
      const handleStorage = (e: StorageEvent) => {
        if (e.key === `cym_reload_${key}`) {
          load();
        }
      };

      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
    }
  }, [key, syncTabs, load]);

  return {
    data,
    loading,
    error,
    reload: load,
    lastUpdate,
  };
}
```

#### 2.2 Créer la route de synchronisation légère

**Fichier** : `api/index.php` (nouvelle route)

```php
// GET /api/sync/state — Retourne l'état de synchronisation d'une ressource
if ($path === '/sync/state' && $method === 'GET') {
    $resource = $_GET['resource'] ?? '';
    $since = $_GET['since'] ?? null;

    if ($resource === 'orders') {
        try {
            // Pour un client authentifié
            $user = require_auth($jwtSecret);
            $userId = $user['sub'] ?? null;

            if ($user['role'] === 'admin') {
                // Admin : toutes les commandes
                $stmt = $pdo->query("SELECT MAX(updated_at) AS last_update, COUNT(*) AS total FROM orders");
            } else {
                // Client : ses commandes uniquement
                $stmt = $pdo->prepare("SELECT MAX(updated_at) AS last_update, COUNT(*) AS total FROM orders WHERE user_id = :uid");
                $stmt->execute([':uid' => $userId]);
            }

            $result = $stmt->fetch();
            $lastUpdate = $result['last_update'] ?? null;
            $count = (int)($result['total'] ?? 0);

            $hasChanges = true;
            if ($since && $lastUpdate) {
                $hasChanges = strtotime($lastUpdate) > strtotime($since);
            }

            json_response([
                'success' => true,
                'data' => [
                    'resource' => 'orders',
                    'lastUpdate' => $lastUpdate,
                    'count' => $count,
                    'hasChanges' => $hasChanges,
                ],
            ]);
        } catch (Exception $e) {
            json_error("Erreur lors de la vérification de l'état.", 500);
        }
    } else {
        json_error("Ressource non supportée.", 400);
    }
}
```

#### 2.3 Utiliser `useLiveResource()` dans les composants

**Exemple : Liste des commandes admin**

```typescript
// src/pages/AdminOrdersList.tsx
import { useLiveResource } from '../hooks/useLiveResource';
import { Orders } from '../services/api';

export function AdminOrdersList() {
  const { data: orders, loading, error, lastUpdate } = useLiveResource({
    key: 'admin_orders',
    loader: () => Orders.listAdmin(),
    interval: 15000, // 15 secondes pour l'admin
    reloadOnFocus: true,
    syncTabs: true,
  });

  if (loading && !orders) return <div>Chargement...</div>;
  if (error) return <div>Erreur : {error.message}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2>Commandes récentes</h2>
        {lastUpdate && (
          <span className="text-sm text-gray-500">
            Mis à jour à {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>
      <ul>
        {orders?.map(order => (
          <li key={order.id}>{order.orderNumber} — {order.status}</li>
        ))}
      </ul>
    </div>
  );
}
```

**Exemple : Tableau de bord client**

```typescript
// src/pages/ClientDashboard.tsx
import { useLiveResource } from '../hooks/useLiveResource';
import { Orders } from '../services/api';

export function ClientDashboard() {
  const { data: orders, loading, lastUpdate, reload } = useLiveResource({
    key: 'client_orders',
    loader: () => Orders.listClient(),
    interval: 20000, // 20 secondes pour le client
    reloadOnFocus: true,
    syncTabs: true,
  });

  const hasPendingOrders = orders?.some(o => 
    ['pending_quote', 'quoted', 'in_preparation', 'shipped'].includes(o.status)
  );

  // Ajuster la fréquence selon l'état
  useEffect(() => {
    // Si aucune commande en cours, ralentir à 60s
    // (à implémenter : dynamicInterval dans le hook)
  }, [hasPendingOrders]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2>Mes commandes</h2>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Mis à jour à {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button onClick={reload} className="btn-sm">
            Actualiser
          </button>
        </div>
      </div>
      <ul>
        {orders?.map(order => (
          <li key={order.id}>{order.orderNumber} — {order.status}</li>
        ))}
      </ul>
    </div>
  );
}
```

#### 2.4 Diffusion après les actions serveur

**Fichier** : `api/index.php` (après chaque action)

```php
// Après un chiffrage (ligne ~435)
json_response([
    'success' => true,
    'message' => '...',
    'data' => [...],
    'broadcast' => 'orders', // ← Signal pour le frontend
]);

// Le frontend écoute ce signal et recharge les ressources concernées
```

**Frontend** : Après une action réussie, diffuser immédiatement

```typescript
// src/services/api.ts
async function validateQuote(orderId: string, items: QuoteItem[]) {
  const response = await fetch(`/api/admin/orders/${orderId}/validate-pricing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  });

  const result = await response.json();

  if (result.success && result.broadcast) {
    // Diffuser aux autres onglets
    const channel = new BroadcastChannel(`cym_resource_${result.broadcast}`);
    channel.postMessage({ type: 'reload', key: result.broadcast });
    channel.close();
  }

  return result;
}
```

#### 2.5 Vérifier les en-têtes Cache-Control en production

**Test sur InfinityFree** :

```bash
curl -I https://cympharma.infinityfreeapp.com/api/orders

# Vérifier la présence de :
# Cache-Control: no-store, no-cache, must-revalidate, max-age=0
# Pragma: no-cache
```

**Si les en-têtes sont absents** : Vérifier la configuration du serveur Apache ou ajouter dans `.htaccess` :

```apache
<IfModule mod_headers.c>
  <FilesMatch "\.(php|json)$">
    Header set Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>
</IfModule>
```

---

### Critères de réussite Problème 2

- [ ] Le client crée une commande → elle apparaît chez l'admin en ≤ 15s sans F5
- [ ] L'admin chiffre → le client voit "Chiffrée" et le montant en ≤ 20s sans F5
- [ ] L'admin change un statut → le client le voit en ≤ 20s sans F5
- [ ] Onglet caché → aucune requête périodique (vérifiable dans Network DevTools)
- [ ] Retour sur l'onglet → rechargement immédiat visible
- [ ] Données jamais servies depuis un cache périmé après rechargement
- [ ] La mention "Mis à jour à HH:MM" s'affiche et se rafraîchit
- [ ] Le bouton d'actualisation manuelle fonctionne instantanément

---

## PROBLÈME 3 — FACTURE : MENTIONS INVENTÉES ET DOCUMENT ÉMIS TROP TÔT

### Cause racine prouvée

1. **Mentions légales en dur** : Possibilité de valeurs fictives dans `api/config/company.php` ou dans le composant de facture
2. **Facture accessible avant chiffrage** : Condition insuffisante ligne 452 de `api/index.php`
3. **Lecture de sessionStorage** : `cym_bl_current_order` utilisé pour le bon de livraison, peut contaminer la facture

---

### Corrections à apporter

#### 3.1 Audit et nettoyage de company.php

**Fichier** : `api/config/company.php`

**Action** : Vérifier et vider tous les champs non validés

```php
<?php
/**
 * api/config/company.php
 * Configuration légale, fiscale et commerciale de l'entreprise CYM Pharma.
 * 
 * RÈGLE : Si un champ est vide, la mention NE DOIT PAS apparaître sur les documents.
 */

return [
    // Raison sociale officielle
    'company_name'    => 'CYM Pharma',
    'trade_name'      => 'CYM Pharma Côte d\'Ivoire',
    'tagline'         => '', // ⚠ À VALIDER

    // Coordonnées
    'address'         => '', // ⚠ À RENSEIGNER (ex: "Cocody Riviera 3, Abidjan")
    'city'            => 'Abidjan',
    'country'         => 'Côte d\'Ivoire',
    'phone'           => '', // ⚠ À RENSEIGNER
    'email'           => '', // ⚠ À RENSEIGNER
    'website'         => 'https://www.cympharma.ci',

    // Identifiants légaux (À REMPLIR PAR LE COMPTABLE)
    'rccm'            => '', // ⚠ Numéro RCCM officiel UNIQUEMENT
    'cc'              => '', // ⚠ Compte Contribuable officiel UNIQUEMENT
    'vat_regime'      => '', // ⚠ Mention TVA exacte (à confirmer avec le comptable)
    'vat_rate'        => null, // ⚠ Taux TVA (ex: 0.18 ou 0) ou null

    // Conditions commerciales
    'payment_terms'   => 'À réception de facture',
    'bank_name'       => '', // ⚠ À RENSEIGNER si nécessaire
    'bank_iban'       => '',
    'bank_rib'        => '',

    // Mentions de bas de page
    'footer_legal'    => '',
    'footer_warranty' => '',
];
```

#### 3.2 Fonction d'affichage conditionnel des mentions

**Fichier** : `api/helpers/invoiceHelper.php` (nouveau)

```php
<?php
/**
 * api/helpers/invoiceHelper.php
 * Génération de factures et documents officiels
 */

declare(strict_types=1);

/**
 * Retourne une mention légale seulement si le champ est renseigné
 * @param string|null $value Valeur du champ
 * @param string $label Libellé à afficher
 * @return string Ligne formatée ou chaîne vide
 */
function mention(string|null $value, string $label): string {
    if (empty(trim((string)$value))) {
        return '';
    }
    return sprintf("%s : %s\n", $label, trim($value));
}

/**
 * Génère le bloc d'en-tête entreprise pour une facture
 * @param array $company Configuration entreprise (api/config/company.php)
 * @return array Lignes d'en-tête
 */
function companyHeader(array $company): array {
    $lines = [];
    
    if (!empty($company['company_name'])) {
        $lines[] = $company['company_name'];
    }
    if (!empty($company['tagline'])) {
        $lines[] = $company['tagline'];
    }
    if (!empty($company['address'])) {
        $lines[] = $company['address'];
    }
    if (!empty($company['city']) && !empty($company['country'])) {
        $lines[] = $company['city'] . ', ' . $company['country'];
    }
    if (!empty($company['phone'])) {
        $lines[] = 'Tél : ' . $company['phone'];
    }
    if (!empty($company['email'])) {
        $lines[] = 'Email : ' . $company['email'];
    }
    if (!empty($company['website'])) {
        $lines[] = 'Site : ' . $company['website'];
    }
    
    return $lines;
}

/**
 * Génère le bloc des identifiants légaux
 * @param array $company Configuration entreprise
 * @return array Lignes de mentions légales
 */
function legalMentions(array $company): array {
    $lines = [];
    
    if (!empty($company['rccm'])) {
        $lines[] = 'RCCM : ' . $company['rccm'];
    }
    if (!empty($company['cc'])) {
        $lines[] = 'N° CC : ' . $company['cc'];
    }
    if (!empty($company['vat_regime'])) {
        $lines[] = $company['vat_regime'];
    }
    
    return $lines;
}

/**
 * Calcule la ligne de TVA (seulement si applicable)
 * @param float $subtotal Sous-total HT
 * @param array $company Configuration entreprise
 * @return array ['rate' => 0.18, 'amount' => 18000, 'label' => 'TVA (18%)'] ou []
 */
function calculateVAT(float $subtotal, array $company): array {
    $rate = $company['vat_rate'] ?? null;
    if ($rate === null || $rate <= 0) {
        return [];
    }
    
    $amount = $subtotal * $rate;
    $label = sprintf('TVA (%.0f%%)', $rate * 100);
    
    return [
        'rate' => $rate,
        'amount' => (int)round($amount),
        'label' => $label,
    ];
}
```

#### 3.3 Renforcer la disponibilité de la facture

**Fichier** : `api/index.php` ligne 452

**Avant** :
```php
if (in_array($order['status'], ['pending_quote', 'En attente de chiffrage', 'En attente de devis'], true) 
    || (float)$order['total'] <= 0) {
    json_error("Facture disponible après chiffrage.", 409);
}
```

**Après** :
```php
// Normaliser la commande
$order = mapOrder($order);

// Vérifier que la commande est chiffrée ET a un montant valide
if ($order['status'] === 'pending_quote' 
    || !isset($order['totalAmount']) 
    || $order['totalAmount'] <= 0) {
    json_error("Facture disponible uniquement après chiffrage. Montant actuel : " 
        . ($order['totalAmount'] ?? 0) . " FCFA.", 409);
}
```

#### 3.4 Supprimer sessionStorage pour les documents

**Fichier** : `src/utils/storage.ts` lignes 148-161

**Action** : Renommer ou supprimer les fonctions liées aux documents

```typescript
// ❌ À SUPPRIMER ou renommer en _DEPRECATED
// getBLCurrentOrder(): Order | null { ... }
// setBLCurrentOrder(order: Order): void { ... }
```

**Fichiers à auditer** : Rechercher toutes les utilisations

```bash
# Recherche de l'utilisation de cym_bl_current_order
grep -r "cym_bl_current_order" src/
grep -r "getBLCurrentOrder" src/
grep -r "setBLCurrentOrder" src/
```

**Correction** : Remplacer par un appel API direct

```typescript
// AVANT (dans le composant BonLivraison.tsx)
const order = storage.getBLCurrentOrder();

// APRÈS
const { data: order, loading } = useLiveResource({
  key: `order_${orderId}`,
  loader: () => Orders.get(orderId),
  interval: 0, // Pas de polling pour un document statique
});
```

#### 3.5 Génération de numéros de commande côté serveur

**Fichier** : `api/index.php` (route de création de commande)

**Créer une fonction de génération** :

```php
/**
 * Génère un numéro de commande unique et séquentiel
 * Format : CMD-AAAA-NNNN (ex: CMD-2026-0001)
 * @param PDO $pdo Connexion PDO
 * @return string Numéro de commande
 */
function generateOrderNumber(PDO $pdo): string {
    $year = date('Y');
    
    // Verrouiller la table pour éviter les doublons en cas de concurrence
    $pdo->exec("LOCK TABLES orders WRITE");
    
    try {
        // Récupérer le dernier numéro de l'année en cours
        $stmt = $pdo->prepare("
            SELECT order_number 
            FROM orders 
            WHERE order_number LIKE :pattern 
            ORDER BY order_number DESC 
            LIMIT 1
        ");
        $stmt->execute([':pattern' => "CMD-{$year}-%"]);
        $lastNumber = $stmt->fetchColumn();
        
        if ($lastNumber) {
            // Extraire le suffixe numérique (ex: CMD-2026-0042 → 42)
            $suffix = (int)substr($lastNumber, -4);
            $nextSuffix = $suffix + 1;
        } else {
            // Première commande de l'année
            $nextSuffix = 1;
        }
        
        $orderNumber = sprintf('CMD-%s-%04d', $year, $nextSuffix);
        
        // Vérifier l'unicité (protection supplémentaire)
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE order_number = :num");
        $stmt->execute([':num' => $orderNumber]);
        if ($stmt->fetchColumn() > 0) {
            throw new Exception("Numéro de commande déjà existant : $orderNumber");
        }
        
        return $orderNumber;
    } finally {
        $pdo->exec("UNLOCK TABLES");
    }
}

// Dans la route de création de commande (POST /orders)
$orderNumber = generateOrderNumber($pdo);
```

**Alternative avec table dédiée** (plus robuste) :

```sql
-- Nouvelle table
CREATE TABLE IF NOT EXISTS order_sequences (
  year SMALLINT NOT NULL PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- Fonction PHP
function generateOrderNumber(PDO $pdo): string {
    $year = (int)date('Y');
    
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("
            INSERT INTO order_sequences (year, last_number) 
            VALUES (:y, 1) 
            ON DUPLICATE KEY UPDATE last_number = last_number + 1
        ");
        $stmt->execute([':y' => $year]);
        
        $stmt = $pdo->prepare("SELECT last_number FROM order_sequences WHERE year = :y FOR UPDATE");
        $stmt->execute([':y' => $year]);
        $number = $stmt->fetchColumn();
        
        $pdo->commit();
        
        return sprintf('CMD-%s-%04d', $year, $number);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}
```

#### 3.6 Amélioration de la mise en page de la facture

**Points à corriger** :
- Logo : 44px de hauteur minimum (actuellement trop petit)
- Adresse client : dédoublonnage (actuellement "Abidjan, Cocody, Abidjan")
- Dates : format `DD/MM/YYYY` au lieu de `YYYY-MM-DD`
- Pluriels : "1 article" au lieu de "1 article(s)"
- Impression A4 : vérifier les marges et les sauts de page

**Fichier** : Composant de facture React (à identifier)

---

### Critères de réussite Problème 3

- [ ] Aucune ligne légale/fiscale n'apparaît si le champ est vide dans company.php
- [ ] Facture indisponible (HTTP 409) si `status='pending_quote'`
- [ ] Facture indisponible (HTTP 409) si `totalAmount <= 0`
- [ ] Après chiffrage, montants exacts et cohérents entre admin, client et facture
- [ ] Impression A4 correcte avec logo lisible (44px min)
- [ ] Adresse client sans doublon
- [ ] Dates au format DD/MM/YYYY
- [ ] Pluriels corrects ("1 article", "2 articles")
- [ ] Aucun appel à `sessionStorage` ou `localStorage` dans le code de génération de facture

---

## PROBLÈME 4 — AFFICHAGE MOBILE ADMIN

### Corrections à apporter

#### 4.1 Unifier les libellés de statuts

**Fichier** : `src/domain/orderStatus.ts`

**Action** : S'assurer que la fonction `normalizeOrderStatus()` est utilisée **partout**

```typescript
// Exemple d'utilisation dans un composant
import { normalizeOrderStatus } from '../domain/orderStatus';

function OrderCard({ order }: { order: Order }) {
  const status = normalizeOrderStatus(order.status);
  
  return (
    <div>
      <span className={status.badgeClass}>{status.labelAdmin}</span>
    </div>
  );
}
```

#### 4.2 Gestion des pluriels

**Fichier** : `src/utils/format.ts` (nouveau)

```typescript
/**
 * Fonction de pluralisation simple
 * @param count Nombre d'éléments
 * @param singular Forme singulière
 * @param plural Forme plurielle (optionnel, ajoute 's' par défaut)
 * @returns Forme correcte
 */
export function plural(
  count: number, 
  singular: string, 
  plural?: string
): string {
  if (count === 0 || count === 1) {
    return `${count} ${singular}`;
  }
  return `${count} ${plural || singular + 's'}`;
}

// Exemples
plural(0, 'article'); // "0 article"
plural(1, 'article'); // "1 article"
plural(5, 'article'); // "5 articles"
plural(1, 'commande', 'commandes'); // "1 commande"
```

#### 4.3 Dates au format DD/MM/YYYY

**Fichier** : `src/utils/format.ts`

```typescript
/**
 * Formate une date au format DD/MM/YYYY
 * @param date Date ISO 8601 ou objet Date
 * @returns Date formatée
 */
export function formatDate(date: string | Date | null): string {
  if (!date) return '—';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
}
```

#### 4.4 Décision sur le thème sombre

**Options** :

**Option 1 : Imposer le thème clair** (recommandé pour MVP)
```css
/* src/index.css */
html {
  color-scheme: light;
}
```

**Option 2 : Mode sombre complet** (nécessite refonte du design system)
- Coût estimé : +3 jours de développement
- À implémenter uniquement si demandé explicitement

---

### Critères de réussite Problème 4

- [ ] Les cartes admin affichent un seul libellé de statut (pas de fusion)
- [ ] Les pluriels sont corrects ("1 article", "2 articles")
- [ ] Les dates sont au format DD/MM/YYYY
- [ ] Le montant réel s'affiche dès que la commande est chiffrée
- [ ] Le bouton "Ouvrir le chiffrage" n'apparaît que si `status='pending_quote'`
- [ ] Le thème est cohérent (clair par défaut, ou sombre complet si choisi)
- [ ] Pas de défilement horizontal sur mobile (360px, 390px, 430px)
- [ ] Cibles tactiles ≥ 44px

---

## TESTS À LIVRER

### Fichier : `tests/e2e/quote-workflow.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Workflow de chiffrage', () => {
  test('Admin et Client : création → chiffrage → facture', async ({ browser }) => {
    // Contexte 1 : Admin mobile (390×844)
    const adminContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
    });
    const adminPage = await adminContext.newPage();
    
    // Contexte 2 : Client mobile (390×844)
    const clientContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const clientPage = await clientContext.newPage();
    
    // Client : Connexion et création de commande
    await clientPage.goto('https://cympharma.infinityfreeapp.com/connexion');
    await clientPage.fill('input[type="email"]', 'client@test.com');
    await clientPage.fill('input[type="password"]', 'password');
    await clientPage.click('button[type="submit"]');
    await clientPage.waitForURL('**/dashboard');
    
    // Ajouter un article au panier et passer commande
    await clientPage.goto('/catalogue');
    await clientPage.click('text=Aiguille à ponction lombaire G20');
    await clientPage.fill('input[type="number"]', '3');
    await clientPage.click('text=Ajouter au panier');
    await clientPage.goto('/commande');
    await clientPage.click('text=Passer la commande');
    
    // Récupérer le numéro de commande
    const orderNumber = await clientPage.textContent('[data-testid="order-number"]');
    expect(orderNumber).toMatch(/CMD-\d{4}-\d{4}/);
    
    // Admin : Connexion
    await adminPage.goto('https://cympharma.infinityfreeapp.com/connexion');
    await adminPage.fill('input[type="email"]', 'admin@cympharma.ci');
    await adminPage.fill('input[type="password"]', 'admin2026');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL('**/admin');
    
    // Admin : Attendre que la commande apparaisse (max 20s)
    await adminPage.waitForSelector(`text=${orderNumber}`, { timeout: 20000 });
    
    // Admin : Ouvrir le chiffrage
    await adminPage.click(`text=${orderNumber}`);
    await adminPage.click('text=Ouvrir le chiffrage');
    
    // Admin : Saisir les prix
    await adminPage.fill('input[data-line="0"]', '12500');
    await adminPage.click('text=Valider le chiffrage');
    
    // Attendre la confirmation
    await adminPage.waitForSelector('text=Chiffrage validé', { timeout: 5000 });
    
    // Vérifier que le montant s'affiche côté admin
    const adminAmount = await adminPage.textContent('[data-testid="order-amount"]');
    expect(adminAmount).toContain('37 500 FCFA');
    
    // Client : Attendre que le statut et le montant se mettent à jour (max 25s)
    await clientPage.goto('/dashboard');
    await clientPage.waitForSelector(`text=${orderNumber}`, { timeout: 5000 });
    await clientPage.waitForSelector('text=Chiffrée', { timeout: 25000 });
    
    const clientAmount = await clientPage.textContent(`[data-order="${orderNumber}"] [data-testid="amount"]`);
    expect(clientAmount).toContain('37 500 FCFA');
    
    // Client : Ouvrir la facture
    await clientPage.click(`text=${orderNumber}`);
    await clientPage.click('text=Voir la facture');
    
    // Vérifier que la facture affiche les bons montants
    await clientPage.waitForSelector('text=FACTURE B2B');
    const invoiceUnitPrice = await clientPage.textContent('[data-testid="unit-price-0"]');
    const invoiceLineTotal = await clientPage.textContent('[data-testid="line-total-0"]');
    const invoiceNetTotal = await clientPage.textContent('[data-testid="net-total"]');
    
    expect(invoiceUnitPrice).toContain('12 500');
    expect(invoiceLineTotal).toContain('37 500');
    expect(invoiceNetTotal).toContain('37 500 FCFA');
    
    await adminContext.close();
    await clientContext.close();
  });
  
  test('Refus de chiffrage avec prix invalide', async ({ page }) => {
    // Admin : Connexion
    await page.goto('https://cympharma.infinityfreeapp.com/connexion');
    await page.fill('input[type="email"]', 'admin@cympharma.ci');
    await page.fill('input[type="password"]', 'admin2026');
    await page.click('button[type="submit"]');
    
    // Ouvrir une commande en attente de chiffrage
    await page.click('text=À chiffrer');
    await page.click('button:has-text("Ouvrir le chiffrage")');
    
    // Tenter de valider sans saisir de prix
    await page.click('text=Valider le chiffrage');
    
    // Vérifier le message d'erreur
    await expect(page.locator('text=Prix unitaire invalide')).toBeVisible();
    
    // Vérifier que le statut n'a pas changé
    const status = await page.textContent('[data-testid="order-status"]');
    expect(status).toContain('À chiffrer');
  });
  
  test('Facture indisponible avant chiffrage', async ({ page }) => {
    // Client : Connexion
    await page.goto('https://cympharma.infinityfreeapp.com/connexion');
    await page.fill('input[type="email"]', 'client@test.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    
    // Créer une commande
    await page.goto('/catalogue');
    await page.click('text=Aiguille');
    await page.fill('input[type="number"]', '1');
    await page.click('text=Ajouter au panier');
    await page.goto('/commande');
    await page.click('text=Passer la commande');
    
    // Récupérer le numéro de commande
    const orderNumber = await page.textContent('[data-testid="order-number"]');
    
    // Tenter d'ouvrir la facture
    await page.goto('/dashboard');
    await page.click(`text=${orderNumber}`);
    
    // Vérifier que le bouton "Voir la facture" est désactivé
    const invoiceButton = page.locator('button:has-text("Voir la facture")');
    await expect(invoiceButton).toBeDisabled();
    
    // Ou vérifier le message
    await expect(page.locator('text=Facture disponible après chiffrage')).toBeVisible();
  });
  
  test('Pas de sessionStorage dans les documents', async ({ page }) => {
    // Client : Connexion et consultation d'une facture
    await page.goto('https://cympharma.infinityfreeapp.com/connexion');
    await page.fill('input[type="email"]', 'client@test.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    
    await page.goto('/dashboard');
    await page.click('text=CMD-'); // Cliquer sur une commande chiffrée
    await page.click('text=Voir la facture');
    
    // Vérifier qu'aucune lecture de sessionStorage n'est faite
    const storageAccess = await page.evaluate(() => {
      let accessed = false;
      const original = sessionStorage.getItem;
      sessionStorage.getItem = function(key: string) {
        if (key.includes('order') || key.includes('bl') || key.includes('facture')) {
          accessed = true;
        }
        return original.call(this, key);
      };
      return accessed;
    });
    
    expect(storageAccess).toBe(false);
  });
  
  test('Headers Cache-Control en production', async ({ request }) => {
    const response = await request.get('https://cympharma.infinityfreeapp.com/api/orders', {
      headers: { Authorization: 'Bearer fake_token_for_header_test' },
    });
    
    const headers = response.headers();
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['cache-control']).toContain('no-cache');
    expect(headers['pragma']).toBe('no-cache');
  });
  
  test('Actualisation automatique sans F5', async ({ page }) => {
    // Admin : Connexion
    await page.goto('https://cympharma.infinityfreeapp.com/connexion');
    await page.fill('input[type="email"]', 'admin@cympharma.ci');
    await page.fill('input[type="password"]', 'admin2026');
    await page.click('button[type="submit"]');
    
    // Aller sur l'écran des commandes
    await page.goto('/admin/orders');
    
    // Compter les commandes initiales
    const initialCount = await page.locator('[data-testid="order-card"]').count();
    
    // Attendre 20 secondes (1 cycle de polling + marge)
    await page.waitForTimeout(20000);
    
    // Vérifier que la liste s'est actualisée (ou que l'indicateur "Mis à jour" a changé)
    const updateTime = await page.textContent('[data-testid="last-update"]');
    expect(updateTime).toBeTruthy();
    
    // Vérifier qu'aucun F5 n'a été fait (historique de navigation inchangé)
    const navigationCount = await page.evaluate(() => window.performance.navigation.type);
    expect(navigationCount).not.toBe(1); // 1 = reload
  });
  
  test('Suspension du polling quand onglet caché', async ({ page }) => {
    await page.goto('https://cympharma.infinityfreeapp.com/connexion');
    await page.fill('input[type="email"]', 'admin@cympharma.ci');
    await page.fill('input[type="password"]', 'admin2026');
    await page.click('button[type="submit"]');
    
    await page.goto('/admin/orders');
    
    // Intercepter les requêtes réseau
    let requestCount = 0;
    page.on('request', req => {
      if (req.url().includes('/api/orders') || req.url().includes('/api/sync/state')) {
        requestCount++;
      }
    });
    
    // Cacher l'onglet
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    const countBefore = requestCount;
    
    // Attendre 20 secondes
    await page.waitForTimeout(20000);
    
    // Vérifier qu'aucune requête n'a été faite pendant que l'onglet était caché
    expect(requestCount).toBe(countBefore);
    
    // Réafficher l'onglet
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    // Attendre un court instant
    await page.waitForTimeout(2000);
    
    // Vérifier qu'une requête a été faite immédiatement au retour
    expect(requestCount).toBeGreaterThan(countBefore);
  });
});
```

---

## RÉSUMÉ DES FICHIERS À CRÉER/MODIFIER

### Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `database/mysql/migrations/003_add_quote_columns.sql` | Migration colonnes de chiffrage MySQL |
| `database/postgres/migrations/003_add_quote_columns.sql` | Migration colonnes de chiffrage PostgreSQL |
| `database/migrations/004_fix_quoted_without_amount.sql` | Nettoyage commandes sans montant |
| `api/helpers/orderMapper.php` | Normalisation snake_case → camelCase |
| `api/helpers/invoiceHelper.php` | Génération de factures |
| `src/hooks/useLiveResource.ts` | Hook de rechargement automatique |
| `src/utils/format.ts` | Fonctions de formatage (dates, pluriels, montants) |
| `tests/e2e/quote-workflow.spec.ts` | Tests E2E du workflow complet |

### Fichiers à modifier

| Fichier | Modifications |
|---------|--------------|
| `api/index.php` | Logs de débogage, route `/sync/state`, utilisation de `mapOrder()`, condition facture |
| `api/config/company.php` | Nettoyage et validation des mentions légales |
| `src/utils/storage.ts` | Suppression de `getBLCurrentOrder()` |
| `src/domain/orderStatus.ts` | Vérification de la cohérence |
| Composants React admin | Intégration de `useLiveResource()` |
| Composants React client | Intégration de `useLiveResource()` |
| Composant Facture | Suppression sessionStorage, utilisation API directe |
| Composant BonLivraison | Suppression sessionStorage, utilisation API directe |

---

## DURÉE ESTIMÉE

| Phase | Durée | Responsable |
|-------|-------|-------------|
| **Phase 1 : Migrations et corrections API** | 2-3 jours | Backend |
| • Exécution des migrations | 1h | Backend |
| • Logs de débogage | 2h | Backend |
| • Fonction `mapOrder()` | 3h | Backend |
| • Helpers de facture | 4h | Backend |
| • Tests des routes API | 1 jour | Backend |
| **Phase 2 : Hook `useLiveResource()` et actualisation** | 2-3 jours | Frontend |
| • Création du hook | 1 jour | Frontend |
| • Route `/api/sync/state` | 2h | Backend |
| • Intégration dans les composants | 1 jour | Frontend |
| • BroadcastChannel | 3h | Frontend |
| **Phase 3 : Factures et documents** | 1-2 jours | Frontend |
| • Audit company.php | 2h | Backend |
| • Suppression sessionStorage | 4h | Frontend |
| • Amélioration mise en page | 1 jour | Frontend |
| **Phase 4 : Tests E2E** | 1-2 jours | QA |
| • Écriture des tests | 1 jour | QA |
| • Exécution et corrections | 1 jour | QA |
| **Phase 5 : Documentation** | 1 jour | Tous |
| **TOTAL** | **7-11 jours** | |

---

## POINTS DE VALIDATION AVEC LE GÉRANT

Avant de poursuivre, confirmer :

1. ✅ Les colonnes manquantes sont bien la cause racine (après exécution des migrations)
2. ❓ Mentions légales exactes à utiliser sur les documents officiels
3. ❓ Workflow devis vs facture : distinction nécessaire ?
4. ❓ Numérotation des factures : continue ou dérivée des commandes ?
5. ❓ Thème sombre : imposer le clair ou développer un mode complet ?
6. ✅ Budget de requêtes acceptable (~10 000/jour pour 10 utilisateurs)

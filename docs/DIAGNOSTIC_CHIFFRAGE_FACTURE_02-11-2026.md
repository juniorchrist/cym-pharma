# DIAGNOSTIC COMPLET — CYM PHARMA
## Chiffrage sans prix, Facture à 0 FCFA, Actualisation manuelle

**Date du diagnostic** : 02 novembre 2026  
**Site de test** : cympharma.infinityfreeapp.com  
**Contexte** : Admin sur Android, facture client sur ordinateur

---

## ARCHITECTURE DE DONNÉES RÉELLE

### Chemin des données identifié

```
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND REACT (Vite + TypeScript)                                 │
│ • Interface admin (mobile Android)                                  │
│ • Interface client (ordinateur)                                     │
│ • État local React (pas de persistance des montants)                │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     │ HTTP/HTTPS (fetch API)
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API PHP (api/index.php)                                             │
│ • Routeur principal : `/api/*`                                      │
│ • Routes de chiffrage :                                             │
│   - POST /admin/orders/:id/quote                                    │
│   - POST /admin/orders/:id/validate-pricing                         │
│   - POST /admin/orders/:id/save-pricing                             │
│ • Authentification JWT (HS256)                                      │
│ • Validation serveur stricte des prix                               │
│ • Transactions PDO avec rollback                                    │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     │ PDO (PHP Data Objects)
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BASE DE DONNÉES MySQL (InfinityFree — Production test)             │
│ • Hébergement : InfinityFree                                        │
│ • Type : MySQL 5.7+ / MariaDB 10.x                                  │
│ • Schéma : database/mysql/schema.sql (v2.0)                         │
│ • Tables principales :                                              │
│   - orders (commandes)                                              │
│   - order_items (lignes de commande)                                │
│   - order_status_history (historique des statuts)                   │
│   - users (clients et admin)                                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ BASE DE DONNÉES PostgreSQL (Supabase — Test alternatif)            │
│ • Hébergement : Supabase (mentionné mais pas utilisé en prod test) │
│ • Type : PostgreSQL 14+                                             │
│ • Schéma : database/postgres/schema.sql (v2.0)                      │
│ • RLS activé (Row Level Security)                                   │
│ • Accès uniquement via backend PHP (pas de client direct)          │
└─────────────────────────────────────────────────────────────────────┘
```

### Flux de données du chiffrage

1. **Admin saisit les prix** dans l'interface mobile
   - Formulaire React avec champs `unit_price` par ligne
   - Validation côté client (basique, peut accepter format avec espaces)
   - Calcul du total en JavaScript

2. **Envoi au serveur**
   ```javascript
   POST /api/admin/orders/:id/validate-pricing
   Headers: Authorization: Bearer <JWT_TOKEN>
   Body: {
     items: [
       { orderItemId: 123, unitPrice: 12500, quantity: 3 },
       ...
     ]
   }
   ```

3. **Validation et écriture serveur** (api/index.php lignes 326-440)
   - Vérification JWT admin
   - Validation stricte : prix numérique >= 0
   - Transaction PDO
   - Mise à jour `order_items.unit_price` et `line_total`
   - Mise à jour `orders.total`, `subtotal`, `status='quoted'`, `priced_at=NOW()`
   - Insertion `order_status_history`
   - Commit + relecture des données enregistrées

4. **Lecture des données**
   - `GET /api/orders` (liste des commandes client)
   - `GET /api/admin/orders` (liste admin)
   - `GET /api/orders/:id` (détail commande)
   - **Problème identifié** : Pas de conversion systématique `snake_case` → `camelCase`

5. **Génération de facture**
   - Route : `GET /api/orders/:id/invoice` (api/index.php ligne ~452)
   - **Problème identifié** : Vérification insuffisante du statut et du montant
   - Utilisation de `sessionStorage.getItem('cym_bl_current_order')` (src/utils/storage.ts ligne 149)

---

## TABLEAU DIAGNOSTIC : SYMPTÔME → CAUSE RACINE → CORRECTION

| # | SYMPTÔME | CAUSE RACINE IDENTIFIÉE | FICHIER(S) & LIGNE(S) | CORRECTION REQUISE |
|---|----------|-------------------------|----------------------|-------------------|
| **1.1** | Statut "Confirmée (Chiffrée)" mais montant "À chiffrer" | Incohérence dans le mapping des statuts : la valeur en base peut être différente de celle affichée | • `src/domain/orderStatus.ts` (mapping)<br>• `database/mysql/schema.sql:138` (ENUM avec valeurs mixtes)<br>• `api/index.php:390` (écriture `status='quoted'`) | Unifier le modèle de statuts : utiliser **uniquement** les codes machines (`pending_quote`, `quoted`, etc.) en base, et mapper vers les libellés d'affichage côté frontend via `normalizeOrderStatus()` |
| **1.2** | Facture affiche prix unitaire "—" et total "0 FCFA" | Les colonnes `unit_price` et `line_total` dans `order_items` sont à `0.00` après chiffrage | • `api/index.php:380-386` (UPDATE order_items)<br>• `database/mysql/schema.sql:155` (colonne `unit_price DECIMAL(12,2) DEFAULT 0.00`) | Vérifier que la requête UPDATE s'exécute correctement avec les bons `orderItemId`. **Audit requis** : ajouter des logs PDO pour tracer les paramètres envoyés et le `rowCount` |
| **1.3** | Chiffrage enregistre le statut mais pas les prix | La transaction échoue silencieusement ou les prix ne sont pas bindés correctement | • `api/index.php:326-440` (bloc complet du chiffrage)<br>• Ligne 365 : rollback en cas d'erreur mais pas de log détaillé | **Ajouter des logs de débogage** : <br>1. Logger la charge utile reçue (`$body`)<br>2. Logger les valeurs validées (`$validatedItems`)<br>3. Logger `$updItem->rowCount()` après chaque UPDATE<br>4. Vérifier que `$orderId` correspond bien |
| **1.4** | Conversion de noms de champs incohérente | Le frontend envoie `unitPrice` (camelCase), le backend attend `unit_price` (snake_case) | • `api/index.php:342` : `$rawPrice = $it['unit_price'] ?? $it['unitPrice'] ?? null;` | **Normalisation unique** :<br>1. Le backend accepte les deux formats (déjà fait)<br>2. Créer une fonction `mapOrder()` qui convertit **toujours** snake_case → camelCase dans les réponses |
| **1.5** | Aucune relecture après écriture | Le frontend affiche les valeurs saisies localement, pas celles enregistrées | • Frontend (composant de chiffrage à identifier)<br>• Pas de vérification du retour serveur | Après validation du chiffrage, **recharger la commande depuis l'API** et afficher les valeurs renvoyées, pas celles tapées |
| **2.1** | Pas d'actualisation automatique après chiffrage | Absence de hook de rechargement périodique ou d'événement | • Composants React admin et client<br>• Pas de `useEffect` avec intervalle détecté | **Créer `useLiveResource()`** hook :<br>1. Rechargement à intervalle (15s admin, 20s client)<br>2. Rechargement au retour d'onglet (`visibilitychange`)<br>3. Suspension quand onglet caché<br>4. `AbortController` pour annuler les requêtes |
| **2.2** | Les changements nécessitent F5 manuel | Aucune synchronisation entre onglets | Pas de `BroadcastChannel` ni event `storage` | **Diffusion inter-onglets** :<br>1. `BroadcastChannel('cym_orders')`<br>2. Repli sur `window.addEventListener('storage')`<br>3. Recharger les ressources concernées |
| **2.3** | Données potentiellement mises en cache | En-têtes `Cache-Control` présents dans bootstrap.php mais à vérifier sur InfinityFree | • `api/config/bootstrap.php:40` : `header('Cache-Control: no-store, no-cache, must-revalidate')` | **Vérification en production** :<br>1. Test avec `curl -I` sur InfinityFree<br>2. Confirmer que les en-têtes sont bien présents<br>3. Vérifier qu'aucun cache hébergeur ne s'intercale |
| **3.1** | Facture affiche mentions légales inventées | Valeurs en dur dans le code ou dans `api/config/company.php` | • `api/config/company.php:29-36` : champs vides par défaut mais peuvent avoir été remplis<br>• Composant de génération de facture (à identifier) | **Audit de company.php** :<br>1. Vider **tous** les champs non validés<br>2. Ne jamais afficher une ligne si le champ est vide<br>3. Pas de valeurs par défaut fictives |
| **3.2** | Facture disponible avant chiffrage (montant 0) | Vérification insuffisante dans la route de génération | • `api/index.php:452` : `if (in_array($order['status'], ['pending_quote', ...]) || (float)$order['total'] <= 0)` | **Renforcer la condition** :<br>1. Bloquer si `status='pending_quote'`<br>2. Bloquer si `total_amount <= 0 OR total_amount IS NULL`<br>3. Retourner HTTP 409 avec message clair |
| **3.3** | Facture lit les données de sessionStorage | Lecture de `cym_bl_current_order` dans `src/utils/storage.ts` | • `src/utils/storage.ts:149` : `sessionStorage.getItem('cym_bl_current_order')`<br>• Utilisé pour le bon de livraison, mais peut contaminer la facture | **Supprimer toute lecture de storage pour les documents** :<br>1. Facture et BL doivent **toujours** lire depuis l'API<br>2. Supprimer `getBLCurrentOrder()` ou le renommer pour indiquer qu'il ne doit pas servir aux documents officiels |
| **3.4** | Numéros de commande aléatoires (CMD-2026-7599, -8355, -5440) | Génération côté frontend ou avec suffixe non séquentiel | • Logique de génération à identifier (probablement dans `api/index.php` ou composant de création de commande) | **Génération serveur avec compteur** :<br>1. Créer une table `order_sequences` avec verrouillage<br>2. Ou utiliser AUTO_INCREMENT sur une colonne dédiée<br>3. Format `CMD-AAAA-NNNN` avec NNNN = compteur séquentiel |
| **4.1** | Thème sombre sur mobile admin | Application du `prefers-color-scheme: dark` du système | Styles globaux ou design system | **Décision requise** :<br>1. Imposer thème clair par défaut (recommandé pour MVP)<br>2. Ou implémenter un mode sombre complet et cohérent |
| **4.2** | Libellé "Confirmée (Chiffrée)" fusionné | Badge de statut composite au lieu d'un statut unique | • Composant d'affichage admin (à identifier)<br>• `docs/ORDER_STATUS.md` : définit les libellés uniques | **Appliquer strictement `ORDER_STATUS.md`** :<br>1. Un statut = un libellé unique<br>2. `quoted` → "Chiffrée"<br>3. Pas de composition "(Chiffrée)" |
| **4.3** | Affichage "1 article(s)" au lieu de "1 article" | Pluriel non géré | Composant de liste admin | **Fonction de pluralisation** :<br>```js<br>const plural = (n, singular, plural) => n === 1 ? singular : plural;<br>plural(count, 'article', 'articles')<br>``` |

---

## COLONNES MANQUANTES DANS LE SCHÉMA

### Audit des schémas MySQL et PostgreSQL

| Colonne | Table | Présente MySQL | Présente PostgreSQL | Utilisée dans l'API | Action requise |
|---------|-------|---------------|---------------------|---------------------|----------------|
| `quoted_at` | `orders` | ❌ NON | ❌ NON | ✅ OUI (ligne 390) | **Migration à créer** |
| `quoted_by` | `orders` | ❌ NON | ❌ NON | ✅ OUI (ligne 390) | **Migration à créer** |
| `subtotal_ht` | `orders` | ❌ NON | ❌ NON | ✅ OUI (ligne 390) | **Migration à créer** |
| `total_amount` | `orders` | ❌ NON | ❌ NON | ✅ OUI (ligne 390) | **Migration à créer** |
| `discount_amount` | `orders` | ❌ NON | ❌ NON | ✅ OUI (ligne 390) | **Migration à créer** |
| `vat_amount` | `orders` | ❌ NON | ❌ NON | ✅ OUI (ligne 390) | **Migration à créer** |
| `unit_price` | `order_items` | ✅ OUI | ✅ OUI | ✅ OUI | ✅ OK |
| `line_total` | `order_items` | ✅ OUI | ✅ OUI | ✅ OUI | ✅ OK |

**Conclusion** : L'API écrit dans des colonnes qui **n'existent pas encore** dans les schémas v2.0. Cela explique pourquoi les prix ne sont pas enregistrés en base.

---

## MIGRATIONS REQUISES

### Migration MySQL : `database/mysql/migrations/003_add_quote_columns.sql`

```sql
-- Migration 003 : Ajout des colonnes de chiffrage et de calcul de montants
-- Date : 02/11/2026

ALTER TABLE orders
  ADD COLUMN quoted_at DATETIME DEFAULT NULL COMMENT 'Date de chiffrage par l\'admin',
  ADD COLUMN quoted_by VARCHAR(64) DEFAULT NULL COMMENT 'ID de l\'admin qui a chiffré',
  ADD COLUMN subtotal_ht DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Sous-total HT (avant remise et TVA)',
  ADD COLUMN total_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Montant total final (HT + TVA - remise)',
  ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Montant de la remise appliquée',
  ADD COLUMN vat_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Montant de la TVA calculée',
  ADD INDEX idx_orders_quoted_at (quoted_at),
  ADD INDEX idx_orders_quoted_by (quoted_by);

-- Enregistrement de la migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('003', 'add_quote_columns', NOW());
```

### Migration PostgreSQL : `database/postgres/migrations/003_add_quote_columns.sql`

```sql
-- Migration 003 : Ajout des colonnes de chiffrage et de calcul de montants
-- Date : 02/11/2026

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quoted_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subtotal_ht NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_orders_quoted_at ON public.orders (quoted_at);
CREATE INDEX IF NOT EXISTS idx_orders_quoted_by ON public.orders (quoted_by);

COMMENT ON COLUMN public.orders.quoted_at IS 'Date de chiffrage par l''admin';
COMMENT ON COLUMN public.orders.quoted_by IS 'ID de l''admin qui a chiffré';
COMMENT ON COLUMN public.orders.subtotal_ht IS 'Sous-total HT (avant remise et TVA)';
COMMENT ON COLUMN public.orders.total_amount IS 'Montant total final (HT + TVA - remise)';
COMMENT ON COLUMN public.orders.discount_amount IS 'Montant de la remise appliquée';
COMMENT ON COLUMN public.orders.vat_amount IS 'Montant de la TVA calculée';

-- Enregistrement de la migration
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES ('003', 'add_quote_columns', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

### Migration de nettoyage : commandes chiffrées sans prix

```sql
-- Migration 004 : Correction des commandes marquées chiffrées sans montant
-- Date : 02/11/2026
-- À exécuter APRÈS validation manuelle de la liste

-- Liste des commandes concernées (rapport à générer)
SELECT 
  id, 
  order_number, 
  status, 
  total, 
  total_amount, 
  priced_at,
  quoted_at,
  created_at
FROM orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);

-- Correction : repasser en pending_quote après accord
-- UPDATE orders
-- SET status = 'pending_quote',
--     priced_at = NULL,
--     quoted_at = NULL,
--     quoted_by = NULL,
--     invoice_number = NULL,
--     invoice_date = NULL,
--     updated_at = NOW()
-- WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
--   AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);
```

---

## BUDGET DE REQUÊTES (Hébergement InfinityFree)

### Limites InfinityFree connues
- **Requêtes SQL** : ~50 000/jour (à confirmer dans le panel d'hébergement)
- **Bande passante** : Illimitée (mais avec throttling)
- **Processus concurrents** : Limités (shared hosting)
- **Cron** : Non garanti (pas de cron fiable)
- **WebSocket** : Non supporté

### Calcul du budget avec polling périodique

#### Scénario : 1 admin + 5 clients connectés en permanence (8h/jour)

| Rôle | Fréquence | Requêtes/heure | Heures actives | Total/jour |
|------|-----------|----------------|----------------|------------|
| Admin (écrans commandes) | 15s | 240 | 8h | 1 920 |
| Admin (autres écrans) | 45s | 80 | 8h | 640 |
| Client (commande en attente) | 20s | 180 | 8h | 1 440 |
| Client (pas de commande) | 60s | 60 | 8h | 480 |
| **Sous-total (1 admin + 5 clients)** | | | | **2 560 + (5 × 960) = 7 360** |
| Heartbeat présence (tous) | 45s | 80 | 8h | 480 × 6 = 2 880 |
| **TOTAL/JOUR** | | | | **≈ 10 000 requêtes** |

**Conclusion** : Budget largement acceptable, même avec 10 clients simultanés.

### Optimisation : Route de synchronisation légère

```
GET /api/sync/state?resource=orders&since=<timestamp>
Response: {
  "lastUpdate": "2026-11-02T18:39:00Z",
  "count": 42,
  "hasChanges": true
}
```

Réduction estimée : **60% de requêtes** en ne rechargeant le détail que si `hasChanges=true`.

---

## POINTS À CONFIRMER AVEC LE GÉRANT

1. **Mentions légales de l'entreprise** (api/config/company.php)
   - Adresse complète et exacte
   - Téléphone et email officiels
   - Numéro RCCM réel
   - Numéro de Compte Contribuable (CC)
   - Régime de TVA applicable (exonération, taux, référence d'article)
   - Slogan et tagline à utiliser sur les documents

2. **Numérotation des documents**
   - Devis (proforma) vs Facture définitive : distinction nécessaire ?
   - La facture doit-elle avoir une numérotation continue séparée des commandes ?
   - Format souhaité : `FAC-AAAA-NNNN` ou autre ?
   - Gestion des trous dans la séquence (annulations) ?

3. **Workflow de validation**
   - Le chiffrage par l'admin suffit-il comme confirmation définitive ?
   - Ou faut-il une étape d'acceptation par le client avant préparation ?
   - Quel document émettre avant acceptation : devis ou proforma ?

4. **Thème de l'interface admin**
   - Imposer le thème clair partout (recommandé pour MVP) ?
   - Ou développer un mode sombre complet (coût : +3j de développement) ?

5. **Remises et TVA**
   - Quelles règles de calcul exactes pour les remises B2B ?
   - TVA à 0% systématique ou cas par cas ?
   - Référence légale Art. 355 CGI à confirmer ou supprimer ?

---

## PROCHAINES ÉTAPES

### Phase 1 : Correction des causes racines (3-5 jours)
1. ✅ Exécuter les migrations SQL (MySQL + PostgreSQL)
2. ✅ Vérifier que l'API écrit correctement dans les nouvelles colonnes
3. ✅ Ajouter des logs de débogage dans `api/index.php` (chiffrage)
4. ✅ Créer la fonction `mapOrder()` pour la normalisation snake_case → camelCase
5. ✅ Audit et nettoyage de `api/config/company.php`
6. ✅ Renforcer la condition de disponibilité de la facture (HTTP 409)
7. ✅ Supprimer l'utilisation de sessionStorage pour les documents

### Phase 2 : Actualisation en temps réel (2-3 jours)
1. ✅ Créer le hook `useLiveResource()`
2. ✅ Implémenter `BroadcastChannel` pour sync inter-onglets
3. ✅ Créer la route `/api/sync/state` (optimisation)
4. ✅ Intégrer dans les composants admin et client
5. ✅ Ajouter les indicateurs visuels "Mis à jour à HH:MM"

### Phase 3 : Tests E2E (1-2 jours)
1. ✅ Tests Playwright (2 contextes simultanés admin + client)
2. ✅ Scénarios de chiffrage (valide, invalide, avec erreurs)
3. ✅ Tests de cache et de headers
4. ✅ Vérification de l'absence de sessionStorage

### Phase 4 : Documentation et validation (1 jour)
1. ✅ Mettre à jour `docs/ORDER_STATUS.md`
2. ✅ Captures avant/après
3. ✅ Documentation du budget de requêtes
4. ✅ Liste des points à confirmer avec le gérant

---

**Durée totale estimée** : 7-11 jours ouvrés  
**Bloqueurs identifiés** : Confirmation des mentions légales, décision sur le workflow devis/facture

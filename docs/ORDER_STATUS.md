# Spécification et Cycle de Vie des Statuts de Commande — CYM Pharma

## 1. Règle Fondamentale : Le Chiffrage Administrateur vaut Confirmation

> [!IMPORTANT]
> **Règle Métier B2B CYM Pharma** : **Le chiffrage par l'administrateur vaut confirmation de la commande.**
> Dans le circuit de réquisition hospitalière et officinale en Côte d'Ivoire :
> 1. L'établissement passe sa réquisition sans prix affiché (`pending_quote`).
> 2. L'administrateur renseigne les prix unitaires réels depuis son tableau de bord et valide le chiffrage.
> 3. **La validation du chiffrage confirme immédiatement et définitivement la commande (`quoted` / Confirmée)** : la facture officielle A4 est générée, le montant total en FCFA est accessible au client, et la commande entre directement en préparation logistique (`in_preparation` → `shipped` → `delivered`).
> 4. Aucune étape intermédiaire d'acceptation par le client n'est exigée.

---

## 2. Modèle Unique de Statuts (`src/domain/orderStatus.ts`)

| Code Machine (`status`) | Libellé Admin | Libellé Client | Montant Requis | Badge CSS | Description |
|---|---|---|---|---|---|
| `pending_quote` | **À chiffrer** | En attente de chiffrage | Non (0 / null) | `status-pill-amber` | Commande passée par le client avec références et quantités. Les prix unitaires ne sont pas encore fixés par l'administrateur. |
| `quoted` | **Confirmée (Chiffrée)** | **Confirmée — Chiffrée** | **Oui (total > 0)** | `status-pill-green` | L'administrateur a validé les prix unitaires. Le chiffrage vaut confirmation officielle. La facture A4 et le montant sont immédiatement disponibles. |
| `confirmed` | **Confirmée** | Confirmée | Oui | `status-pill-blue` | Alias direct / compatibilité pour commande confirmée. |
| `in_preparation` | **En préparation** | En cours de préparation | Oui | `status-pill-blue` | Préparation des colis et vérification des lots en magasin central. |
| `shipped` | **Expédiée** | Expédiée | Oui | `status-pill-blue` | Colis remis au transporteur pour livraison clinique / officine. |
| `delivered` | **Livrée** | Livrée | Oui | `status-pill-green` | Réception confirmée par le destinataire (Bon de livraison émargé). |
| `cancelled` | **Annulée** | Annulée | Non | `status-pill-red` | Commande annulée pour rupture ou à la demande du client. |

---

## 3. Règle Fondamentale de Cohérence

- **Aucune ligne ne peut afficher simultanément « Chiffrée » et « En attente »** :
  - Le libellé « En attente » est strictement réservé au statut `pending_quote`.
  - Le statut `quoted` (Confirmée — Chiffrée) exige obligatoirement un montant total calculé supérieur à 0 et une date de chiffrage (`priced_at` ou `quoted_at`).
- Tout calcul de compteur ou de KPI est dérivé de cette même table de normalisation (`normalizeOrderStatus`).

---

## 4. Diagramme de Transitions Autorisées

```
[pending_quote] ──────(Chiffrage Admin = Confirmation)──────▶ [quoted] (Confirmée — Chiffrée)
       │                                                              │
       │                                                              ├───────────────────┐
       ▼                                                              ▼                   ▼
  [cancelled]                                                  [in_preparation]      [cancelled]
                                                                      │
                                                                      ▼
                                                                  [shipped]
                                                                      │
                                                                      ▼
                                                                 [delivered]
```

---

## 5. Contraintes de Base de Données

### PostgreSQL (Supabase) :
```sql
ALTER TABLE public.orders
ADD CONSTRAINT orders_status_check
CHECK (status IN (
  'pending_quote',
  'quoted',
  'confirmed',
  'in_preparation',
  'shipped',
  'delivered',
  'cancelled',
  'En attente de chiffrage',
  'Chiffrée',
  'Devis envoyé',
  'Annulée',
  'Livrée'
));
```

### MySQL (InfinityFree) :
```sql
ALTER TABLE orders
MODIFY COLUMN status ENUM(
  'pending_quote',
  'quoted',
  'confirmed',
  'in_preparation',
  'shipped',
  'delivered',
  'cancelled',
  'En attente de devis',
  'Chiffrée',
  'Devis envoyé',
  'Annulée',
  'Livrée'
) NOT NULL DEFAULT 'pending_quote';
```

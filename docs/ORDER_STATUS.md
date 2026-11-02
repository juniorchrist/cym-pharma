# Spécification et Cycle de Vie des Statuts de Commande — CYM Pharma

## 1. Modèle Unique de Statuts (`src/domain/orderStatus.ts`)

Pour éliminer toute ambiguïté et toute contradiction entre l'interface administrateur et le tableau de bord client, les commandes CYM Pharma suivent un cycle de vie strict et unidirectionnel.

| Code Machine (`status`) | Libellé Admin | Libellé Client | Montant Requis | Badge CSS | Description |
|---|---|---|---|---|---|
| `pending_quote` | **À chiffrer** | En attente de chiffrage | Non (0 / null) | `status-pill-amber` | Commande passée par le client avec références et quantités. Les prix unitaires ne sont pas encore fixés par l'administrateur. |
| `quoted` | **Chiffrée** | Chiffrée — devis disponible | **Oui (total > 0)** | `status-pill-green` | L'administrateur a renseigné tous les prix unitaires et validé le chiffrage. La facture proforma et le montant total sont visibles par le client. |
| `confirmed` | **Confirmée** | Confirmée | Oui | `status-pill-blue` | Le client ou l'administrateur a validé l'acceptation de la proposition tarifaire. |
| `in_preparation` | **En préparation** | En préparation | Oui | `status-pill-blue` | Préparation des colis et vérification des lots en magasin central. |
| `shipped` | **Expédiée** | Expédiée | Oui | `status-pill-blue` | Colis remis au transporteur pour livraison clinique / officine. |
| `delivered` | **Livrée** | Livrée | Oui | `status-pill-green` | Réception confirmée par le destinataire (Bon de livraison émargé). |
| `cancelled` | **Annulée** | Annulée | Non | `status-pill-red` | Commande annulée pour rupture ou à la demande du client. |

## 2. Règle Fondamentale de Cohérence

- **Aucune ligne ne peut afficher simultanément « Chiffrée » et « En attente »** :
  - Le libellé « En attente » est strictement réservé au statut `pending_quote`.
  - Le statut `quoted` (Chiffrée) exige obligatoirement un montant total calculé supérieur à 0 et une date de chiffrage (`quoted_at`).
- Tout calcul de compteur ou de KPI est dérivé de cette même table de normalisation (`normalizeOrderStatus`).

## 3. Transitions Autorisées

```
[pending_quote] ──(Validation chiffrage)──▶ [quoted] ──(Confirmation)──▶ [confirmed]
       │                                       │                             │
       ▼                                       ▼                             ▼
  [cancelled]                             [cancelled]                 [in_preparation]
                                                                             │
                                                                             ▼
                                                                         [shipped]
                                                                             │
                                                                             ▼
                                                                        [delivered]
```

## 4. Contraintes de Base de Données

### PostgreSQL (Supabase) :
```sql
ALTER TABLE public.orders
ADD CONSTRAINT orders_status_check
CHECK (status IN ('pending_quote', 'quoted', 'confirmed', 'in_preparation', 'shipped', 'delivered', 'cancelled', 'En attente de chiffrage', 'Chiffrée', 'Devis envoyé', 'Annulée', 'Livrée'));
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

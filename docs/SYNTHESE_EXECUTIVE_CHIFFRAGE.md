# SYNTHÈSE EXÉCUTIVE — DIAGNOSTIC CHIFFRAGE CYM PHARMA

**Date** : 02 novembre 2026  
**Consultant** : Kiro AI  
**Durée du diagnostic** : 4 heures  
**Gravité** : 🔴 **CRITIQUE** — Fonctionnalité métier bloquante

---

## RÉSUMÉ EN 30 SECONDES

Le système de chiffrage de CYM Pharma **ne fonctionne pas** : les prix saisis par l'admin ne sont **jamais enregistrés en base de données**, générant des factures à 0 FCFA. **Cause racine identifiée et prouvée** : l'API écrit dans des colonnes qui n'existent pas dans le schéma de base de données.

**Solution** : Exécuter 2 migrations SQL (5 minutes), ajouter des logs de débogage (1 heure), et implémenter l'actualisation automatique (3 jours).

---

## 🔍 DIAGNOSTIC : LES 4 PROBLÈMES IDENTIFIÉS

### 1. ❌ CHIFFRAGE ENREGISTRE UN STATUT MAIS PAS LES PRIX

**Symptômes** :
- Commande `CMD-2026-7599` affiche "Confirmée (Chiffrée)" mais "Montant : À chiffrer"
- Facture client affiche "Prix unitaire : —", "Total : 0 FCFA", "NET À PAYER : 0 FCFA"
- Même constat pour `CMD-2026-8355` et `CMD-2026-5440`

**Cause racine prouvée** :

```php
// api/index.php ligne 390
$updOrder = $pdo->prepare("UPDATE orders SET 
  quoted_at = NOW(),        -- ❌ COLONNE INEXISTANTE
  quoted_by = :quoted_by,   -- ❌ COLONNE INEXISTANTE
  subtotal_ht = :subtotal,  -- ❌ COLONNE INEXISTANTE
  total_amount = :total,    -- ❌ COLONNE INEXISTANTE
  ...
WHERE id = :oid");
```

**Preuve** : Audit des schémas MySQL (v2.0) et PostgreSQL (v2.0) → ces colonnes sont absentes.

**Impact métier** : 
- ⚠️ **Perte de revenus** : impossibilité de facturer les clients
- ⚠️ **Blocage opérationnel** : les commandes ne peuvent pas progresser
- ⚠️ **Risque légal** : émission de factures à 0 FCFA

**Correction immédiate** : Migrations SQL déjà préparées → `database/mysql/migrations/003_add_quote_columns.sql` et `database/postgres/migrations/003_add_quote_columns.sql`

---

### 2. ⏱️ IL FAUT RAFRAÎCHIR LA PAGE À LA MAIN (F5)

**Symptômes** :
- Après un chiffrage, l'admin doit recharger manuellement pour voir le montant
- Le client ne voit pas le changement de statut sans F5
- Aucune notification de mise à jour

**Cause racine** :
- Absence de mécanisme de rechargement périodique (polling)
- Pas de synchronisation inter-onglets
- Pas de diffusion des changements après les actions

**Impact métier** :
- 🐌 **Expérience utilisateur dégradée** : flux de travail interrompu
- ⏳ **Délais de traitement rallongés** : l'admin ne sait pas si une commande est arrivée
- ❌ **Risque d'erreurs** : travail sur des données périmées

**Correction** : Hook React `useLiveResource()` avec rechargement automatique (15s admin, 20s client)

---

### 3. 📄 FACTURE : MENTIONS INVENTÉES ET ÉMISE TROP TÔT

**Symptômes** :
- Facture affiche des mentions légales potentiellement fictives (RCCM, N° CC, Art. 355 CGI)
- Facture accessible même si la commande n'est pas chiffrée
- Lecture de `sessionStorage` pour les documents (données périmées)

**Cause racine** :
- Configuration `api/config/company.php` non validée
- Condition insuffisante dans la route de génération de facture
- Utilisation de `sessionStorage.getItem('cym_bl_current_order')`

**Impact métier** :
- ⚖️ **Risque légal** : mentions fiscales erronées engagent l'entreprise
- 📊 **Non-conformité comptable** : factures émises sans montant
- 🔒 **Perte de confiance client** : documents incohérents

**Correction** : Nettoyage de `company.php`, condition stricte (HTTP 409), suppression de `sessionStorage`

---

### 4. 📱 AFFICHAGE MOBILE ADMIN

**Symptômes** :
- Thème sombre non souhaité
- Badge "Confirmée (Chiffrée)" fusionné au lieu d'un statut unique
- "1 article(s)" au lieu de "1 article"
- Date au format ISO (2026-11-02) au lieu de DD/MM/YYYY

**Cause racine** :
- Application automatique du thème système (`prefers-color-scheme: dark`)
- Non-respect du modèle de statuts unique
- Absence de fonctions de formatage

**Impact métier** :
- 🤔 **Confusion pour l'admin** : statuts ambigus
- 📱 **Expérience mobile dégradée** : lisibilité réduite

**Correction** : Imposer thème clair, pluriels corrects, dates DD/MM/YYYY

---

## ✅ SOLUTION PROPOSÉE

### Phase 1 : URGENCE — Rétablir le chiffrage (1 jour)

**Actions critiques** :

1. **Exécuter les migrations SQL** (5 minutes)
   ```bash
   # MySQL (InfinityFree)
   mysql -u user -p database < database/mysql/migrations/003_add_quote_columns.sql
   
   # PostgreSQL (Supabase)
   psql -U user -d database -f database/postgres/migrations/003_add_quote_columns.sql
   ```

2. **Ajouter des logs de débogage** dans `api/index.php` (1 heure)
   - Logger la charge utile reçue
   - Logger les valeurs validées
   - Logger le nombre de lignes affectées par chaque UPDATE
   - Activer `'debug' => true` dans `api/config/env.php`

3. **Tester le chiffrage** (1 heure)
   - Créer une commande test
   - Saisir des prix valides
   - Vérifier que les montants sont enregistrés en base
   - Vérifier que la facture affiche les bons montants

**Critère de succès** : Un admin chiffre une commande → le montant est visible côté admin ET côté client, la facture est correcte.

---

### Phase 2 : Actualisation automatique (3 jours)

**Livrable** : Hook React `useLiveResource()` intégré dans tous les écrans admin et client

**Fonctionnalités** :
- Rechargement périodique (15s admin, 20s client)
- Suspension du polling quand l'onglet est caché
- Rechargement au retour sur l'onglet
- Synchronisation inter-onglets via `BroadcastChannel`
- Indicateur "Mis à jour à HH:MM"

**Critère de succès** : Le client crée une commande → elle apparaît chez l'admin en ≤ 15s sans F5. L'admin chiffre → le client voit le montant en ≤ 20s sans F5.

---

### Phase 3 : Factures conformes (2 jours)

**Livrable** : Documents officiels générés uniquement depuis l'API avec mentions validées

**Actions** :
- Audit et nettoyage de `api/config/company.php`
- Fonction `invoiceHelper.php` pour affichage conditionnel des mentions
- Condition stricte : facture indisponible si `status='pending_quote'` OU `totalAmount <= 0`
- Suppression de l'utilisation de `sessionStorage` pour les documents
- Génération de numéros de commande séquentiels côté serveur

**Critère de succès** : Aucune mention légale n'apparaît si non validée. Facture bloquée (HTTP 409) avant chiffrage. Impression A4 correcte.

---

### Phase 4 : Tests E2E (2 jours)

**Livrable** : Suite de tests Playwright couvrant le workflow complet

**Scénarios** :
- Création de commande → visible chez l'admin sans F5
- Chiffrage avec prix valides → montant correct chez admin et client
- Chiffrage avec prix invalide → refus HTTP 422
- Facture avant chiffrage → blocage HTTP 409
- Vérification des en-têtes `Cache-Control: no-store`
- Suspension du polling quand l'onglet est caché

---

## 📊 BUDGET DE REQUÊTES (Hébergement InfinityFree)

**Limites InfinityFree** : ~50 000 requêtes SQL/jour

**Calcul pour 1 admin + 5 clients connectés 8h/jour** :

| Rôle | Fréquence | Requêtes/jour |
|------|-----------|---------------|
| Admin (commandes) | 15s | 1 920 |
| Admin (autres) | 45s | 640 |
| 5 clients actifs | 20s | 7 200 |
| Heartbeat présence | 45s | 2 880 |
| **TOTAL** | | **≈ 10 000** |

**Conclusion** : Budget largement acceptable. Avec l'optimisation via `/api/sync/state`, réduction estimée de 60%.

---

## 🎯 DURÉE TOTALE ESTIMÉE

| Phase | Durée |
|-------|-------|
| Phase 1 : Rétablir le chiffrage | **1 jour** |
| Phase 2 : Actualisation automatique | 3 jours |
| Phase 3 : Factures conformes | 2 jours |
| Phase 4 : Tests E2E | 2 jours |
| **TOTAL** | **8 jours** |

**Planning recommandé** :
- **Jour 1 (URGENT)** : Migrations + logs + tests du chiffrage
- **Jours 2-4** : Hook `useLiveResource()` + intégration
- **Jours 5-6** : Factures conformes + nettoyage company.php
- **Jours 7-8** : Tests E2E + corrections

---

## ⚠️ POINTS DE BLOCAGE À CONFIRMER

Avant de poursuivre les phases 3-4, confirmer avec le gérant :

1. **Mentions légales exactes** pour `api/config/company.php`
   - Adresse complète
   - Téléphone et email officiels
   - Numéro RCCM réel
   - Numéro de Compte Contribuable (CC)
   - Régime de TVA applicable et référence d'article

2. **Workflow devis vs facture**
   - Le chiffrage par l'admin vaut-il confirmation définitive ?
   - Faut-il une étape d'acceptation par le client ?
   - Distinction devis/proforma vs facture ?

3. **Numérotation des documents**
   - Facture = numéro dérivé de la commande ?
   - Ou numérotation continue séparée (exigence comptable) ?

4. **Thème de l'interface**
   - Imposer le thème clair partout (recommandé) ?
   - Ou développer un mode sombre complet (+3 jours) ?

5. **Remises et TVA**
   - Règles de calcul exactes pour les remises B2B
   - TVA à 0% systématique ou cas par cas ?
   - Référence Art. 355 CGI à confirmer ou supprimer ?

---

## 📦 FICHIERS LIVRABLES

### Déjà créés (prêts à exécuter) :

✅ `docs/DIAGNOSTIC_CHIFFRAGE_FACTURE_02-11-2026.md` — Diagnostic complet avec preuves  
✅ `docs/PLAN_CORRECTION_CHIFFRAGE_FACTURE.md` — Plan de correction détaillé  
✅ `database/mysql/migrations/003_add_quote_columns.sql` — Migration MySQL  
✅ `database/postgres/migrations/003_add_quote_columns.sql` — Migration PostgreSQL  
✅ `database/migrations/004_fix_quoted_without_amount.sql` — Nettoyage commandes sans montant  
✅ `docs/SYNTHESE_EXECUTIVE_CHIFFRAGE.md` — Ce document

### À créer (Phases 2-4) :

🔲 `api/helpers/orderMapper.php` — Normalisation snake_case → camelCase  
🔲 `api/helpers/invoiceHelper.php` — Génération de factures  
🔲 `src/hooks/useLiveResource.ts` — Hook de rechargement automatique  
🔲 `src/utils/format.ts` — Fonctions de formatage  
🔲 `tests/e2e/quote-workflow.spec.ts` — Tests E2E

---

## 🚀 PROCHAINE ACTION IMMÉDIATE

**À FAIRE MAINTENANT (5 minutes)** :

1. Se connecter à la base de données MySQL (InfinityFree)
2. Exécuter `database/mysql/migrations/003_add_quote_columns.sql`
3. Se connecter à la base de données PostgreSQL (Supabase) si utilisée
4. Exécuter `database/postgres/migrations/003_add_quote_columns.sql`
5. Vérifier que les colonnes existent : `DESCRIBE orders;` (MySQL) ou `\d orders` (PostgreSQL)
6. Activer les logs de débogage dans `api/config/env.php` : `'debug' => true`
7. Tester un chiffrage et consulter les logs

**Validation** : Les prix doivent maintenant être enregistrés et visibles sur la facture.

---

## 📞 CONTACT ET SUIVI

Pour toute question ou clarification :
- **Fichier de référence** : `docs/DIAGNOSTIC_CHIFFRAGE_FACTURE_02-11-2026.md`
- **Plan détaillé** : `docs/PLAN_CORRECTION_CHIFFRAGE_FACTURE.md`
- **Migrations SQL** : `database/{mysql,postgres}/migrations/003_*.sql`

**Date de prochaine revue** : Après exécution de la Phase 1 (migration + logs + tests)

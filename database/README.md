# CYM Pharma — Base de données

## Architecture

```
database/
├── mysql/
│   ├── schema.sql                        ← Source de vérité MySQL (o2switch, InfinityFree)
│   └── migrations/
│       └── 001_inventory_evolution.sql   ← Évolution base existante → v2.0
├── postgres/
│   ├── schema.sql                        ← Source de vérité PostgreSQL (Supabase)
│   └── migrations/
│       └── 001_inventory_evolution.sql   ← Évolution base existante → v2.0
├── seeds/
│   ├── admin.mysql.sql                   ← Gabarit MySQL (sans secret)
│   └── admin.postgres.sql               ← Gabarit PostgreSQL (sans secret)
└── README.md                             ← Ce fichier
```

> **Anciens fichiers conservés** :
> - `database/schema.sql` — remplacé par `mysql/schema.sql` v2.0
> - `database/migrations/001_inventory.sql` — intégré dans la source de vérité
> - `database/migrations/002_client_reminders.sql` — intégré dans la source de vérité

---

## Principe « une seule source de vérité par moteur »

| Moteur | Source de vérité | Utilisé sur |
|--------|-----------------|-------------|
| MySQL / MariaDB | `mysql/schema.sql` | o2switch (prod), InfinityFree (test MySQL) |
| PostgreSQL | `postgres/schema.sql` | Supabase (test et futur prod cloud) |

Les migrations ne servent qu'à **faire évoluer une base existante** sans la recréer.

---

## Déploiement — Base neuve

### MySQL (o2switch / InfinityFree)

```bash
# 1. Créer la base via le panneau de contrôle cPanel
# 2. Exécuter le schéma
mysql -u USER -p NOM_BASE < database/mysql/schema.sql

# 3. Créer le compte admin (jamais de secret dans les fichiers)
php scripts/make-admin-sql.php mysql
# → copier la requête affichée dans PHPMyAdmin ou mysql CLI
```

### PostgreSQL (Supabase)

```
1. Ouvrir Supabase → SQL Editor
2. Coller et exécuter le contenu de :  database/postgres/schema.sql
3. Créer le compte admin :
     php scripts/make-admin-sql.php postgres
   → coller la requête dans SQL Editor
```

---

## Déploiement — Mise à jour d'une base existante

```bash
# MySQL
mysql -u USER -p NOM_BASE < database/mysql/migrations/001_inventory_evolution.sql

# PostgreSQL (Supabase SQL Editor)
# Coller le contenu de : database/postgres/migrations/001_inventory_evolution.sql
```

---

## Sécurité Supabase (RLS)

Toutes les tables ont **Row Level Security activé et 0 politique**.  
Conséquence : `anon` et `authenticated` n'ont **aucun accès** aux données métier.

Le backend PHP se connecte via la **connection string PostgreSQL directe** (variable `DATABASE_URL`), avec le rôle `service_role` ou un rôle dédié qui contourne le RLS.

```sql
-- Vérification (à coller en console Supabase) :
SELECT tablename, rowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policies
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;
-- Attendu : rowsecurity = true, policies = 0 sur toutes les tables
```

---

## Génération du compte admin

Le script `scripts/make-admin-sql.php` :

1. **Ne stocke rien sur disque** (la requête est affichée dans le terminal)
2. Cache la saisie du mot de passe (Unix) ou avertit (Windows)
3. Génère un UUID v4, un hash bcrypt coût 12
4. Produit une requête `INSERT … ON CONFLICT/DUPLICATE KEY UPDATE` idempotente

```bash
# MySQL
php scripts/make-admin-sql.php mysql

# PostgreSQL
php scripts/make-admin-sql.php postgres
```

---

## Tables — Inventaire

| Table | Rôle |
|-------|------|
| `inventory_items` | Articles inventoriés |
| `stock_movements` | Journal immuable (append-only) |
| `inventory_periods` | Périodes de comptage physique (clé : `year_month`) |
| `inventory_counts` | Comptages physiques par période |
| `period_items` | Instantanés de clôture (opening/entries/exits/closing) |

---

## Tables — Relances WhatsApp

| Table | Rôle |
|-------|------|
| `client_reminders` | Traçabilité honnête : `opened → confirmed / cancelled` |
| `reminder_templates` | Modèles de messages texte brut (variables `{responsable}`, `{structure}`) |
| `relance_logs` | Historique des anciennes relances e-mail (conservé) |

---

## Versions

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | Oct 2026 | Schéma initial MySQL |
| 2.0 | Oct 2026 | Dual-engine MySQL+PostgreSQL, correction divergences inventaire, warning_note, establishment_type, status pending |

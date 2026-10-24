# CYM Pharma — Guide de déploiement : o2switch (Production)

> **Objectif** : Mise en production sur o2switch avec le même code que le test
> InfinityFree. Seule la configuration (`env.php` et `VITE_API_URL`) change.

---

## Prérequis

- Compte o2switch actif avec cPanel
- Domaine `cympharma.ci` ou sous-domaine configuré
- Certificat SSL Let's Encrypt activé (disponible dans cPanel → SSL/TLS)
- PHP 8.1+ sélectionné dans cPanel → **MultiPHP Manager**
- Accès FTP ou gestionnaire de fichiers cPanel

---

## Étape 1 — Préparer le build front-end

```bash
# À la racine du projet, en local
cp .env.example .env.production
# Éditer .env.production :
#   VITE_API_URL=https://www.cympharma.ci/api

npm run build
# dist/ est prêt pour la mise en ligne
```

---

## Étape 2 — Base de données MySQL sur o2switch

1. **cPanel → MySQL® Databases**
   - Créer une base : `cympharma_prod` (ou selon les conventions o2switch)
   - Créer un utilisateur dédié avec un mot de passe fort
   - Assigner l'utilisateur à la base avec **Tous les privilèges**

2. **Importer le schéma** via cPanel → phpMyAdmin :
   - Sélectionner la base → Onglet **Import**
   - Choisir `database/schema.sql` → Exécuter

3. **Générer le hash admin** (sur le serveur ou en local) :

```php
<?php
// À exécuter UNE seule fois via SSH ou un script PHP temporaire
echo password_hash('VotreMotDePasseForce!', PASSWORD_BCRYPT, ['cost' => 12]);
```

4. Mettre à jour `database/seeds/admin.sql` avec le hash, puis importer via phpMyAdmin.

---

## Étape 3 — Configurer le backend PHP

Créer `api/config/env.php` **localement** (ne jamais versionner) :

```php
<?php
return [
    'env'   => 'production',
    'debug' => false,
    'db'    => [
        'host'   => 'localhost',           // toujours 'localhost' sur o2switch
        'port'   => 3306,
        'dbname' => 'cympharma_prod',      // ← votre nom de base
        'user'   => 'cympharma_usr',       // ← votre utilisateur MySQL
        'pass'   => 'MotDePasseForce!!!',  // ← votre mot de passe MySQL
        'charset'=> 'utf8mb4',
    ],
    'jwt'   => [
        'secret'    => 'GENERER_AVEC_openssl_rand_hex_64',
        'expiry'    => 86400,
        'algorithm' => 'HS256',
    ],
    'mail'  => [
        'driver'     => 'smtp',            // ← 'smtp' en production
        'from_email' => 'contact@cympharma.ci',
        'from_name'  => 'CYM Pharma',
        'smtp_host'  => 'ssl0.ovh.net',    // ← SMTP o2switch
        'smtp_port'  => 587,
        'smtp_user'  => 'contact@cympharma.ci',
        'smtp_pass'  => 'MotDePasseMail!',
        'smtp_tls'   => true,
    ],
    'cors'  => [
        'allowed_origins' => 'https://www.cympharma.ci,https://cympharma.ci',
        'allowed_methods' => 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'allowed_headers' => 'Content-Type,Authorization,X-Requested-With',
    ],
    'security' => [
        'max_login_attempts' => 5,
        'lockout_minutes'    => 15,
        'bcrypt_cost'        => 12,
    ],
];
```

> 💡 **Générer le secret JWT** :
> ```bash
> openssl rand -hex 64
> ```

---

## Étape 4 — Upload des fichiers

### Via cPanel — Gestionnaire de fichiers ou FTP

Structure dans `public_html/` (racine du domaine) :

```
public_html/
├── index.html          ← dist/index.html
├── assets/             ← dist/assets/
├── .htaccess           ← public/.htaccess (SPA routing + sécurité)
└── api/
    ├── .htaccess       ← api/.htaccess
    ├── config/
    │   ├── env.php     ← FICHIER LOCAL, ne pas versionner
    │   └── bootstrap.php
    ├── index.php
    └── ...
```

**Via FTP (FileZilla) :**

| Paramètre | Valeur |
|-----------|--------|
| Hôte | `ftp.cympharma.ci` ou IP fournie par o2switch |
| Identifiant | Votre login cPanel |
| Mot de passe | Votre mot de passe cPanel |
| Port | 21 (FTP) ou 22 (SFTP recommandé) |

---

## Étape 5 — Configuration PHP via cPanel

1. **MultiPHP Manager** → Sélectionner PHP 8.1 ou 8.2 pour le domaine
2. **MultiPHP INI Editor** → Vérifier / ajuster :
   ```
   upload_max_filesize = 10M
   post_max_size = 12M
   max_execution_time = 60
   memory_limit = 256M
   ```
3. Vérifier que `mod_rewrite` est activé (o2switch : oui par défaut)

---

## Étape 6 — SSL

1. cPanel → **Let's Encrypt SSL** → Installer sur `cympharma.ci` et `www.cympharma.ci`
2. Vérifier la redirection HTTPS (ajouter au `.htaccess` racine si non automatique) :

```apache
<IfModule mod_rewrite.c>
  RewriteCond %{HTTPS} off
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
```

---

## Étape 7 — Vérifications post-déploiement

- [ ] `https://www.cympharma.ci` → page d'accueil
- [ ] `https://www.cympharma.ci/api/health` → `{"success":true}`
- [ ] Connexion admin fonctionne
- [ ] Catalogue produits visible
- [ ] Passage de commande → email de confirmation reçu
- [ ] Module inventaire admin → données chargées
- [ ] HTTPS actif, aucune ressource HTTP mixte

---

## Checklist de pré-production

| # | Vérification | Statut |
|---|-------------|--------|
| 1 | `debug: false` dans env.php | ☐ |
| 2 | JWT secret long et aléatoire (≥ 64 chars) | ☐ |
| 3 | Mot de passe admin changé après premier login | ☐ |
| 4 | SMTP configuré et email de test reçu | ☐ |
| 5 | Schéma SQL importé sans erreur | ☐ |
| 6 | SSL actif sur www et non-www | ☐ |
| 7 | `.htaccess` bien uploadé (SPA routing fonctionnel) | ☐ |
| 8 | Aucun fichier `env.php` versionné dans git | ☐ |
| 9 | `node_modules/`, `backend/`, `data/*.json` exclus du déploiement | ☐ |
| 10 | Test de confidentialité : aucune donnée stock exposée côté client | ☐ |

---

## Avantages o2switch vs InfinityFree

| | InfinityFree (Test) | o2switch (Prod) |
|-|---------------------|-----------------|
| Fiabilité | Moyenne | Excellente |
| PHP | 8.1+ | 8.1+ / 8.2 |
| Cron jobs | ❌ | ✅ |
| Email SMTP | Limité | ✅ Illimité |
| Support | Forum | 24/7 FR |
| SSL | Let's Encrypt | Let's Encrypt |
| Bases MySQL | 1 | Illimitées |

# CYM Pharma — Guide de déploiement : InfinityFree (Test)

> **Objectif** : Déployer le site sur InfinityFree pour valider le comportement
> en hébergement mutualisé avant la mise en production sur o2switch.
> Le code est **identique** — seule la configuration change.

---

## Prérequis

- Compte InfinityFree créé sur [infinityfree.net](https://infinityfree.net)
- Sous-domaine ou domaine propre configuré
- Accès FTP (FileZilla ou équivalent)
- PHP 8.1+ activé sur l'hébergement *(vérifier dans le panneau InfinityFree)*
- MySQL disponible *(InfinityFree en fournit un)*

---

## Étape 1 — Préparer le build front-end

```bash
# À la racine du projet, en local
cp .env.example .env.local
# Éditer .env.local :
#   VITE_API_URL=https://votre-sous-domaine.infinityfreeapp.com/api

npm run build
# Le dossier dist/ est généré
```

---

## Étape 2 — Configurer la base de données

1. Dans le panneau InfinityFree → **MySQL Databases** → Créer une base `cym_pharma`
2. Notez : `host`, `dbname`, `user`, `password`
3. Importer le schéma via **phpMyAdmin** :
   - Ouvrir phpMyAdmin → Sélectionner la base
   - Onglet **Import** → choisir `database/schema.sql` → Exécuter
4. Générer le hash du premier admin en PHP :

```php
<?php
// hash_admin.php — exécuter une seule fois, puis supprimer
echo password_hash('VotreMotDePasse!', PASSWORD_BCRYPT, ['cost' => 12]);
```

5. Mettre à jour `database/seeds/admin.sql` avec le hash généré
6. Importer `database/seeds/admin.sql` via phpMyAdmin

---

## Étape 3 — Configurer le backend PHP

Créer `api/config/env.php` à partir du modèle :

```php
<?php
return [
    'env'   => 'test',
    'debug' => false,
    'db'    => [
        'host'   => 'sqlXXX.epizy.com',     // ← host fourni par InfinityFree
        'port'   => 3306,
        'dbname' => 'epiz_XXXXX_cym_pharma',
        'user'   => 'epiz_XXXXX',
        'pass'   => 'votre_mot_de_passe',
        'charset'=> 'utf8mb4',
    ],
    'jwt'   => [
        'secret'    => 'une-chaine-aleatoire-de-64-caracteres-minimum',
        'expiry'    => 86400,
        'algorithm' => 'HS256',
    ],
    'mail'  => [
        'driver'     => 'log',   // les mails s'écrivent dans logs/mail.log
        'from_email' => 'contact@cympharma.ci',
        'from_name'  => 'CYM Pharma',
        'smtp_host'  => '',
        'smtp_port'  => 587,
        'smtp_user'  => '',
        'smtp_pass'  => '',
        'smtp_tls'   => true,
    ],
    'cors'  => [
        'allowed_origins' => 'https://votre-sous-domaine.infinityfreeapp.com',
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

> ⚠️ **Ne jamais versionner ce fichier** — il contient des secrets.

---

## Étape 4 — Upload via FTP

Structure cible sur InfinityFree (`htdocs/`) :

```
htdocs/
├── index.html          ← depuis dist/
├── assets/             ← depuis dist/assets/
├── .htaccess           ← depuis public/.htaccess
└── api/                ← dossier backend PHP complet
    ├── .htaccess       ← depuis api/.htaccess
    ├── config/
    │   ├── env.php     ← CRÉÉ LOCALEMENT, ne pas versionner
    │   └── bootstrap.php
    ├── index.php       ← routeur PHP
    └── ...             ← autres endpoints
```

**Via FileZilla :**
1. Hôte : `ftpXXX.epizy.com` (fourni dans le panneau InfinityFree)
2. Uploader `dist/*` → `htdocs/`
3. Uploader `public/.htaccess` → `htdocs/.htaccess`
4. Uploader `api/` → `htdocs/api/`
5. Uploader `api/config/env.php` (local, non versionné) → `htdocs/api/config/env.php`

---

## Étape 5 — Vérifications

- [ ] `https://votre-sous-domaine.infinityfreeapp.com` → page d'accueil React
- [ ] `https://votre-sous-domaine.infinityfreeapp.com/api/health` → `{"success":true}`
- [ ] Connexion admin fonctionne
- [ ] Catalogue de produits s'affiche
- [ ] Passage de commande fonctionne
- [ ] Module inventaire admin accessible

---

## Limites InfinityFree à connaître

| Limite | Valeur |
|--------|--------|
| Espace disque | 5 GB |
| Bande passante | Illimitée (avec restrictions) |
| PHP | 8.1+ ✅ |
| MySQL | 1 base incluse |
| Cron jobs | Non disponible (utiliser une solution externe) |
| Envoi d'emails SMTP | Non garanti — utiliser `driver=log` en test |
| SSL | Let's Encrypt gratuit ✅ |

---

## En cas de problème

- **Erreur 500** : Vérifier que `env.php` est bien uploadé et syntaxiquement correct
- **API inaccessible** : Vérifier que `mod_rewrite` est activé (`.htaccess` bien uploadé)
- **Connexion échoue** : Vérifier les credentials db dans `env.php`
- **CORS error** : Vérifier `cors.allowed_origins` dans `env.php`

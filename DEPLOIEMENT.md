# CYM Pharma — Runbook de Deploiement Production

Architecture cible :
- Frontend  : React + TypeScript + Vite -> InfinityFree (dist/ -> htdocs/)
- Backend   : Node.js + Express -> Render (src/server/index.ts)
- DB + Auth : Supabase PostgreSQL + RLS

---

## ETAPE 1 — Supabase : Base de donnees

### 1.1. Creer le projet Supabase
- supabase.com -> New Project -> region Europe West
- Notez : Project URL, anon key, service_role key (Settings -> API)

### 1.2. Schema complet
SQL Editor -> New query -> coller supabase/full_schema_setup.sql -> Run

### 1.3. Seed catalogue produits
SQL Editor -> New query -> coller supabase/seed.sql -> Run

### 1.4. Creer le compte Administrateur (JAMAIS via le formulaire public)
1. Dashboard -> Authentication -> Users -> Add user
   Email : admin@cympharma.ci  |  Mot de passe : (fort, 20+ car.)
2. Notez l'UUID
3. SQL Editor -> coller database/seeds/admin.postgres.sql
   Remplacez VOTRE_UUID_ICI et votre-email@domaine.com -> Run

---

## ETAPE 2 — Render : Backend Express

### 2.1. Nouveau Web Service
- render.com -> New -> Web Service -> connecter le depot GitHub (`juniorchrist/cym-pharma`)
- Branche : main

### 2.2. Configuration du service
  Build Command : npm install && npm run build:server
  Start Command : npm run start:server
  Runtime       : Node

### 2.3. Variables d'environnement Render (Dashboard > Environment)
  SUPABASE_URL              = https://kjinefurrybmwcltvqfr.supabase.co
  SUPABASE_SERVICE_ROLE_KEY = sb_secret_... (votre clé secrète service_role Supabase)
  VITE_FRONTEND_URL         = https://cympharma.infinityfreeapp.com
  PORT                      = 4000
  WHATSAPP_ADMIN_PHONE_1    = 2250707079746
  WHATSAPP_ADMIN_PHONE_2    = 2250707729846

Verification : GET https://cym-pharma.onrender.com/api/health
-> {"success":true,"status":"ok","db":true,"server":"CYM Pharma API v2.0 (Render)"}

---

## ETAPE 3 — Build Frontend

Le fichier `.env.production` est configuré avec :
  VITE_SUPABASE_URL=https://kjinefurrybmwcltvqfr.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_P-HSrZohnqSPHE-jQSoNIw_QaLjWmcE
  VITE_API_URL=https://cym-pharma.onrender.com/api

Compilation de production :
  npm run build
-> Génère le dossier `dist/` complet optimisé pour InfinityFree.

Puis : npm run build
-> bundle genere dans dist/

---

## ETAPE 4 — InfinityFree : Frontend

1. infinityfree.com -> Create Account -> domaine (ex: cympharma.infinityfreeapp.com)
2. Control Panel -> Files -> Online File Manager -> htdocs/
3. Uploader tout le contenu de dist/ dans htdocs/

Le fichier .htaccess gere :
- Routing React SPA (toutes URLs -> index.html)
- Options -Indexes (bloque le listing de repertoire)

---

## ETAPE 5 — Checklist de verification

Backend (Render)
  [ ] GET /api/health -> success: true, db: true
  [ ] POST /api/orders avec items -> commande dans Supabase
  [ ] POST /api/contact -> message dans contact_messages
  [ ] Token non-admin -> 403 Forbidden

Base de donnees (Supabase)
  [ ] profiles : admin avec role = admin
  [ ] categories : ~60 categories seedees
  [ ] products : catalogue seedé
  [ ] Vue public_products : pas de ref_price ni price
  [ ] Fonction create_order_atomic : executable

Frontend (InfinityFree)
  [ ] Page accueil charge sans erreur
  [ ] Catalogue produits visible
  [ ] Login client -> /dashboard
  [ ] Cadenas footer -> modal login email+password (pas de bypass)
  [ ] Soumission commande -> apparait chez l'admin
  [ ] Formulaire contact -> Supabase contact_messages

Securite
  [ ] /admin sans session -> /connexion
  [ ] role admin ne peut pas etre auto-attribue (trigger protect_profile_role)
  [ ] service_role absent du bundle JS : grep -r "service_role" dist/
  [ ] robots.txt accessible

---

## WhatsApp — Fonctionnement

L'integration actuelle est manuelle et conforme aux regles Meta :
1. A chaque commande, le serveur Render logue l'URL wa.me pre-remplie dans la console
2. La log est persistee dans relance_logs (channel = whatsapp_auto)
3. L'admin ouvre l'URL et envoie le message manuellement depuis son telephone

Pour l'API Business Cloud officielle (envoi automatise) :
- Compte Meta Business verifie requis
- Templates de message approuves
- Configurer WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN dans Render

---

## Mise a jour (CI/CD manuel)

  npm run build
  # Re-uploader dist/ sur InfinityFree (FTP ou File Manager)
  # Backend Render se redeploit automatiquement sur push GitHub

---
Genere 2026-10-29 — CYM Pharma B2B Cote d'Ivoire

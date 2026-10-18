# CYM Pharma — Dispositifs Médicaux & Équipements B2B Côte d'Ivoire

Plateforme B2B moderne pour la commande, le chiffrage et le suivi logistique de dispositifs médicaux et consommables hospitaliers en Côte d'Ivoire (Abidjan et intérieur du pays).

---

## 🌟 Fonctionnalités Clés

- **Catalogue Médical B2B Complet** : Plus de 500 références certifiées CE / ISO 13485 (consommables, diagnostic, protection, blocs opératoires, perfusion, stérilisation) avec recherche temps réel et filtrage multicritères.
- **Facturation Officielle A4 sur Page Unique** : Génération de factures conformes à l'Art. 355 du CGI de Côte d'Ivoire avec mise en page adaptative garantissant la tenue sur 1 seule feuille A4 imprimable / PDF même pour plus de 30 articles.
- **Bons de Livraison Officiels** : Visualisation et export PDF de bons de livraison certifiés avec traçabilité par lot.
- **Navigation Responsive Optimisée (Mobile, Tablette & Desktop)** :
  - Barre de navigation basse flottante (`BottomNav`) avec indicateur coulissant et accès direct : *Accueil*, *Catalogue*, *Racheter* (avec défilement fluide vers le réapprovisionnement), *Commandes*, *Suivi*.
  - En-tête mobile et tablette avec recherche intégrée, badge de panier en temps réel et feuille de compte (`AccountSheet`).
  - Effet de flou d'arrière-plan (`backdrop-blur-md`) sur mobile lors de l'ouverture du menu latéral administrateur.
- **Tableau de Bord Client Sécurisé** : Vue d'ensemble, historique des commandes, réapprovisionnement rapide en 1 clic, suivi des expéditions en direct avec timeline.
- **Hub d'Administration B2B** : Supervision des stocks, chiffrage des commandes entrantes, gestion des clients et relances automatiques pour les comptes inactifs.

---

## 🛠️ Stack Technique

- **Frontend** : React 19, TypeScript, Vite
- **Styling** : Tailwind CSS, CSS Custom Properties (Design System Médical CYM Pharma)
- **Icônes** : Lucide React
- **Gestion d'état** : React Context (Auth, Cart, Toast)
- **Routage** : React Router DOM 7
- **Données & Backend** : Moteur TypeScript embarqué autonome avec persistance locale sécurisée (`localStorage`) sans dépendance bloquante envers des variables d'environnement externes.

---

## 🚀 Démarrage Rapide

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée)
- `npm` ou `yarn` / `bun`

### Installation
```bash
# Cloner le dépôt
git clone <URL_DU_DEPOT_GITHUB>
cd cym-pharma-b2b

# Installer les dépendances
npm install
```

### Lancement en Développement
```bash
npm run dev
```
L'application démarre immédiatement sur [http://localhost:3000](http://localhost:3000) (ou le port spécifié).

### Compilation pour la Production
```bash
npm run build
```
Les fichiers statiques optimisés sont générés dans le dossier `dist/`.

---

## 📁 Structure du Projet

```
├── public/                 # Assets statiques publics (logos, images, favicon)
├── src/
│   ├── assets/             # Images et icônes
│   ├── components/         # Composants réutilisables
│   │   ├── admin/          # Composants du tableau de bord admin
│   │   ├── cart/           # Panier latéral interactif
│   │   ├── layout/         # Navbar, BottomNav, PageShell, Footer, FloatingActions
│   │   ├── product/        # Cartes produits, grilles et fallbacks
│   │   └── ui/             # Composants d'interface (EmptyState, LoadingState, etc.)
│   ├── context/            # Contextes React (Auth, Panier, Notifications Toast)
│   ├── data/               # Base de données du catalogue médical (ALL_PRODUCTS, catégories)
│   ├── hooks/              # Hooks personnalisés (useReveal, useScrolled, useBottomNavHidden)
│   ├── pages/              # Pages principales (Accueil, Catalogue, Commande, Facture, Admin, Dashboard)
│   ├── routes/             # Gardes de routes (ProtectedRoute, AdminRoute, PublicOnlyRoute)
│   ├── server/             # Moteur de données backend CYM Pharma
│   ├── services/           # Couche de services API
│   ├── types/              # Définitions TypeScript globales
│   └── utils/              # Utilitaires (formatage de devises FCFA, stockage local, dates)
├── index.html              # Point d'entrée HTML
├── package.json            # Dépendances et scripts
├── tailwind.config.js      # Configuration Tailwind
├── tsconfig.json           # Configuration TypeScript
└── vite.config.ts          # Configuration du bundler Vite
```

---

## 📄 Licence & Propriété

© CYM PHARMA SARL — Cocody Riviera 3, Abidjan, Côte d'Ivoire. Tous droits réservés.

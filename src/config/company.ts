/**
 * src/config/company.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Source de vérité unique pour toutes les données institutionnelles de CYM Pharma.
 * Ne jamais dupliquer ces informations ailleurs dans le code.
 *
 * RÈGLES :
 *  - Aucune certification non prouvée (CE, ISO 13485, ANSM, AIRP, UEMOA…).
 *  - Toute modification ici se propage automatiquement dans tout le site.
 *  - Les coordonnées sont les vraies coordonnées de l'entreprise.
 */

export const COMPANY = {
  name: 'CYM Pharma',
  legalName: 'CYM Pharma SARL',
  tagline: 'Dispositifs médicaux & équipements B2B — Côte d\'Ivoire',
  description:
    'Fournisseur B2B de matériels et consommables médicaux pour les professionnels de santé en Côte d\'Ivoire.',

  // ── Contact ──
  email: 'contact@cympharma.ci',
  emailAdmin: 'admin@cympharma.ci',
  phone: '+225 07 00 00 00 00',    // ← à mettre à jour avec le vrai numéro
  phone2: '',

  // ── Adresse ──
  address: 'Abidjan, Côte d\'Ivoire',
  city: 'Abidjan',
  country: 'Côte d\'Ivoire',
  countryCode: 'CI',

  // ── Présence web ──
  website: 'https://www.cympharma.ci',
  linkedin: '',
  whatsapp: '',

  // ── Identité visuelle ──
  primaryColor: '#0e9f6e',
  currency: 'FCFA',
  locale: 'fr-CI',

  // ── Mentions légales ──
  registrationNumber: '',   // RCCM à compléter
  taxId: '',                // NCC à compléter

  // ── Certifications prouvées uniquement ──
  // N'ajouter ici que les certifications documentées, vérifiables et obtenues.
  certifications: [] as string[],
} as const;

export type CompanyConfig = typeof COMPANY;

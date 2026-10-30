const fs = require('fs');
const path = require('path');

const base = path.resolve('.');

const header = [
  '-- =====================================================================',
  '-- CYM PHARMA -- SUPABASE : SCHEMA COMPLET (setup unique)',
  '-- supabase/full_schema_setup.sql',
  '-- =====================================================================',
  '-- Généré automatiquement depuis les migrations supabase/migrations/',
  '-- Ce fichier = unique fichier SQL à coller dans le SQL Editor Supabase',
  '-- pour initialiser l\'intégralité de la base de données de production.',
  '-- Comprend : Tables, Triggers auth, Vues publiques, Politiques RLS, Module Inventaire et Relances.',
  '-- Génération : ' + new Date().toISOString(),
  '-- =====================================================================',
  '',
].join('\n');

const migrationsDir = path.join(base, 'supabase', 'migrations');
const migrationFiles = [
  '20261024000001_initial_schema.sql',
  '20261024000002_inventory_module.sql',
  '20261024000003_rls_security_policies.sql',
  '20261024000004_whatsapp_support.sql',
  '20261024000005_client_reminders.sql',
  '20261030000001_fix_grants_and_rls_401.sql',
];

const sep = function (title) {
  return '\n\n-- =====================================================================\n-- ' + title + '\n-- =====================================================================\n\n';
};

let full = header;

migrationFiles.forEach((file) => {
  const filePath = path.join(migrationsDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    full += sep('MIGRATION : ' + file) + content;
  }
});

const outPath = path.join(base, 'supabase', 'full_schema_setup.sql');
fs.writeFileSync(outPath, full, { encoding: 'utf8' });
console.log('OK -- supabase/full_schema_setup.sql régénéré avec succès (' + Buffer.byteLength(full, 'utf8') + ' octets)');

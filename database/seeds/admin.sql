-- =====================================================================
-- CYM PHARMA — Seed : premier compte administrateur
-- database/seeds/admin.sql
-- =====================================================================
-- Ce fichier crée le premier compte admin.
-- IMPORTANT : Changer le mot de passe après la première connexion.
--
-- Le hash ci-dessous correspond au mot de passe temporaire : CymPharma2025!
-- Généré avec : password_hash('CymPharma2025!', PASSWORD_BCRYPT, ['cost'=>12])
--
-- Pour regénérer un hash :
--   php -r "echo password_hash('VOTRE_MDP', PASSWORD_BCRYPT, ['cost'=>12]);"
--
-- ATTENTION : Ce fichier ne doit PAS être exécuté en production si le compte
-- admin existe déjà (INSERT IGNORE évite les doublons).
-- =====================================================================

INSERT IGNORE INTO `users` (
  `id`,
  `email`,
  `password_hash`,
  `role`,
  `name`,
  `first_name`,
  `last_name`,
  `status`,
  `created_at`
) VALUES (
  'admin_001',
  'admin@cympharma.ci',
  '$2y$12$REMPLACER_PAR_UN_VRAI_HASH_BCRYPT_GENERE_EN_LOCAL',
  'admin',
  'Administrateur CYM Pharma',
  'Admin',
  'CYM',
  'active',
  NOW()
);

-- =====================================================================
-- Pour regénérer le hash en PHP (à exécuter sur le serveur) :
-- =====================================================================
-- <?php
-- $password = 'VotreNouveauMotDePasse!';
-- echo password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
-- =====================================================================

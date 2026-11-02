-- =====================================================================
-- CYM PHARMA — MIGRATION MYSQL 002 : STATUTS COMMANDES ET PRÉSENCE UTILISATEURS
-- database/mysql/migrations/002_order_status_and_presence.sql
-- =====================================================================

-- 1. Normalisation des statuts de commande
ALTER TABLE orders
  MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending_quote';

-- 2. Colonnes de présence sur la table users (InfinityFree / MySQL)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL;

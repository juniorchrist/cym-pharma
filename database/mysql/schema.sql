-- =====================================================================
-- CYM PHARMA — SCHÉMA CANONIQUE MySQL/MariaDB
-- database/mysql/schema.sql
-- Version : 2.0 — Source de vérité pour o2switch (production) et
--           InfinityFree (test). Compatible MySQL 5.7+ et MariaDB 10.x.
-- =====================================================================
-- Ce fichier définit l'état complet d'une installation neuve.
-- Les migrations dans mysql/migrations/ ne servent qu'à faire évoluer
-- une base EXISTANTE (ALTER TABLE, etc.).
-- Ordre d'exécution sur une base vide :
--   1. mysql/schema.sql
--   2. mysql/migrations/NNN_*.sql  (dans l'ordre numérique)
--   3. seeds/admin.mysql.sql
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────
-- 0. SUIVI DES MIGRATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version`    VARCHAR(20)  NOT NULL PRIMARY KEY,
  `name`       VARCHAR(255) NOT NULL,
  `applied_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 1. UTILISATEURS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`                    VARCHAR(64)  NOT NULL PRIMARY KEY,
  `email`                 VARCHAR(191) NOT NULL,
  `password_hash`         VARCHAR(255) NOT NULL,
  `role`                  VARCHAR(20)  NOT NULL DEFAULT 'client',
  `name`                  VARCHAR(191) DEFAULT NULL,
  `first_name`            VARCHAR(100) DEFAULT NULL,
  `last_name`             VARCHAR(100) DEFAULT NULL,
  `phone`                 VARCHAR(30)  DEFAULT NULL,
  `establishment_name`    VARCHAR(191) DEFAULT NULL,
  `establishment_type`    VARCHAR(100) DEFAULT NULL,
  `commune`               VARCHAR(100) DEFAULT NULL,
  `address`               TEXT         DEFAULT NULL,
  `org`                   VARCHAR(191) DEFAULT NULL,
  `status`                VARCHAR(20)  NOT NULL DEFAULT 'pending',
  `email_verified_at`     DATETIME     DEFAULT NULL,
  `last_login_at`         DATETIME     DEFAULT NULL,
  `last_order_at`         DATETIME     DEFAULT NULL,
  `last_reminder_at`      DATETIME     DEFAULT NULL,
  `failed_login_attempts` SMALLINT     NOT NULL DEFAULT 0,
  `locked_until`          DATETIME     DEFAULT NULL,
  `created_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_users_role`   CHECK (`role`   IN ('admin','client')),
  CONSTRAINT `chk_users_status` CHECK (`status` IN ('active','inactive','suspended','pending')),
  UNIQUE KEY  `uq_users_email`  (`email`),
  INDEX `idx_users_role`        (`role`),
  INDEX `idx_users_status`      (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 2. CATÉGORIES DE PRODUITS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `slug`       VARCHAR(100) NOT NULL UNIQUE,
  `name`       VARCHAR(191) NOT NULL,
  `parent_id`  INT UNSIGNED DEFAULT NULL,
  `sort_order` SMALLINT     NOT NULL DEFAULT 0,
  `is_active`  SMALLINT     NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chk_cat_active` CHECK (`is_active` IN (0,1)),
  FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
  INDEX `idx_cat_slug`   (`slug`),
  INDEX `idx_cat_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 3. PRODUITS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `products` (
  `id`              VARCHAR(64)   NOT NULL PRIMARY KEY,
  `reference`       VARCHAR(100)  NOT NULL UNIQUE,
  `name`            VARCHAR(255)  NOT NULL,
  `description`     TEXT          DEFAULT NULL,
  `category`        VARCHAR(191)  DEFAULT NULL,
  `category_main`   VARCHAR(100)  DEFAULT NULL,
  `unit`            VARCHAR(50)   DEFAULT 'Unité',
  `conditionnement` VARCHAR(100)  DEFAULT NULL,
  `ref_price`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `price`           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `currency`        VARCHAR(10)   NOT NULL DEFAULT 'FCFA',
  `is_active`       SMALLINT      NOT NULL DEFAULT 1,
  `is_published`    SMALLINT      NOT NULL DEFAULT 0,
  `image_url`       VARCHAR(500)  DEFAULT NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_prod_active`    CHECK (`is_active`    IN (0,1)),
  CONSTRAINT `chk_prod_published` CHECK (`is_published` IN (0,1)),
  INDEX `idx_prod_ref`      (`reference`),
  INDEX `idx_prod_category` (`category_main`),
  INDEX `idx_prod_active`   (`is_active`, `is_published`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 4. COMMANDES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `orders` (
  `id`                  VARCHAR(64)   NOT NULL PRIMARY KEY,
  `order_number`        VARCHAR(50)   NOT NULL UNIQUE,
  `user_id`             VARCHAR(64)   DEFAULT NULL,
  `establishment_name`  VARCHAR(191)  DEFAULT NULL,
  `shipping_address`    TEXT          DEFAULT NULL,
  `shipping_city`       VARCHAR(100)  DEFAULT NULL,
  `status`              VARCHAR(100)  NOT NULL DEFAULT 'En attente de devis',
  `notes`               TEXT          DEFAULT NULL,
  `subtotal`            DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total`               DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `currency`            VARCHAR(10)   NOT NULL DEFAULT 'FCFA',
  `invoice_number`      VARCHAR(50)   DEFAULT NULL,
  `invoice_date`        DATETIME      DEFAULT NULL,
  `priced_at`           DATETIME      DEFAULT NULL,
  `shipped_at`          DATETIME      DEFAULT NULL,
  `delivered_at`        DATETIME      DEFAULT NULL,
  `cancelled_at`        DATETIME      DEFAULT NULL,
  `cancel_reason`       TEXT          DEFAULT NULL,
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_orders_user`   (`user_id`),
  INDEX `idx_orders_status` (`status`),
  INDEX `idx_orders_number` (`order_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 5. LIGNES DE COMMANDE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id`   VARCHAR(64)     NOT NULL,
  `product_id` VARCHAR(64)     DEFAULT NULL,
  `reference`  VARCHAR(100)    DEFAULT NULL,
  `name`       VARCHAR(255)    NOT NULL,
  `unit`       VARCHAR(50)     DEFAULT 'Unité',
  `quantity`   INT             NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  `currency`   VARCHAR(10)     NOT NULL DEFAULT 'FCFA',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  INDEX `idx_oi_order`   (`order_id`),
  INDEX `idx_oi_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 6. HISTORIQUE DES STATUTS DE COMMANDE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_status_history` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id`   VARCHAR(64)     NOT NULL,
  `status`     VARCHAR(100)    NOT NULL,
  `note`       TEXT            DEFAULT NULL,
  `changed_by` VARCHAR(64)     DEFAULT NULL,
  `changed_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  INDEX `idx_osh_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 7. BONS DE LIVRAISON
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `delivery_notes` (
  `id`           VARCHAR(64) NOT NULL PRIMARY KEY,
  `order_id`     VARCHAR(64) NOT NULL UNIQUE,
  `bl_number`    VARCHAR(50) NOT NULL UNIQUE,
  `issued_at`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivered_at` DATETIME    DEFAULT NULL,
  `notes`        TEXT        DEFAULT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 8. MESSAGES DE CONTACT
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(191)    NOT NULL,
  `email`      VARCHAR(191)    NOT NULL,
  `phone`      VARCHAR(30)     DEFAULT NULL,
  `org`        VARCHAR(191)    DEFAULT NULL,
  `subject`    VARCHAR(255)    DEFAULT NULL,
  `message`    TEXT            NOT NULL,
  `read_at`    DATETIME        DEFAULT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_contact_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 9. LOGS DE RELANCE HISTORIQUE (ancienne table e-mail — conservée)
-- Note : les nouvelles relances WhatsApp manuelles utilisent
--        client_reminders (section 12). relance_logs garde l'historique.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `relance_logs` (
  `id`                    VARCHAR(64)  NOT NULL PRIMARY KEY,
  `user_id`               VARCHAR(64)  DEFAULT NULL,
  `user_name`             VARCHAR(191) DEFAULT NULL,
  `establishment_name`    VARCHAR(191) DEFAULT NULL,
  `recipient_email`       VARCHAR(191) DEFAULT NULL,
  `recipient_phone`       VARCHAR(30)  DEFAULT NULL,
  `channel`               VARCHAR(50)  DEFAULT 'email',
  `subject`               VARCHAR(255) DEFAULT NULL,
  `message`               TEXT         DEFAULT NULL,
  `trigger_reason`        TEXT         DEFAULT NULL,
  `days_since_last_order` INT          DEFAULT NULL,
  `status`                VARCHAR(20)  NOT NULL DEFAULT 'pending',
  `sent_at`               DATETIME     DEFAULT NULL,
  `created_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chk_rl_status` CHECK (`status` IN ('sent','failed','pending')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_relance_user`   (`user_id`),
  INDEX `idx_relance_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 10. MODULE INVENTAIRE — Articles
-- Structure canonique issue de 001_inventory.sql (journal immuable)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id`               VARCHAR(64)  NOT NULL PRIMARY KEY,
  `code`             VARCHAR(32)  NOT NULL UNIQUE,
  `designation`      VARCHAR(255) NOT NULL,
  `designation_norm` VARCHAR(255) NOT NULL,
  `unit_label`       VARCHAR(64)  DEFAULT 'Unité',
  `product_id`       VARCHAR(64)  DEFAULT NULL,
  `min_stock`        INT          DEFAULT 5,
  `is_tracked`       SMALLINT     NOT NULL DEFAULT 1,
  `qty_on_hand`      INT          NOT NULL DEFAULT 0,
  `is_active`        SMALLINT     NOT NULL DEFAULT 1,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_inv_tracked` CHECK (`is_tracked` IN (0,1)),
  CONSTRAINT `chk_inv_active`  CHECK (`is_active`  IN (0,1)),
  INDEX `idx_inv_code`       (`code`),
  INDEX `idx_inv_product_id` (`product_id`),
  INDEX `idx_inv_tracked`    (`is_tracked`),
  INDEX `idx_inv_active`     (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 11. MODULE INVENTAIRE — Mouvements de stock (journal append-only)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`            VARCHAR(64)  NOT NULL PRIMARY KEY,
  `item_id`       VARCHAR(64)  NOT NULL,
  `type`          VARCHAR(30)  NOT NULL,
  `quantity`      INT          NOT NULL,
  `movement_date` DATE         NOT NULL,
  `reason`        VARCHAR(255) DEFAULT NULL,
  `order_id`      VARCHAR(64)  DEFAULT NULL,
  `order_item_id` VARCHAR(64)  DEFAULT NULL,
  `period_id`     VARCHAR(64)  DEFAULT NULL,
  `created_by`    VARCHAR(100) NOT NULL DEFAULT 'Admin',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chk_sm_type` CHECK (`type` IN (
    'opening','purchase','sale_shop','sale_online',
    'return','loss','adjustment','count_correction'
  )),
  CONSTRAINT `fk_mvt_item` FOREIGN KEY (`item_id`)
    REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
  INDEX `idx_mvt_item_id` (`item_id`),
  INDEX `idx_mvt_type`    (`type`),
  INDEX `idx_mvt_date`    (`movement_date`),
  INDEX `idx_mvt_order`   (`order_id`, `order_item_id`),
  INDEX `idx_mvt_period`  (`period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 12. MODULE INVENTAIRE — Périodes (comptage mensuel)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `inventory_periods` (
  `id`         VARCHAR(64) NOT NULL PRIMARY KEY,
  `year_month` VARCHAR(7)  NOT NULL UNIQUE,        -- ex: '2026-10'
  `status`     VARCHAR(20) NOT NULL DEFAULT 'counting',
  `opened_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at`  DATETIME    DEFAULT NULL,
  `closed_by`  VARCHAR(100) DEFAULT NULL,
  CONSTRAINT `chk_per_status` CHECK (`status` IN ('open','counting','closed')),
  INDEX `idx_per_year_month` (`year_month`),
  INDEX `idx_per_status`     (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 13. MODULE INVENTAIRE — Comptages physiques
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `inventory_counts` (
  `id`            VARCHAR(64)  NOT NULL PRIMARY KEY,
  `period_id`     VARCHAR(64)  NOT NULL,
  `item_id`       VARCHAR(64)  NOT NULL,
  `theoretical_qty` INT        NOT NULL DEFAULT 0,
  `counted_qty`   INT          DEFAULT NULL,
  `variance`      INT          DEFAULT NULL,
  `note`          TEXT         DEFAULT NULL,
  `counted_by`    VARCHAR(100) DEFAULT NULL,
  `counted_at`    DATETIME     DEFAULT NULL,
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'draft',
  CONSTRAINT `chk_cnt_status` CHECK (`status` IN ('draft','validated','skipped')),
  UNIQUE KEY `uq_period_item` (`period_id`, `item_id`),
  CONSTRAINT `fk_cnt_period` FOREIGN KEY (`period_id`)
    REFERENCES `inventory_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cnt_item` FOREIGN KEY (`item_id`)
    REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
  INDEX `idx_cnt_period` (`period_id`),
  INDEX `idx_cnt_item`   (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 14. MODULE INVENTAIRE — Instantanés de clôture de période
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `period_items` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `period_id`    VARCHAR(64)  NOT NULL,
  `item_id`      VARCHAR(64)  NOT NULL,
  `opening_qty`  INT          NOT NULL DEFAULT 0,
  `entries`      INT          NOT NULL DEFAULT 0,
  `exits`        INT          NOT NULL DEFAULT 0,
  `closing_qty`  INT          NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_snap_period_item` (`period_id`, `item_id`),
  CONSTRAINT `fk_snap_period` FOREIGN KEY (`period_id`)
    REFERENCES `inventory_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_snap_item` FOREIGN KEY (`item_id`)
    REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
  INDEX `idx_snap_period` (`period_id`),
  INDEX `idx_snap_item`   (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 15. RELANCES MANUELLES WHATSAPP (traçabilité honnête)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `client_reminders` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id`      VARCHAR(64)  NOT NULL,
  `channel`      VARCHAR(32)  NOT NULL DEFAULT 'whatsapp_manuel',
  `template_key` VARCHAR(64)  NOT NULL,
  `opened_by`    VARCHAR(64)  NOT NULL,
  `opened_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` DATETIME     DEFAULT NULL,
  `status`       VARCHAR(20)  NOT NULL DEFAULT 'opened',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_cr_status` CHECK (`status` IN ('opened','confirmed','cancelled')),
  CONSTRAINT `fk_cr_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_cr_user_id`   (`user_id`),
  INDEX `idx_cr_status`    (`status`),
  INDEX `idx_cr_opened_at` (`opened_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 16. MODÈLES DE MESSAGES DE RELANCE (texte brut, sans emoji)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `reminder_templates` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `template_key` VARCHAR(64)  NOT NULL UNIQUE,
  `title`        VARCHAR(191) NOT NULL,
  `content`      TEXT         NOT NULL,
  `warning_note` TEXT         DEFAULT NULL,
  `is_default`   SMALLINT     NOT NULL DEFAULT 0,
  `sort_order`   INT          NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_rt_default` CHECK (`is_default` IN (0,1)),
  INDEX `idx_rt_key` (`template_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Amorçage des modèles de relance par défaut
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO `reminder_templates`
  (`template_key`, `title`, `content`, `warning_note`, `is_default`, `sort_order`)
VALUES
  ('reprise_contact',    'Reprise de contact',
   'Bonjour {responsable}, c''est CYM Pharma. Nous n''avons pas reçu de commande de {structure} depuis un moment. Avez-vous un besoin à nous confier ? Nous restons disponibles.',
   NULL, 1, 1),
  ('reapprovisionnement','Réapprovisionnement',
   'Bonjour {responsable}, c''est CYM Pharma. Souhaitez-vous que nous préparions un réapprovisionnement pour {structure} ? Dites-nous vos références.',
   NULL, 0, 2),
  ('espace_client',      'Votre espace client',
   'Bonjour {responsable}, c''est CYM Pharma. Votre espace client vous permet de commander et de suivre vos livraisons à tout moment. Besoin d''aide pour vous connecter ?',
   NULL, 0, 3),
  ('nouveautes',         'Nouveautés',
   'Bonjour {responsable}, c''est CYM Pharma. De nouvelles références sont disponibles dans notre catalogue. Souhaitez-vous que nous vous les présentions ?',
   'À utiliser uniquement si de nouvelles références réelles ont été ajoutées au catalogue.', 0, 4)
ON DUPLICATE KEY UPDATE
  `title`        = VALUES(`title`),
  `is_default`   = VALUES(`is_default`),
  `sort_order`   = VALUES(`sort_order`),
  `warning_note` = VALUES(`warning_note`);

-- ─────────────────────────────────────────────────────────────────────
-- Enregistrement de la version de schéma
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO `schema_migrations` (`version`, `name`)
VALUES ('2.0', 'schema_initial_canonique')
ON DUPLICATE KEY UPDATE `applied_at` = CURRENT_TIMESTAMP;

SET FOREIGN_KEY_CHECKS = 1;

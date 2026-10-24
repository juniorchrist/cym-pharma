-- =====================================================================
-- CYM PHARMA — SCHÉMA MySQL/MariaDB COMPLET
-- database/schema.sql
-- =====================================================================
-- Ce fichier définit UNIQUEMENT la structure (DDL).
-- Les données d'initialisation sont dans database/seeds/admin.sql.
-- Pour déployer : exécuter ce fichier, puis les seeds.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────
-- 1. UTILISATEURS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`                    VARCHAR(64)     NOT NULL PRIMARY KEY,
  `email`                 VARCHAR(191)    NOT NULL UNIQUE,
  `password_hash`         VARCHAR(255)    NOT NULL,
  `role`                  ENUM('admin','client') NOT NULL DEFAULT 'client',
  `name`                  VARCHAR(191)    DEFAULT NULL,
  `first_name`            VARCHAR(100)    DEFAULT NULL,
  `last_name`             VARCHAR(100)    DEFAULT NULL,
  `phone`                 VARCHAR(30)     DEFAULT NULL,
  `establishment_name`    VARCHAR(191)    DEFAULT NULL,
  `commune`               VARCHAR(100)    DEFAULT NULL,
  `address`               TEXT            DEFAULT NULL,
  `org`                   VARCHAR(191)    DEFAULT NULL,
  `status`                ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  `email_verified_at`     DATETIME        DEFAULT NULL,
  `last_login_at`         DATETIME        DEFAULT NULL,
  `last_order_at`         DATETIME        DEFAULT NULL,
  `failed_login_attempts` TINYINT(3)      NOT NULL DEFAULT 0,
  `locked_until`          DATETIME        DEFAULT NULL,
  `created_at`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_role`   (`role`),
  INDEX `idx_users_status` (`status`),
  INDEX `idx_users_email`  (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 2. CATÉGORIES DE PRODUITS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `slug`       VARCHAR(100)    NOT NULL UNIQUE,
  `name`       VARCHAR(191)    NOT NULL,
  `parent_id`  INT UNSIGNED    DEFAULT NULL,
  `sort_order` SMALLINT        NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
  INDEX `idx_cat_slug`   (`slug`),
  INDEX `idx_cat_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 3. PRODUITS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `products` (
  `id`               VARCHAR(64)     NOT NULL PRIMARY KEY,
  `reference`        VARCHAR(100)    NOT NULL UNIQUE,
  `name`             VARCHAR(255)    NOT NULL,
  `description`      TEXT            DEFAULT NULL,
  `category`         VARCHAR(191)    DEFAULT NULL,
  `category_main`    VARCHAR(100)    DEFAULT NULL,
  `unit`             VARCHAR(50)     DEFAULT 'Unité',
  `conditionnement`  VARCHAR(100)    DEFAULT NULL,
  `ref_price`        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `price`            DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `currency`         VARCHAR(10)     NOT NULL DEFAULT 'FCFA',
  `is_active`        TINYINT(1)      NOT NULL DEFAULT 1,
  `is_published`     TINYINT(1)      NOT NULL DEFAULT 1,
  `image_url`        VARCHAR(500)    DEFAULT NULL,
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_prod_ref`      (`reference`),
  INDEX `idx_prod_category` (`category_main`),
  INDEX `idx_prod_active`   (`is_active`, `is_published`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 4. COMMANDES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `orders` (
  `id`                   VARCHAR(64)     NOT NULL PRIMARY KEY,
  `order_number`         VARCHAR(50)     NOT NULL UNIQUE,
  `user_id`              VARCHAR(64)     DEFAULT NULL,
  `establishment_name`   VARCHAR(191)    DEFAULT NULL,
  `shipping_address`     TEXT            DEFAULT NULL,
  `shipping_city`        VARCHAR(100)    DEFAULT NULL,
  `status`               VARCHAR(100)    NOT NULL DEFAULT 'En attente de devis',
  `notes`                TEXT            DEFAULT NULL,
  `subtotal`             DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  `total`                DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  `currency`             VARCHAR(10)     NOT NULL DEFAULT 'FCFA',
  `invoice_number`       VARCHAR(50)     DEFAULT NULL,
  `invoice_date`         DATETIME        DEFAULT NULL,
  `priced_at`            DATETIME        DEFAULT NULL,
  `shipped_at`           DATETIME        DEFAULT NULL,
  `delivered_at`         DATETIME        DEFAULT NULL,
  `cancelled_at`         DATETIME        DEFAULT NULL,
  `cancel_reason`        TEXT            DEFAULT NULL,
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_orders_user`   (`user_id`),
  INDEX `idx_orders_status` (`status`),
  INDEX `idx_orders_number` (`order_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 5. LIGNES DE COMMANDE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id`     VARCHAR(64)     NOT NULL,
  `product_id`   VARCHAR(64)     DEFAULT NULL,
  `reference`    VARCHAR(100)    DEFAULT NULL,
  `name`         VARCHAR(255)    NOT NULL,
  `unit`         VARCHAR(50)     DEFAULT 'Unité',
  `quantity`     INT             NOT NULL DEFAULT 1,
  `unit_price`   DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `line_total`   DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  `currency`     VARCHAR(10)     NOT NULL DEFAULT 'FCFA',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  `id`          VARCHAR(64)     NOT NULL PRIMARY KEY,
  `order_id`    VARCHAR(64)     NOT NULL UNIQUE,
  `bl_number`   VARCHAR(50)     NOT NULL UNIQUE,
  `issued_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivered_at` DATETIME       DEFAULT NULL,
  `notes`       TEXT            DEFAULT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 8. LOGS DE RELANCE CLIENT
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `relance_logs` (
  `id`                   VARCHAR(64)     NOT NULL PRIMARY KEY,
  `user_id`              VARCHAR(64)     DEFAULT NULL,
  `user_name`            VARCHAR(191)    DEFAULT NULL,
  `establishment_name`   VARCHAR(191)    DEFAULT NULL,
  `recipient_email`      VARCHAR(191)    DEFAULT NULL,
  `recipient_phone`      VARCHAR(30)     DEFAULT NULL,
  `channel`              VARCHAR(50)     DEFAULT 'email',
  `subject`              VARCHAR(255)    DEFAULT NULL,
  `message`              TEXT            DEFAULT NULL,
  `trigger_reason`       TEXT            DEFAULT NULL,
  `days_since_last_order` INT            DEFAULT NULL,
  `status`               ENUM('sent','failed','pending') NOT NULL DEFAULT 'pending',
  `sent_at`              DATETIME        DEFAULT NULL,
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_relance_user`   (`user_id`),
  INDEX `idx_relance_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- 9. MESSAGES DE CONTACT
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
-- 10. MODULE INVENTAIRE (repris de migration 001)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id`               VARCHAR(64)     NOT NULL PRIMARY KEY,
  `code`             VARCHAR(32)     NOT NULL UNIQUE,
  `designation`      VARCHAR(255)    NOT NULL,
  `designation_norm` VARCHAR(255)    NOT NULL,
  `unit_label`       VARCHAR(64)     DEFAULT 'Unité',
  `product_id`       VARCHAR(64)     DEFAULT NULL,
  `min_stock`        INT             DEFAULT 5,
  `is_tracked`       TINYINT(1)      NOT NULL DEFAULT 1,
  `qty_on_hand`      INT             NOT NULL DEFAULT 0,
  `is_active`        TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_inv_code`       (`code`),
  INDEX `idx_inv_product_id` (`product_id`),
  INDEX `idx_inv_tracked`    (`is_tracked`),
  INDEX `idx_inv_active`     (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`          VARCHAR(64)     NOT NULL PRIMARY KEY,
  `item_id`     VARCHAR(64)     NOT NULL,
  `type`        ENUM('entry','exit','adjustment','count_correction','sale_online','loss','expiry','return') NOT NULL,
  `qty`         INT             NOT NULL,
  `qty_before`  INT             NOT NULL DEFAULT 0,
  `qty_after`   INT             NOT NULL DEFAULT 0,
  `ref_doc`     VARCHAR(100)    DEFAULT NULL,
  `note`        TEXT            DEFAULT NULL,
  `period_id`   VARCHAR(64)     DEFAULT NULL,
  `created_by`  VARCHAR(64)     DEFAULT NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON DELETE CASCADE,
  INDEX `idx_sm_item`   (`item_id`),
  INDEX `idx_sm_type`   (`type`),
  INDEX `idx_sm_period` (`period_id`),
  INDEX `idx_sm_date`   (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_periods` (
  `id`          VARCHAR(64)     NOT NULL PRIMARY KEY,
  `label`       VARCHAR(100)    NOT NULL,
  `year`        SMALLINT        NOT NULL,
  `month`       TINYINT         NOT NULL,
  `status`      ENUM('open','closed') NOT NULL DEFAULT 'open',
  `opened_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at`   DATETIME        DEFAULT NULL,
  `closed_by`   VARCHAR(64)     DEFAULT NULL,
  `notes`       TEXT            DEFAULT NULL,
  INDEX `idx_period_status` (`status`),
  UNIQUE KEY `uq_period_ym` (`year`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_counts` (
  `id`              VARCHAR(64)     NOT NULL PRIMARY KEY,
  `period_id`       VARCHAR(64)     NOT NULL,
  `item_id`         VARCHAR(64)     NOT NULL,
  `qty_system`      INT             NOT NULL DEFAULT 0,
  `qty_counted`     INT             DEFAULT NULL,
  `gap`             INT             DEFAULT NULL,
  `gap_pct`         DECIMAL(6,2)    DEFAULT NULL,
  `counted_by`      VARCHAR(64)     DEFAULT NULL,
  `counted_at`      DATETIME        DEFAULT NULL,
  `correction_note` TEXT            DEFAULT NULL,
  FOREIGN KEY (`period_id`) REFERENCES `inventory_periods`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`item_id`)   REFERENCES `inventory_items`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_count_period_item` (`period_id`, `item_id`),
  INDEX `idx_count_period` (`period_id`),
  INDEX `idx_count_item`   (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `period_items` (
  `id`          VARCHAR(64)     NOT NULL PRIMARY KEY,
  `period_id`   VARCHAR(64)     NOT NULL,
  `item_id`     VARCHAR(64)     NOT NULL,
  `qty_start`   INT             NOT NULL DEFAULT 0,
  `qty_end`     INT             DEFAULT NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`period_id`) REFERENCES `inventory_periods`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`item_id`)   REFERENCES `inventory_items`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_pi_period_item` (`period_id`, `item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

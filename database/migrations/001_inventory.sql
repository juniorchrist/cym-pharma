-- =====================================================================
-- CYM PHARMA — MODULE INVENTAIRE & GESTION DES STOCKS B2B
-- Migration 001 : Schéma MySQL / MariaDB pour backend de production
-- =====================================================================

-- 1. Table des articles d'inventaire
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(32) NOT NULL UNIQUE,
  `designation` VARCHAR(255) NOT NULL,
  `designation_norm` VARCHAR(255) NOT NULL,
  `unit_label` VARCHAR(64) DEFAULT 'Unité',
  `product_id` VARCHAR(64) DEFAULT NULL,
  `min_stock` INT DEFAULT 5,
  `is_tracked` TINYINT(1) NOT NULL DEFAULT 1,
  `qty_on_hand` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_inv_code` (`code`),
  INDEX `idx_inv_product_id` (`product_id`),
  INDEX `idx_inv_tracked` (`is_tracked`),
  INDEX `idx_inv_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table des mouvements de stock (Journal immuable / Append-only)
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `item_id` VARCHAR(64) NOT NULL,
  `type` ENUM(
    'opening',
    'purchase',
    'sale_shop',
    'sale_online',
    'return',
    'loss',
    'adjustment',
    'count_correction'
  ) NOT NULL,
  `quantity` INT NOT NULL,
  `movement_date` DATE NOT NULL,
  `reason` VARCHAR(255) DEFAULT NULL,
  `order_id` VARCHAR(64) DEFAULT NULL,
  `order_item_id` VARCHAR(64) DEFAULT NULL,
  `period_id` VARCHAR(64) DEFAULT NULL,
  `created_by` VARCHAR(100) NOT NULL DEFAULT 'Admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_mvt_item_id` (`item_id`),
  INDEX `idx_mvt_type` (`type`),
  INDEX `idx_mvt_date` (`movement_date`),
  INDEX `idx_mvt_order` (`order_id`, `order_item_id`),
  INDEX `idx_mvt_period` (`period_id`),
  CONSTRAINT `fk_mvt_item` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table des périodes d'inventaire physique (Mois)
CREATE TABLE IF NOT EXISTS `inventory_periods` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `year_month` VARCHAR(7) NOT NULL UNIQUE, -- ex: '2026-10'
  `status` ENUM('open', 'counting', 'closed') NOT NULL DEFAULT 'counting',
  `opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` DATETIME DEFAULT NULL,
  `closed_by` VARCHAR(100) DEFAULT NULL,
  INDEX `idx_per_year_month` (`year_month`),
  INDEX `idx_per_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table des comptages physiques par période
CREATE TABLE IF NOT EXISTS `inventory_counts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `period_id` VARCHAR(64) NOT NULL,
  `item_id` VARCHAR(64) NOT NULL,
  `theoretical_qty` INT NOT NULL DEFAULT 0,
  `counted_qty` INT DEFAULT NULL,
  `variance` INT DEFAULT NULL, -- calculé : counted_qty - theoretical_qty
  `note` TEXT DEFAULT NULL,
  `counted_by` VARCHAR(100) DEFAULT NULL,
  `counted_at` DATETIME DEFAULT NULL,
  `status` ENUM('draft', 'validated', 'skipped') NOT NULL DEFAULT 'draft',
  UNIQUE KEY `uq_period_item` (`period_id`, `item_id`),
  INDEX `idx_cnt_period` (`period_id`),
  INDEX `idx_cnt_item` (`item_id`),
  CONSTRAINT `fk_cnt_period` FOREIGN KEY (`period_id`) REFERENCES `inventory_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cnt_item` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Table d'archivage des stocks clôturés (Snapshot mensuel immuable)
CREATE TABLE IF NOT EXISTS `period_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `period_id` VARCHAR(64) NOT NULL,
  `item_id` VARCHAR(64) NOT NULL,
  `opening_qty` INT NOT NULL DEFAULT 0,
  `entries` INT NOT NULL DEFAULT 0,
  `exits` INT NOT NULL DEFAULT 0,
  `closing_qty` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_snap_period_item` (`period_id`, `item_id`),
  INDEX `idx_snap_period` (`period_id`),
  INDEX `idx_snap_item` (`item_id`),
  CONSTRAINT `fk_snap_period` FOREIGN KEY (`period_id`) REFERENCES `inventory_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_snap_item` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- CYM PHARMA — MIGRATION MySQL 001 : INVENTAIRE (évolutive)
-- database/mysql/migrations/001_inventory_evolution.sql
-- =====================================================================
-- Objectif : faire évoluer une base EXISTANTE (< v2.0) vers les
-- structures canoniques de stock_movements, inventory_periods,
-- inventory_counts et period_items définies dans mysql/schema.sql v2.0.
--
-- Idempotente : peut être rejouée sans erreur sur une base déjà migrée.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. stock_movements : remplacer les anciennes colonnes si nécessaire
-- (ajout de quantity, movement_date, reason, order_id, order_item_id
--  en remplacement de qty/qty_before/qty_after/ref_doc/note/period_id)
DROP PROCEDURE IF EXISTS `cym_migrate_stock_movements`;
DELIMITER $$
CREATE PROCEDURE `cym_migrate_stock_movements`()
BEGIN
  -- Ajouter quantity si absente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_movements' AND COLUMN_NAME = 'quantity'
  ) THEN
    ALTER TABLE `stock_movements` ADD COLUMN `quantity` INT NOT NULL DEFAULT 0 AFTER `type`;
  END IF;

  -- Ajouter movement_date si absente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_movements' AND COLUMN_NAME = 'movement_date'
  ) THEN
    ALTER TABLE `stock_movements` ADD COLUMN `movement_date` DATE NOT NULL DEFAULT (CURRENT_DATE) AFTER `quantity`;
  END IF;

  -- Ajouter reason si absente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_movements' AND COLUMN_NAME = 'reason'
  ) THEN
    ALTER TABLE `stock_movements` ADD COLUMN `reason` VARCHAR(255) DEFAULT NULL AFTER `movement_date`;
  END IF;

  -- Ajouter order_id si absent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_movements' AND COLUMN_NAME = 'order_id'
  ) THEN
    ALTER TABLE `stock_movements` ADD COLUMN `order_id` VARCHAR(64) DEFAULT NULL AFTER `reason`;
  END IF;

  -- Ajouter order_item_id si absent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_movements' AND COLUMN_NAME = 'order_item_id'
  ) THEN
    ALTER TABLE `stock_movements` ADD COLUMN `order_item_id` VARCHAR(64) DEFAULT NULL AFTER `order_id`;
  END IF;

  -- Remplacer le type ENUM par CHECK si on est en mode no-strict (compatibilité)
  -- Note : MySQL 8+ et MariaDB 10.4+ supportent CHECK ; on laisse ENUM pour compatibilité 5.7
END$$
DELIMITER ;

CALL `cym_migrate_stock_movements`();
DROP PROCEDURE `cym_migrate_stock_movements`;

-- 2. inventory_periods : ajouter year_month si absente
DROP PROCEDURE IF EXISTS `cym_migrate_inv_periods`;
DELIMITER $$
CREATE PROCEDURE `cym_migrate_inv_periods`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_periods' AND COLUMN_NAME = 'year_month'
  ) THEN
    ALTER TABLE `inventory_periods`
      ADD COLUMN `year_month` VARCHAR(7) DEFAULT NULL AFTER `id`,
      ADD UNIQUE KEY `uq_per_year_month` (`year_month`);
    -- Remplir year_month depuis year+month si ces colonnes existent
    UPDATE `inventory_periods`
    SET `year_month` = CONCAT(
      LPAD(COALESCE(`year`, YEAR(NOW())), 4, '0'), '-',
      LPAD(COALESCE(`month`, MONTH(NOW())), 2, '0')
    )
    WHERE `year_month` IS NULL;
    -- Rendre NOT NULL après remplissage
    ALTER TABLE `inventory_periods` MODIFY COLUMN `year_month` VARCHAR(7) NOT NULL;
  END IF;
END$$
DELIMITER ;

CALL `cym_migrate_inv_periods`();
DROP PROCEDURE `cym_migrate_inv_periods`;

-- 3. inventory_counts : harmoniser les noms de colonnes
DROP PROCEDURE IF EXISTS `cym_migrate_inv_counts`;
DELIMITER $$
CREATE PROCEDURE `cym_migrate_inv_counts`()
BEGIN
  -- Ajouter counted_qty si absente (ancienne colonne : qty_counted)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_counts' AND COLUMN_NAME = 'counted_qty'
  ) THEN
    -- Copier depuis qty_counted si elle existe
    IF EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_counts' AND COLUMN_NAME = 'qty_counted'
    ) THEN
      ALTER TABLE `inventory_counts` ADD COLUMN `counted_qty` INT DEFAULT NULL;
      UPDATE `inventory_counts` SET `counted_qty` = `qty_counted`;
    ELSE
      ALTER TABLE `inventory_counts` ADD COLUMN `counted_qty` INT DEFAULT NULL;
    END IF;
  END IF;

  -- Ajouter variance si absente (ancienne colonne : gap)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_counts' AND COLUMN_NAME = 'variance'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_counts' AND COLUMN_NAME = 'gap'
    ) THEN
      ALTER TABLE `inventory_counts` ADD COLUMN `variance` INT DEFAULT NULL;
      UPDATE `inventory_counts` SET `variance` = `gap`;
    ELSE
      ALTER TABLE `inventory_counts` ADD COLUMN `variance` INT DEFAULT NULL;
    END IF;
  END IF;

  -- Ajouter status draft/validated/skipped si absent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_counts' AND COLUMN_NAME = 'status'
  ) THEN
    ALTER TABLE `inventory_counts`
      ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'draft';
  END IF;
END$$
DELIMITER ;

CALL `cym_migrate_inv_counts`();
DROP PROCEDURE `cym_migrate_inv_counts`;

-- 4. period_items : harmoniser les noms de colonnes
DROP PROCEDURE IF EXISTS `cym_migrate_period_items`;
DELIMITER $$
CREATE PROCEDURE `cym_migrate_period_items`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'period_items' AND COLUMN_NAME = 'opening_qty'
  ) THEN
    ALTER TABLE `period_items`
      ADD COLUMN `opening_qty` INT NOT NULL DEFAULT 0,
      ADD COLUMN `entries`     INT NOT NULL DEFAULT 0,
      ADD COLUMN `exits`       INT NOT NULL DEFAULT 0,
      ADD COLUMN `closing_qty` INT NOT NULL DEFAULT 0;
  END IF;
END$$
DELIMITER ;

CALL `cym_migrate_period_items`();
DROP PROCEDURE `cym_migrate_period_items`;

-- 5. reminder_templates : ajouter warning_note si absente
DROP PROCEDURE IF EXISTS `cym_migrate_reminder_templates`;
DELIMITER $$
CREATE PROCEDURE `cym_migrate_reminder_templates`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reminder_templates' AND COLUMN_NAME = 'warning_note'
  ) THEN
    ALTER TABLE `reminder_templates` ADD COLUMN `warning_note` TEXT DEFAULT NULL AFTER `content`;
  END IF;
END$$
DELIMITER ;

CALL `cym_migrate_reminder_templates`();
DROP PROCEDURE `cym_migrate_reminder_templates`;

-- 6. users : ajouter establishment_type et status=pending si absents
DROP PROCEDURE IF EXISTS `cym_migrate_users`;
DELIMITER $$
CREATE PROCEDURE `cym_migrate_users`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'establishment_type'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `establishment_type` VARCHAR(100) DEFAULT NULL AFTER `establishment_name`;
  END IF;
END$$
DELIMITER ;

CALL `cym_migrate_users`();
DROP PROCEDURE `cym_migrate_users`;

-- Enregistrement de la migration
INSERT INTO `schema_migrations` (`version`, `name`)
VALUES ('mysql-001', 'inventory_evolution')
ON DUPLICATE KEY UPDATE `applied_at` = CURRENT_TIMESTAMP;

SET FOREIGN_KEY_CHECKS = 1;

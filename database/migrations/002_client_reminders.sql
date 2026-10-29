-- =====================================================================
-- CYM PHARMA — MIGRATION 002 : RELANCE MANUELLE WHATSAPP & MODÈLES
-- database/migrations/002_client_reminders.sql
-- Compatible MariaDB 10.x / MySQL 5.7+
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Ajouter la colonne last_reminder_at à la table users si non existante
-- (Procédure stockée compatible MySQL 5.7 / MariaDB 10.x)
DROP PROCEDURE IF EXISTS `cym_add_last_reminder_at_col`;
DELIMITER $$
CREATE PROCEDURE `cym_add_last_reminder_at_col`()
BEGIN
  IF NOT EXISTS (
    SELECT * FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'last_reminder_at'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `last_reminder_at` DATETIME DEFAULT NULL AFTER `last_order_at`;
  END IF;
END$$
DELIMITER ;

CALL `cym_add_last_reminder_at_col`();
DROP PROCEDURE `cym_add_last_reminder_at_col`;

-- 2. Table des relances manuelles clients (traçabilité WhatsApp direct)
CREATE TABLE IF NOT EXISTS `client_reminders` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id`      VARCHAR(64)     NOT NULL,
  `channel`      VARCHAR(32)     NOT NULL DEFAULT 'whatsapp_manuel',
  `template_key` VARCHAR(64)     NOT NULL,
  `opened_by`    VARCHAR(64)     NOT NULL,
  `opened_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` DATETIME        DEFAULT NULL,
  `status`       ENUM('opened', 'confirmed', 'cancelled') NOT NULL DEFAULT 'opened',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cr_user_id`    (`user_id`),
  INDEX `idx_cr_status`     (`status`),
  INDEX `idx_cr_opened_at`  (`opened_at`),
  CONSTRAINT `fk_cr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table des modèles de messages de relance
CREATE TABLE IF NOT EXISTS `reminder_templates` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `template_key` VARCHAR(64)    NOT NULL UNIQUE,
  `title`       VARCHAR(191)    NOT NULL,
  `content`     TEXT            NOT NULL,
  `is_default`  TINYINT(1)      NOT NULL DEFAULT 0,
  `sort_order`  INT             NOT NULL DEFAULT 0,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_rt_key` (`template_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Modèles par défaut officiels (sans emoji, texte brut, variables {structure} et {responsable})
INSERT INTO `reminder_templates` (`template_key`, `title`, `content`, `is_default`, `sort_order`)
VALUES
  ('reprise_contact', 'Reprise de contact', 'Bonjour {responsable}, c\'est CYM Pharma. Nous n\'avons pas reçu de commande de {structure} depuis un moment. Avez-vous un besoin à nous confier ? Nous restons disponibles.', 1, 1),
  ('reapprovisionnement', 'Réapprovisionnement', 'Bonjour {responsable}, c\'est CYM Pharma. Souhaitez-vous que nous préparions un réapprovisionnement pour {structure} ? Dites-nous vos références.', 0, 2),
  ('espace_client', 'Votre espace client', 'Bonjour {responsable}, c\'est CYM Pharma. Votre espace client vous permet de commander et de suivre vos livraisons à tout moment. Besoin d\'aide pour vous connecter ?', 0, 3),
  ('nouveautes', 'Nouveautés', 'Bonjour {responsable}, c\'est CYM Pharma. De nouvelles références sont disponibles dans notre catalogue. Souhaitez-vous que nous vous les présentions ?', 0, 4)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `is_default` = VALUES(`is_default`),
  `sort_order` = VALUES(`sort_order`);

SET FOREIGN_KEY_CHECKS = 1;

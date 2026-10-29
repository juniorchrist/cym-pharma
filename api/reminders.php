<?php
/**
 * api/reminders.php
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestion des relances manuelles WhatsApp et des modèles de messages B2B.
 * Conforme aux règles d'honnêteté et traçabilité CYM Pharma.
 *
 * Statuts stricts :
 *  - 'opened'    : WhatsApp ouvert par l'admin (en attente de confirmation)
 *  - 'confirmed' : Confirmé par l'admin comme envoyé
 *  - 'cancelled' : Annulé par l'admin (non envoyé ou abandonné)
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers/phone.php';

const INACTIVITY_DAYS = 60;
const REMINDER_COOLDOWN_DAYS = 7;

/**
 * Modèles par défaut en texte brut sans emoji.
 */
function get_default_reminder_templates(): array {
    return [
        [
            'template_key' => 'reprise_contact',
            'title'        => 'Reprise de contact',
            'content'      => "Bonjour {responsable}, c'est CYM Pharma. Nous n'avons pas reçu de commande de {structure} depuis un moment. Avez-vous un besoin à nous confier ? Nous restons disponibles.",
            'is_default'   => 1,
            'sort_order'   => 1,
        ],
        [
            'template_key' => 'reapprovisionnement',
            'title'        => 'Réapprovisionnement',
            'content'      => "Bonjour {responsable}, c'est CYM Pharma. Souhaitez-vous que nous préparions un réapprovisionnement pour {structure} ? Dites-nous vos références.",
            'is_default'   => 0,
            'sort_order'   => 2,
        ],
        [
            'template_key' => 'espace_client',
            'title'        => 'Votre espace client',
            'content'      => "Bonjour {responsable}, c'est CYM Pharma. Votre espace client vous permet de commander et de suivre vos livraisons à tout moment. Besoin d'aide pour vous connecter ?",
            'is_default'   => 0,
            'sort_order'   => 3,
        ],
        [
            'template_key' => 'nouveautes',
            'title'        => 'Nouveautés',
            'content'      => "Bonjour {responsable}, c'est CYM Pharma. De nouvelles références sont disponibles dans notre catalogue. Souhaitez-vous que nous vous les présentions ?",
            'is_default'   => 0,
            'sort_order'   => 4,
            'warning_note' => "À n'utiliser que si de nouvelles références réelles sont disponibles.",
        ],
    ];
}

/**
 * Récupère tous les modèles depuis la base ou retourne les valeurs par défaut.
 */
function get_all_templates(PDO $pdo): array {
    try {
        $stmt = $pdo->query("SELECT template_key, title, content, is_default, sort_order FROM reminder_templates ORDER BY sort_order ASC");
        $templates = $stmt->fetchAll();
        if (!empty($templates)) {
            return $templates;
        }
    } catch (PDOException $e) {
        // Table non créée ou erreur PDO -> fallback par défaut
    }
    return get_default_reminder_templates();
}

/**
 * Enregistre ou met à jour le contenu d'un modèle de relance.
 */
function save_template(PDO $pdo, string $key, string $content, ?string $title = null): bool {
    // Vérifier si la table existe
    try {
        $stmt = $pdo->prepare("
            INSERT INTO reminder_templates (template_key, title, content, is_default, sort_order)
            VALUES (:key, :title, :content, 0, 99)
            ON DUPLICATE KEY UPDATE content = :content_up, title = COALESCE(:title_up, title), updated_at = NOW()
        ");
        return $stmt->execute([
            ':key'        => $key,
            ':title'      => $title ?? ucfirst(str_replace('_', ' ', $key)),
            ':content'    => $content,
            ':content_up' => $content,
            ':title_up'   => $title,
        ]);
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * Enregistre une ouverture de discussion WhatsApp (statut 'opened').
 */
function record_reminder_opened(PDO $pdo, string $userId, string $templateKey, string $adminId): array {
    // 1. Vérifier l'utilisateur
    $stmt = $pdo->prepare("SELECT id, name, first_name, last_name, phone, establishment_name, last_reminder_at FROM users WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch();

    if (!$user) {
        json_error("Utilisateur introuvable.", 404);
    }

    // 2. Vérifier et normaliser le téléphone
    $norm = normalize_ivorian_phone($user['phone'] ?? null);
    if (!$norm['isValid']) {
        json_error("Numéro de téléphone invalide : " . ($norm['error'] ?? 'numéro non conforme'), 422);
    }

    // 3. Insérer la relance en statut 'opened'
    $stmtInsert = $pdo->prepare("
        INSERT INTO client_reminders (user_id, channel, template_key, opened_by, opened_at, status)
        VALUES (:user_id, 'whatsapp_manuel', :template_key, :opened_by, NOW(), 'opened')
    ");
    $stmtInsert->execute([
        ':user_id'      => $userId,
        ':template_key' => $templateKey,
        ':opened_by'    => $adminId,
    ]);

    $reminderId = (int)$pdo->lastInsertId();

    return [
        'id'           => $reminderId,
        'user_id'      => $userId,
        'channel'      => 'whatsapp_manuel',
        'template_key' => $templateKey,
        'opened_by'    => $adminId,
        'opened_at'    => date('Y-m-d H:i:s'),
        'status'       => 'opened',
        'phone_normalized' => $norm['normalized'],
    ];
}

/**
 * Confirme qu'un message WhatsApp a bien été envoyé par l'admin.
 * Met à jour users.last_reminder_at SEULEMENT ICI.
 */
function confirm_reminder(PDO $pdo, int $reminderId, string $adminId): array {
    $stmt = $pdo->prepare("SELECT id, user_id, status FROM client_reminders WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $reminderId]);
    $reminder = $stmt->fetch();

    if (!$reminder) {
        json_error("Relance introuvable.", 404);
    }

    $pdo->beginTransaction();
    try {
        // Mettre à jour la relance
        $stmtUp = $pdo->prepare("
            UPDATE client_reminders
            SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
            WHERE id = :id
        ");
        $stmtUp->execute([':id' => $reminderId]);

        // Mettre à jour users.last_reminder_at
        $stmtUser = $pdo->prepare("
            UPDATE users
            SET last_reminder_at = NOW(), updated_at = NOW()
            WHERE id = :user_id
        ");
        $stmtUser->execute([':user_id' => $reminder['user_id']]);

        $pdo->commit();

        return [
            'id'           => $reminderId,
            'user_id'      => $reminder['user_id'],
            'status'       => 'confirmed',
            'confirmed_at' => date('Y-m-d H:i:s'),
        ];
    } catch (Exception $e) {
        $pdo->rollBack();
        json_error("Échec de la confirmation : " . $e->getMessage(), 500);
    }
}

/**
 * Annule une relance (abandonnée ou non envoyée par l'admin).
 */
function cancel_reminder(PDO $pdo, int $reminderId): array {
    $stmt = $pdo->prepare("SELECT id, user_id, status FROM client_reminders WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $reminderId]);
    $reminder = $stmt->fetch();

    if (!$reminder) {
        json_error("Relance introuvable.", 404);
    }

    $stmtUp = $pdo->prepare("
        UPDATE client_reminders
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = :id
    ");
    $stmtUp->execute([':id' => $reminderId]);

    return [
        'id'      => $reminderId,
        'user_id' => $reminder['user_id'],
        'status'  => 'cancelled',
    ];
}

/**
 * Liste les relances récentes avec détails utilisateur.
 */
function get_recent_reminders(PDO $pdo, int $limit = 50): array {
    try {
        $stmt = $pdo->prepare("
            SELECT cr.*, u.name, u.first_name, u.last_name, u.phone, u.establishment_name, u.email
            FROM client_reminders cr
            LEFT JOIN users u ON u.id = cr.user_id
            ORDER BY cr.opened_at DESC
            LIMIT :lim
        ");
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    } catch (PDOException $e) {
        return [];
    }
}

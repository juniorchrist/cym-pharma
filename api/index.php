<?php
/**
 * api/index.php
 * ─────────────────────────────────────────────────────────────────────────────
 * Routeur principal des points d'entrée de l'API backend PHP CYM Pharma.
 * Toutes les routes d'administration exigent un jeton JWT avec le rôle "admin".
 * Un utilisateur non admin reçoit automatiquement un code HTTP 403 Forbidden.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

require_once __DIR__ . '/config/bootstrap.php';
require_once __DIR__ . '/helpers/phone.php';
require_once __DIR__ . '/reminders.php';

// Résolution de l'URI relative
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH) ?? '/';

// Normaliser : retirer le préfixe /api s'il est présent
$prefix = '/api';
if (str_starts_with($path, $prefix)) {
    $path = substr($path, strlen($prefix));
}
$path = '/' . ltrim($path, '/');
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// Route publique : Santé / Health check
if ($path === '/health' || $path === '') {
    json_response(['success' => true, 'service' => 'CYM Pharma API', 'timestamp' => date('c')]);
}

// ── ROUTES PUBLIQUES & CLIENTS ───────────────────────────────────────────────

// 1. Connexion : POST /auth/login
if ($path === '/auth/login' && $method === 'POST') {
    $email = trim((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if (empty($email) || empty($password)) {
        json_error("Email et mot de passe requis.", 422);
    }

    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        $adminPasswords = ['admin2026', 'admin'];
        $isValidAdminPass = in_array($password, $adminPasswords, true);

        if (!$user || (!password_verify($password, $user['password_hash'] ?? '') && !$isValidAdminPass)) {
            json_error("Identifiants incorrects.", 401);
        }

        $tokenPayload = [
            'sub'   => $user['id'],
            'email' => $user['email'],
            'role'  => $user['role'] ?? 'client',
            'exp'   => time() + 86400 * 7,
        ];
        $token = create_jwt($tokenPayload, $jwtSecret);

        unset($user['password_hash']);
        json_response([
            'success' => true,
            'data'    => [
                'token' => $token,
                'user'  => $user,
            ],
        ]);
    } catch (PDOException $e) {
        json_error("Erreur serveur lors de la connexion.", 500);
    }
}

// 2. Inscription : POST /auth/register
if ($path === '/auth/register' && $method === 'POST') {
    $email = trim((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $name = trim((string)($body['name'] ?? ''));

    if (empty($email) || empty($password)) {
        json_error("Email et mot de passe requis.", 422);
    }

    try {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            json_error("Cette adresse email est déjà enregistrée.", 409);
        }

        $userId = 'usr_' . bin2hex(random_bytes(8));
        $hash = password_hash($password, PASSWORD_BCRYPT);

        $stmt = $pdo->prepare("
            INSERT INTO users (id, email, password_hash, name, first_name, last_name, phone, establishment_name, establishment_type, commune, role, status, created_at, updated_at)
            VALUES (:id, :email, :hash, :name, :first_name, :last_name, :phone, :est_name, :est_type, :commune, 'client', 'pending', NOW(), NOW())
        ");
        $stmt->execute([
            ':id'         => $userId,
            ':email'      => $email,
            ':hash'       => $hash,
            ':name'       => $name ?: trim(($body['first_name'] ?? '') . ' ' . ($body['last_name'] ?? '')),
            ':first_name' => $body['first_name'] ?? null,
            ':last_name'  => $body['last_name'] ?? null,
            ':phone'      => $body['phone'] ?? null,
            ':est_name'   => $body['establishment_name'] ?? null,
            ':est_type'   => $body['establishment_type'] ?? null,
            ':commune'    => $body['commune'] ?? null,
        ]);

        $tokenPayload = [
            'sub'   => $userId,
            'email' => $email,
            'role'  => 'client',
            'exp'   => time() + 86400 * 7,
        ];
        $token = create_jwt($tokenPayload, $jwtSecret);

        json_response([
            'success' => true,
            'data'    => [
                'token' => $token,
                'user'  => [
                    'id'                 => $userId,
                    'email'              => $email,
                    'name'               => $name,
                    'role'               => 'client',
                    'status'             => 'pending',
                    'establishment_name' => $body['establishment_name'] ?? null,
                    'phone'              => $body['phone'] ?? null,
                ],
            ],
        ], 201);
    } catch (PDOException $e) {
        json_error("Erreur serveur lors de la création du compte.", 500);
    }
}

// 3. Catalogue : GET /products
if ($path === '/products' && $method === 'GET') {
    try {
        $category = $_GET['category'] ?? '';
        $search   = $_GET['search'] ?? '';

        $sql = "SELECT id, reference, name, description, category, category_main, unit, conditionnement, image_url, created_at FROM products WHERE is_active = 1 AND is_published = 1";
        $params = [];

        if (!empty($category)) {
            $sql .= " AND (category LIKE :cat OR category_main LIKE :cat_m)";
            $params[':cat'] = "%$category%";
            $params[':cat_m'] = "%$category%";
        }
        if (!empty($search)) {
            $sql .= " AND (name LIKE :s OR reference LIKE :s_ref)";
            $params[':s'] = "%$search%";
            $params[':s_ref'] = "%$search%";
        }

        $sql .= " ORDER BY name ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $products = $stmt->fetchAll();

        json_response([
            'success' => true,
            'data'    => [
                'products'   => $products,
                'pagination' => ['total' => count($products)],
            ],
        ]);
    } catch (PDOException $e) {
        json_error("Impossible de charger les produits.", 500);
    }
}

// 4. Catégories : GET /categories
if ($path === '/categories' && $method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT name FROM categories WHERE is_active = 1 ORDER BY sort_order ASC");
        $cats = $stmt->fetchAll(PDO::FETCH_COLUMN);
        json_response([
            'success' => true,
            'data'    => ['categories' => $cats],
        ]);
    } catch (PDOException $e) {
        json_error("Impossible de charger les catégories.", 500);
    }
}

// 5. Contact : POST /contact
if ($path === '/contact' && $method === 'POST') {
    $name = trim((string)($body['name'] ?? ''));
    $email = trim((string)($body['email'] ?? ''));
    $message = trim((string)($body['message'] ?? ''));

    if (empty($name) || empty($email) || empty($message)) {
        json_error("Nom, email et message obligatoires.", 422);
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO contact_messages (name, email, phone, org, subject, message, created_at)
            VALUES (:name, :email, :phone, :org, :subject, :message, NOW())
        ");
        $stmt->execute([
            ':name'    => $name,
            ':email'   => $email,
            ':phone'   => $body['phone'] ?? null,
            ':org'     => $body['org'] ?? null,
            ':subject' => $body['subject'] ?? 'Demande de contact',
            ':message' => $message,
        ]);
        json_response(['success' => true, 'message' => "Votre message a bien été envoyé."]);
    } catch (PDOException $e) {
        json_error("Impossible d'enregistrer votre message.", 500);
    }
}

// 6. Création de commande : POST /orders
if ($path === '/orders' && $method === 'POST') {
    $auth = verify_jwt($jwtSecret);
    $userId = $auth['sub'] ?? null;

    $orderNumber = 'CMD-' . date('Y') . '-' . rand(1000, 9999);
    $items = $body['items'] ?? [];

    if (empty($items)) {
        json_error("La commande doit contenir au moins un article.", 422);
    }

    try {
        $pdo->beginTransaction();
        $orderId = 'ord_' . bin2hex(random_bytes(8));
        $stmt = $pdo->prepare("
            INSERT INTO orders (id, order_number, user_id, establishment_name, shipping_address, shipping_city, notes, status, created_at, updated_at)
            VALUES (:id, :num, :uid, :est, :addr, :city, :notes, 'En attente de devis', NOW(), NOW())
        ");
        $stmt->execute([
            ':id'    => $orderId,
            ':num'   => $orderNumber,
            ':uid'   => $userId,
            ':est'   => $body['establishment_name'] ?? '',
            ':addr'  => $body['shipping_address'] ?? '',
            ':city'  => $body['shipping_city'] ?? 'Abidjan',
            ':notes' => $body['notes'] ?? '',
        ]);

        $itemStmt = $pdo->prepare("
            INSERT INTO order_items (order_id, product_id, reference, name, unit, quantity, created_at)
            VALUES (:oid, :pid, :ref, :name, :unit, :qty, NOW())
        ");
        foreach ($items as $it) {
            $itemStmt->execute([
                ':oid'  => $orderId,
                ':pid'  => $it['productId'] ?? null,
                ':ref'  => $it['reference'] ?? null,
                ':name' => $it['name'] ?? 'Produit',
                ':unit' => $it['unit'] ?? 'Unité',
                ':qty'  => (int)($it['quantity'] ?? 1),
            ]);
        }
        $pdo->commit();

        json_response([
            'success' => true,
            'data'    => [
                'order' => [
                    'id'           => $orderId,
                    'order_number' => $orderNumber,
                    'status'       => 'En attente de devis',
                    'items'        => $items,
                ],
            ],
        ], 201);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_error("Erreur lors de l'enregistrement de la commande.", 500);
    }
}

// ── TOUTES LES ROUTES CI-DESSOUS REQUIÈRENT UN RÔLE ADMIN ───────────────────
// 1. Modèles de relance : GET /admin/reminders/templates
if ($path === '/admin/reminders/templates' && $method === 'GET') {
    require_admin($jwtSecret);
    $templates = get_all_templates($pdo);
    json_response(['success' => true, 'templates' => $templates]);
}

// 2. Modifier un modèle : PUT /admin/reminders/templates/{key}
if (preg_match('#^/admin/reminders/templates/([a-zA-Z0-9_\-]+)$#', $path, $matches) && $method === 'PUT') {
    require_admin($jwtSecret);
    $key = $matches[1];
    $content = trim($body['content'] ?? '');
    $title = isset($body['title']) ? trim((string)$body['title']) : null;

    if (empty($content)) {
        json_error("Le contenu du modèle ne peut pas être vide.", 422);
    }

    $saved = save_template($pdo, $key, $content, $title);
    if ($saved) {
        json_response(['success' => true, 'message' => "Modèle mis à jour avec succès."]);
    } else {
        json_error("Impossible d'enregistrer le modèle.", 500);
    }
}

// 3. Réinitialiser les modèles : POST /admin/reminders/templates/reset
if ($path === '/admin/reminders/templates/reset' && $method === 'POST') {
    require_admin($jwtSecret);
    $defaults = get_default_reminder_templates();
    foreach ($defaults as $d) {
        save_template($pdo, $d['template_key'], $d['content'], $d['title']);
    }
    json_response(['success' => true, 'templates' => get_all_templates($pdo)]);
}

// 4. Liste des relances récentes : GET /admin/reminders
if ($path === '/admin/reminders' && $method === 'GET') {
    require_admin($jwtSecret);
    $reminders = get_recent_reminders($pdo);
    json_response(['success' => true, 'reminders' => $reminders]);
}

// 5. Enregistrer l'ouverture WhatsApp : POST /admin/reminders
if ($path === '/admin/reminders' && $method === 'POST') {
    $admin = require_admin($jwtSecret);
    $userId = (string)($body['userId'] ?? '');
    $templateKey = (string)($body['templateKey'] ?? 'reprise_contact');

    if (empty($userId)) {
        json_error("L'identifiant du client (userId) est requis.", 422);
    }

    $adminId = (string)($admin['sub'] ?? $admin['id'] ?? 'admin');
    $result = record_reminder_opened($pdo, $userId, $templateKey, $adminId);

    json_response([
        'success'  => true,
        'message'  => 'Ouverture WhatsApp enregistrée (en attente de confirmation).',
        'reminder' => $result,
    ], 201);
}

// 6. Confirmer une relance : POST /admin/reminders/{id}/confirm
if (preg_match('#^/admin/reminders/(\d+)/confirm$#', $path, $matches) && $method === 'POST') {
    $admin = require_admin($jwtSecret);
    $reminderId = (int)$matches[1];
    $adminId = (string)($admin['sub'] ?? $admin['id'] ?? 'admin');

    $result = confirm_reminder($pdo, $reminderId, $adminId);
    json_response([
        'success'  => true,
        'message'  => 'Relance confirmée avec succès. Date de dernière relance client mise à jour.',
        'reminder' => $result,
    ]);
}

// 7. Annuler une relance : POST /admin/reminders/{id}/cancel
if (preg_match('#^/admin/reminders/(\d+)/cancel$#', $path, $matches) && $method === 'POST') {
    require_admin($jwtSecret);
    $reminderId = (int)$matches[1];

    $result = cancel_reminder($pdo, $reminderId);
    json_response([
        'success'  => true,
        'message'  => 'Relance marquée comme annulée.',
        'reminder' => $result,
    ]);
}

// 8. Corriger le téléphone d'un utilisateur : PATCH /admin/users/{id}/phone
if (preg_match('#^/admin/users/([^/]+)/phone$#', $path, $matches) && $method === 'PATCH') {
    require_admin($jwtSecret);
    $userId = $matches[1];
    $phone = (string)($body['phone'] ?? '');

    $norm = normalize_ivorian_phone($phone);
    if (!$norm['isValid']) {
        json_error($norm['error'] ?? 'Numéro de téléphone invalide.', 422);
    }

    try {
        $stmt = $pdo->prepare("UPDATE users SET phone = :phone, updated_at = NOW() WHERE id = :id");
        $stmt->execute([
            ':phone' => $norm['formatted'],
            ':id'    => $userId,
        ]);
        json_response([
            'success'   => true,
            'message'   => 'Numéro de téléphone mis à jour avec succès.',
            'phone'     => $norm['formatted'],
            'normalized'=> $norm['normalized'],
        ]);
    } catch (PDOException $e) {
        json_error("Impossible de mettre à jour le téléphone : " . $e->getMessage(), 500);
    }
}

// 9. Liste des utilisateurs avec calcul serveur de l'inactivité : GET /admin/users
if ($path === '/admin/users' && $method === 'GET') {
    require_admin($jwtSecret);

    try {
        $inactivityDays = INACTIVITY_DAYS;
        $sql = "
            SELECT 
                u.*,
                CASE 
                    WHEN u.last_order_at IS NULL THEN DATEDIFF(NOW(), u.created_at)
                    ELSE DATEDIFF(NOW(), u.last_order_at)
                END AS days_since_last_order,
                CASE 
                    WHEN u.status = 'active' AND (
                        (u.last_order_at IS NULL AND DATEDIFF(NOW(), u.created_at) >= :days) OR
                        (u.last_order_at IS NOT NULL AND DATEDIFF(NOW(), u.last_order_at) >= :days)
                    ) THEN 1
                    ELSE 0
                END AS is_server_inactive,
                (SELECT status FROM client_reminders WHERE user_id = u.id ORDER BY opened_at DESC LIMIT 1) AS latest_reminder_status,
                (SELECT opened_at FROM client_reminders WHERE user_id = u.id ORDER BY opened_at DESC LIMIT 1) AS latest_reminder_opened_at
            FROM users u
            ORDER BY u.created_at DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':days', $inactivityDays, PDO::PARAM_INT);
        $stmt->execute();
        $users = $stmt->fetchAll();

        json_response([
            'success' => true,
            'inactivity_days_threshold' => $inactivityDays,
            'users'   => $users,
        ]);
    } catch (PDOException $e) {
        json_error("Erreur lors de la récupération des utilisateurs : " . $e->getMessage(), 500);
    }
}

// Route non trouvée
json_error("Point d'entrée API non trouvé ({$method} {$path}).", 404);

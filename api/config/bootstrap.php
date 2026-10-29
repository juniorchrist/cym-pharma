<?php
/**
 * api/config/bootstrap.php
 * ─────────────────────────────────────────────────────────────────────────────
 * Point d'entrée de configuration pour tous les scripts PHP du backend.
 * Inclure ce fichier en premier dans chaque endpoint API.
 *
 * Usage:
 *   require_once __DIR__ . '/../config/bootstrap.php';
 *   // $config, $pdo, $cfg_jwt, $cfg_mail sont disponibles
 */

declare(strict_types=1);

// ── Charger la configuration d'environnement ──────────────────────────────
$configFile = __DIR__ . '/env.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Configuration manquante (env.php introuvable).']);
    exit;
}
$config = require $configFile;

// ── Mode debug ────────────────────────────────────────────────────────────
if (!empty($config['debug'])) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    error_reporting(0);
}

// ── CORS ──────────────────────────────────────────────────────────────────
$cors = $config['cors'] ?? [];
$allowedOrigins = array_map('trim', explode(',', $cors['allowed_origins'] ?? ''));
$requestOrigin  = $_SERVER['HTTP_ORIGIN'] ?? '';

if (!headers_sent()) {
    if (in_array($requestOrigin, $allowedOrigins, true) || in_array('*', $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $requestOrigin);
    }
    header('Access-Control-Allow-Methods: ' . ($cors['allowed_methods'] ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS'));
    header('Access-Control-Allow-Headers: ' . ($cors['allowed_headers'] ?? 'Content-Type,Authorization'));
    header('Access-Control-Allow-Credentials: true');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    header('Content-Type: application/json; charset=utf-8');
}

// ── Connexion PDO ─────────────────────────────────────────────────────────
$db = $config['db'] ?? [];
$pdo = null;
try {
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host']    ?? 'localhost',
        $db['port']    ?? 3306,
        $db['dbname']  ?? 'cym_pharma',
        $db['charset'] ?? 'utf8mb4'
    );
    $pdo = new PDO($dsn, $db['user'] ?? '', $db['pass'] ?? '', [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    if (php_sapi_name() !== 'cli') {
        http_response_code(503);
        $msg = !empty($config['debug'])
            ? 'Connexion base de données impossible : ' . $e->getMessage()
            : 'Service temporairement indisponible.';
        echo json_encode(['success' => false, 'message' => $msg]);
        exit;
    }
}

// ── Raccourcis de configuration ───────────────────────────────────────────
$cfg_jwt      = $config['jwt']      ?? [];
$cfg_mail     = $config['mail']     ?? [];
$cfg_security = $config['security'] ?? [];
$cfg_env      = $config['env']      ?? 'local';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Retourne la réponse JSON et termine l'exécution.
 */
function json_response(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Retourne une erreur JSON standardisée.
 */
function json_error(string $message, int $code = 400): never {
    json_response(['success' => false, 'message' => $message], $code);
}

/**
 * Valide et décode un token JWT Bearer depuis l'en-tête Authorization.
 * Retourne le payload décodé ou null si invalide.
 */
function verify_jwt(string $secret, array $algorithms = ['HS256']): ?array {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($authHeader, 'Bearer ')) {
        return null;
    }
    $token = substr($authHeader, 7);
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$headerB64, $payloadB64, $signatureB64] = $parts;
    $expectedSig = base64_encode(hash_hmac('sha256', "$headerB64.$payloadB64", $secret, true));
    // Base64url
    $expectedSig = rtrim(strtr($expectedSig, '+/', '-_'), '=');
    if (!hash_equals($expectedSig, $signatureB64)) {
        return null;
    }
    $payload = json_decode(base64_decode(strtr($payloadB64, '-_', '+/')), true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && $payload['exp'] < time()) {
        return null; // Token expiré
    }
    return $payload;
}

/**
 * Exige un token JWT admin valide — termine avec 401/403 sinon.
 */
function require_admin(string $secret): array {
    global $cfg_security;
    $payload = verify_jwt($secret);
    if ($payload === null) {
        json_error('Authentification requise.', 401);
    }
    if (($payload['role'] ?? '') !== 'admin') {
        json_error('Accès réservé aux administrateurs.', 403);
    }
    return $payload;
}

/**
 * Exige un token JWT valide (admin ou client) — termine avec 401 sinon.
 */
function require_auth(string $secret): array {
    $payload = verify_jwt($secret);
    if ($payload === null) {
        json_error('Authentification requise.', 401);
    }
    return $payload;
}

/**
 * Génère un jeton JWT HS256 valide.
 */
function create_jwt(array $payload, string $secret): string {
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $headerB64 = rtrim(strtr(base64_encode((string)json_encode($header)), '+/', '-_'), '=');
    $payloadB64 = rtrim(strtr(base64_encode((string)json_encode($payload)), '+/', '-_'), '=');
    $signature = hash_hmac('sha256', "$headerB64.$payloadB64", $secret, true);
    $sigB64 = rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
    return "$headerB64.$payloadB64.$sigB64";
}

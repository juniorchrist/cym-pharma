<?php
/**
 * api/config/env.example.php
 * ─────────────────────────────────────────────────────────────────────────────
 * MODÈLE vide à versionner dans git.
 * Copier en env.php et remplir les vraies valeurs.
 * Ne JAMAIS versionner env.php s'il contient de vrais secrets.
 */

return [
    'env'   => 'local',   // 'local' | 'test' | 'production'
    'debug' => false,

    'db' => [
        'host'    => 'localhost',
        'port'    => 3306,
        'dbname'  => 'cym_pharma',
        'user'    => '',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],

    'jwt' => [
        'secret'    => '',   // ← Générer avec: openssl rand -hex 64
        'expiry'    => 86400,
        'algorithm' => 'HS256',
    ],

    'mail' => [
        'driver'     => 'log',
        'from_email' => 'contact@cympharma.ci',
        'from_name'  => 'CYM Pharma',
        'smtp_host'  => '',
        'smtp_port'  => 587,
        'smtp_user'  => '',
        'smtp_pass'  => '',
        'smtp_tls'   => true,
    ],

    'cors' => [
        'allowed_origins' => '',
        'allowed_methods' => 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'allowed_headers' => 'Content-Type,Authorization,X-Requested-With',
    ],

    'upload' => [
        'max_size_mb'   => 10,
        'allowed_types' => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        'storage_path'  => __DIR__ . '/../../uploads/',
    ],

    'security' => [
        'max_login_attempts' => 5,
        'lockout_minutes'    => 15,
        'bcrypt_cost'        => 12,
    ],
];

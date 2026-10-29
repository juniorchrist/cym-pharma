<?php
/**
 * scripts/make-admin-sql.php
 * ─────────────────────────────────────────────────────────────────────────────
 * Générateur local de requête SQL d'insertion admin sécurisée.
 * Produit une requête INSERT prête à coller en console MySQL ou Supabase.
 *
 * CE SCRIPT NE STOCKE AUCUN SECRET.
 * Il s'exécute uniquement sur le poste du développeur, en CLI.
 * La requête générée est affichée dans le terminal — jamais écrite sur disque.
 *
 * Usage :
 *   php scripts/make-admin-sql.php mysql
 *   php scripts/make-admin-sql.php postgres
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

// ── Vérification PHP CLI ──────────────────────────────────────────────────────
if (php_sapi_name() !== 'cli') {
    echo "Ce script doit être exécuté en ligne de commande (CLI PHP).\n";
    exit(1);
}

// ── Moteur cible ──────────────────────────────────────────────────────────────
$engine = strtolower($argv[1] ?? '');
if (!in_array($engine, ['mysql', 'postgres'], true)) {
    fwrite(STDERR, "Usage : php scripts/make-admin-sql.php <mysql|postgres>\n");
    exit(1);
}

// ── Fonctions utilitaires ─────────────────────────────────────────────────────

function prompt_hidden(string $label): string
{
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        // Windows : pas de stty, on lit en clair avec avertissement
        fwrite(STDERR, "[ATTENTION] Le mot de passe sera visible sur Windows.\n");
        fwrite(STDERR, $label);
        $input = fgets(STDIN);
    } else {
        // Unix/macOS : cacher la saisie
        fwrite(STDERR, $label);
        shell_exec('stty -echo');
        $input = fgets(STDIN);
        shell_exec('stty echo');
        fwrite(STDERR, "\n");
    }
    return rtrim((string)$input);
}

function generate_uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return sprintf(
        '%s-%s-%s-%s-%s',
        bin2hex(substr($bytes, 0, 4)),
        bin2hex(substr($bytes, 4, 2)),
        bin2hex(substr($bytes, 6, 2)),
        bin2hex(substr($bytes, 8, 2)),
        bin2hex(substr($bytes, 10, 6))
    );
}

// ── Saisie interactive ────────────────────────────────────────────────────────

fwrite(STDERR, "\n=== CYM Pharma — Génération du compte administrateur ===\n\n");
fwrite(STDERR, "Moteur cible : {$engine}\n\n");

fwrite(STDERR, "Adresse e-mail admin : ");
$email = trim((string)fgets(STDIN));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Adresse e-mail invalide.\n");
    exit(1);
}

fwrite(STDERR, "Nom d'affichage (ex: Administrateur CYM) : ");
$displayName = trim((string)fgets(STDIN));
if ($displayName === '') {
    $displayName = 'Administrateur';
}

$password = prompt_hidden("Mot de passe (min. 12 caractères) : ");
if (strlen($password) < 12) {
    fwrite(STDERR, "Mot de passe trop court (minimum 12 caractères requis).\n");
    exit(1);
}

$passwordConfirm = prompt_hidden("Confirmer le mot de passe : ");
if ($password !== $passwordConfirm) {
    fwrite(STDERR, "Les mots de passe ne correspondent pas.\n");
    exit(1);
}

// ── Génération du hash bcrypt (coût 12) ──────────────────────────────────────
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
if ($hash === false || $hash === null) {
    fwrite(STDERR, "Impossible de générer le hash bcrypt.\n");
    exit(1);
}

// Effacer le mot de passe de la mémoire
$password = str_repeat("\0", 64);
$passwordConfirm = str_repeat("\0", 64);
unset($password, $passwordConfirm);

$uuid = generate_uuid_v4();
$now  = date('Y-m-d H:i:s');

// ── Génération de la requête SQL ──────────────────────────────────────────────
fwrite(STDERR, "\n────────────────────────────────────────────────────────────\n");
fwrite(STDERR, "Requête SQL générée (copiez et exécutez en console) :\n");
fwrite(STDERR, "────────────────────────────────────────────────────────────\n\n");

if ($engine === 'mysql') {
    $emailEsc = addslashes($email);
    $nameEsc  = addslashes($displayName);
    // Note : le hash bcrypt ne contient pas de guillemets simples
    $sql = <<<SQL
INSERT INTO `users`
  (`id`, `email`, `password_hash`, `role`, `name`, `status`, `created_at`, `updated_at`)
VALUES (
  '{$uuid}',
  '{$emailEsc}',
  '{$hash}',
  'admin',
  '{$nameEsc}',
  'active',
  '{$now}',
  '{$now}'
)
ON DUPLICATE KEY UPDATE
  `password_hash` = '{$hash}',
  `role`          = 'admin',
  `status`        = 'active',
  `updated_at`    = NOW();
SQL;
} else {
    // PostgreSQL — utiliser des dollar-quoting pour le hash
    $emailEscPg = str_replace("'", "''", $email);
    $nameEscPg  = str_replace("'", "''", $displayName);
    $sql = <<<SQL
INSERT INTO public.users
  (id, email, password_hash, role, name, status, created_at, updated_at)
VALUES (
  '{$uuid}',
  '{$emailEscPg}',
  '{$hash}',
  'admin',
  '{$nameEscPg}',
  'active',
  '{$now}',
  '{$now}'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role          = 'admin',
  status        = 'active',
  updated_at    = NOW();
SQL;
}

// Écrire la requête sur STDOUT (redirigeable si besoin)
echo $sql . "\n";

fwrite(STDERR, "\n[OK] Requête affichée. Ne PAS la sauvegarder dans un fichier suivi par Git.\n");
fwrite(STDERR, "     UUID généré : {$uuid}\n\n");
exit(0);

<?php
/**
 * api/helpers/phone.php
 * ─────────────────────────────────────────────────────────────────────────────
 * Normalisation et validation stricte des numéros de téléphone pour la Côte d'Ivoire (+225).
 * Plan national à 10 chiffres (en vigueur depuis le 31 janvier 2021).
 *
 * Format WhatsApp attendu pour wa.me : "225" + 10 chiffres (13 chiffres au total).
 * Exemple : 2250707079746
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

/**
 * Normalise un numéro de téléphone ivoirien.
 *
 * @param string|null $rawPhone
 * @return array{isValid: bool, normalized: ?string, formatted: string, error?: string}
 */
function normalize_ivorian_phone(?string $rawPhone): array {
    if ($rawPhone === null || trim($rawPhone) === '') {
        return [
            'isValid'    => false,
            'normalized' => null,
            'formatted'  => '',
            'error'      => 'Numéro de téléphone non renseigné.',
        ];
    }

    $raw = trim($rawPhone);
    // 1. Nettoyer les séparateurs
    $cleaned = preg_replace('/[\s\-\.\(\)\/]/', '', $raw);

    if (empty($cleaned)) {
        return [
            'isValid'    => false,
            'normalized' => null,
            'formatted'  => $raw,
            'error'      => 'Numéro de téléphone vide.',
        ];
    }

    // 2. Traiter le préfixe international
    if (str_starts_with($cleaned, '+')) {
        $cleaned = substr($cleaned, 1);
    } elseif (str_starts_with($cleaned, '00')) {
        $cleaned = substr($cleaned, 2);
    }

    // Vérifier si seuls des chiffres restent
    if (!ctype_digit($cleaned)) {
        return [
            'isValid'    => false,
            'normalized' => null,
            'formatted'  => $raw,
            'error'      => 'Le numéro contient des caractères non numériques invalides.',
        ];
    }

    // 3. Détecter l'ancien format à 8 chiffres (ex: 70707974 ou 22570707974)
    if (strlen($cleaned) === 8 || (str_starts_with($cleaned, '225') && strlen($cleaned) === 11)) {
        return [
            'isValid'    => false,
            'normalized' => null,
            'formatted'  => $raw,
            'error'      => 'Ancien numéro à 8 chiffres détecté : le préfixe opérateur à 10 chiffres (01, 05 ou 07) ne peut être deviné. Veuillez corriger le numéro.',
        ];
    }

    // 4. Analyser la longueur et le préfixe
    $tenDigitNational = '';

    if (str_starts_with($cleaned, '225')) {
        $rest = substr($cleaned, 3);
        if (strlen($rest) === 10) {
            $tenDigitNational = $rest;
        } else {
            return [
                'isValid'    => false,
                'normalized' => null,
                'formatted'  => $raw,
                'error'      => "Numéro incomplet après l'indicatif 225 (" . strlen($rest) . " chiffres au lieu de 10).",
            ];
        }
    } elseif (strlen($cleaned) === 10) {
        if (!str_starts_with($cleaned, '0')) {
            return [
                'isValid'    => false,
                'normalized' => null,
                'formatted'  => $raw,
                'error'      => 'Un numéro national ivoirien à 10 chiffres doit débuter par 0 (ex: 07, 05, 01).',
            ];
        }
        $tenDigitNational = $cleaned;
    } else {
        return [
            'isValid'    => false,
            'normalized' => null,
            'formatted'  => $raw,
            'error'      => "Longueur invalide (" . strlen($cleaned) . " chiffres). Format attendu : 10 chiffres ou +225 suivi de 10 chiffres.",
        ];
    }

    $normalized = "225" . $tenDigitNational;
    $formatted = sprintf(
        '+225 %s %s %s %s %s',
        substr($tenDigitNational, 0, 2),
        substr($tenDigitNational, 2, 2),
        substr($tenDigitNational, 4, 2),
        substr($tenDigitNational, 6, 2),
        substr($tenDigitNational, 8, 2)
    );

    return [
        'isValid'    => true,
        'normalized' => $normalized,
        'formatted'  => $formatted,
    ];
}

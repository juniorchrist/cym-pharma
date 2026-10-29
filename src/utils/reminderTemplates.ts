/**
 * src/utils/reminderTemplates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Modèles de relance client CYM Pharma pour WhatsApp Business direct.
 *
 * Règles :
 *  - Texte brut, AUCUN emoji d'interface ni dans les modèles par défaut.
 *  - Variables {structure} et {responsable} remplacées avant ouverture.
 *  - Aucune information de stock, prix ou disponibilité dans les modèles par défaut.
 *  - Modèle 4 ("Nouveautés") restreint avec avertissement explicite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ReminderTemplate, User } from '../types';

export const DEFAULT_REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    template_key: 'reprise_contact',
    title: 'Reprise de contact',
    content:
      "Bonjour {responsable}, c'est CYM Pharma. Nous n'avons pas reçu de commande de {structure} depuis un moment. Avez-vous un besoin à nous confier ? Nous restons disponibles.",
    is_default: 1,
    sort_order: 1,
  },
  {
    template_key: 'reapprovisionnement',
    title: 'Réapprovisionnement',
    content:
      'Bonjour {responsable}, c\'est CYM Pharma. Souhaitez-vous que nous préparions un réapprovisionnement pour {structure} ? Dites-nous vos références.',
    is_default: 0,
    sort_order: 2,
  },
  {
    template_key: 'espace_client',
    title: 'Votre espace client',
    content:
      'Bonjour {responsable}, c\'est CYM Pharma. Votre espace client vous permet de commander et de suivre vos livraisons à tout moment. Besoin d\'aide pour vous connecter ?',
    is_default: 0,
    sort_order: 3,
  },
  {
    template_key: 'nouveautes',
    title: 'Nouveautés',
    content:
      'Bonjour {responsable}, c\'est CYM Pharma. De nouvelles références sont disponibles dans notre catalogue. Souhaitez-vous que nous vous les présentions ?',
    is_default: 0,
    sort_order: 4,
    warning_note:
      'Attention : à n\'utiliser que si de nouvelles références réelles ont été ajoutées au catalogue.',
  },
];

const LOCAL_STORAGE_KEY = 'cym_reminder_templates';

/**
 * Charge les modèles depuis localStorage ou renvoie les modèles par défaut.
 */
export function getLocalReminderTemplates(): ReminderTemplate[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Erreur de parsing ou localStorage indisponible
  }
  return DEFAULT_REMINDER_TEMPLATES;
}

/**
 * Sauvegarde les modèles modifiés dans localStorage.
 */
export function saveLocalReminderTemplates(templates: ReminderTemplate[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(templates));
  } catch (err) {
    console.warn('Impossible de sauvegarder les modèles dans localStorage:', err);
  }
}

/**
 * Réinitialise aux modèles par défaut.
 */
export function resetLocalReminderTemplates(): ReminderTemplate[] {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {}
  return DEFAULT_REMINDER_TEMPLATES;
}

/**
 * Remplace les variables {responsable} et {structure} dans le texte du modèle.
 */
export function interpolateReminderMessage(templateText: string, user: Partial<User>): string {
  const responsable =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.name?.trim() ||
    'Docteur';

  const structure =
    user.establishment_name?.trim() ||
    user.org?.trim() ||
    'votre établissement';

  return templateText
    .replace(/\{responsable\}/gi, responsable)
    .replace(/\{structure\}/gi, structure);
}

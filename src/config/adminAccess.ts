// TODO: vérification à déplacer côté serveur — c'est une protection purement côté client, ne la présente pas comme sécurisée.
export const ADMIN_PASSWORDS = ['admin2026', 'admin'];

export function verifyAdminPassword(password: string): boolean {
  return ADMIN_PASSWORDS.includes(password.trim());
}

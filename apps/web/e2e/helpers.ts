import type { Page } from '@playwright/test';

export const E2E = {
  admin: { email: 'admin@e2e.test', password: 'e2e1234', tenantSlug: 'e2e' },
  superAdmin: { email: 'super@e2e.test', password: 'e2e1234' },
} as const;

/**
 * Login via le formulaire — vérifie aussi le redirect après auth.
 * À utiliser dans les tests qui veulent valider le parcours UI complet.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/fr/login');
  await page.getByLabel("Identifiant de l'établissement").fill(E2E.admin.tenantSlug);
  await page.getByLabel('Adresse email').fill(E2E.admin.email);
  await page.getByLabel('Mot de passe').fill(E2E.admin.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/fr\/admin/);
}

export async function loginAsSuperAdmin(page: Page) {
  await page.goto('/fr/login');
  // Bascule en mode super-admin (le toggle masque le champ slug)
  await page.getByRole('button', { name: /super-admin/i }).click();
  await page.getByLabel('Adresse email').fill(E2E.superAdmin.email);
  await page.getByLabel('Mot de passe').fill(E2E.superAdmin.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/fr\/super-admin/);
}

import { test, expect } from '@playwright/test';
import { E2E, loginAsAdmin, loginAsSuperAdmin } from './helpers';

test.describe('Authentification', () => {
  test('login admin → dashboard tenant avec KPI', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    // KPI "Élèves" présent (compteur géré par RLS)
    await expect(page.getByText('Élèves', { exact: false }).first()).toBeVisible();
  });

  test('login super-admin → liste des établissements', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await expect(page.getByRole('heading', { name: 'Super-admin SaaS' })).toBeVisible();
    await expect(page.getByText('Établissement E2E')).toBeVisible();
  });

  test('credentials invalides → message d’erreur', async ({ page }) => {
    await page.goto('/fr/login');
    await page.getByLabel("Identifiant de l'établissement").fill(E2E.admin.tenantSlug);
    await page.getByLabel('Adresse email').fill(E2E.admin.email);
    await page.getByLabel('Mot de passe').fill('wrong-password');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/identifiants incorrects/i)).toBeVisible();
  });

  test('/fr/admin sans session → redirection vers /fr/login', async ({ page }) => {
    await page.goto('/fr/admin');
    await expect(page).toHaveURL(/\/fr\/login/);
  });
});

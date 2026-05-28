import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Invitation utilisateur', () => {
  test('inviter un enseignant + voir le mot de passe temporaire', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/fr/admin/settings/users');

    const email = `prof-${Date.now()}@e2e.test`;
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="lastName"]').fill('Invité');
    await page.locator('input[name="firstName"]').fill('Test');
    await page.locator('select[name="personType"]').selectOption('TEACHER');
    await page.locator('select[name="roleCode"]').selectOption('enseignant');

    await page.getByRole('button', { name: 'Créer le compte' }).click();

    // L'encart succès apparaît avec l'email + un mot de passe de 10 caractères
    await expect(page.getByText('Compte créé')).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    const passwordLocator = page.locator('text=mot de passe').locator('..').locator('span').first();
    await expect(passwordLocator).toBeVisible();

    // L'utilisateur apparaît aussi dans la table
    await expect(page.locator('table').getByRole('cell', { name: email })).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Persons CRUD', () => {
  test('créer un élève, le voir dans la liste, ouvrir sa fiche', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/fr/admin/persons?type=STUDENT');
    await page.getByRole('link', { name: 'Nouvelle personne' }).click();
    await page.waitForURL(/\/admin\/persons\/new/, { timeout: 20_000 });

    const uniqueLastName = `Test${Date.now()}`;
    await page.locator('input[name="lastName"]').fill(uniqueLastName);
    await page.locator('input[name="firstName"]').fill('Karim');
    await page.locator('input[name="birthDate"]').fill('2012-05-12');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await page.waitForURL(/\/admin\/persons\/[0-9a-f-]+$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: new RegExp(uniqueLastName) })).toBeVisible();

    await page.goto('/fr/admin/persons?type=STUDENT');
    await expect(page.getByText(uniqueLastName).first()).toBeVisible();
  });

  test('archiver un élève — il disparaît de la liste active', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/fr/admin/persons/new?type=STUDENT');

    const lastName = `Archive${Date.now()}`;
    await page.locator('input[name="lastName"]').fill(lastName);
    await page.locator('input[name="firstName"]').fill('A');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.waitForURL(/\/admin\/persons\/[0-9a-f-]+$/, { timeout: 20_000 });

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Archiver' }).click();

    await page.waitForURL(/\/admin\/persons(\?|$)/, { timeout: 20_000 });
    await expect(page.locator('tbody').getByText(lastName)).not.toBeVisible();

    await page.getByRole('link', { name: 'Voir les archivés' }).click();
    await expect(page.locator('tbody').getByText(lastName)).toBeVisible();
  });
});

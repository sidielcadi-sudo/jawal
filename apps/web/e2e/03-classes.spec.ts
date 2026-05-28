import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Classes + inscriptions', () => {
  // Le test crée 2 élèves puis 1 classe + 1 inscription → beaucoup de routes
  // à compiler en dev. 90 s.
  test('créer une classe puis inscrire un élève', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsAdmin(page);

    // Créer 2 élèves d'abord (pour avoir des inscrits possibles)
    for (const name of ['Aaa', 'Bbb']) {
      await page.goto('/fr/admin/persons/new?type=STUDENT');
      await page.locator('input[name="lastName"]').fill(`Test${name}${Date.now()}`);
      await page.locator('input[name="firstName"]').fill(name);
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await page.waitForURL(/\/admin\/persons\/[0-9a-f-]+$/, { timeout: 20_000 });
    }

    // Aller créer une classe
    await page.goto('/fr/admin/classes');
    await page.getByRole('link', { name: 'Nouvelle classe' }).click();
    await page.waitForURL(/\/admin\/classes\/new/, { timeout: 20_000 });

    const className = `TestClass-${Date.now()}`;
    await page.locator('input[name="name"]').fill(className);
    // Le select Niveau affiche "<cycle> — <niveau>"
    await page.locator('select[name="levelId"]').selectOption({ label: 'Collège — 1AC' });
    await page.locator('input[name="capacity"]').fill('25');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await page.waitForURL(/\/admin\/classes\/[0-9a-f-]+$/, { timeout: 45_000 });
    await expect(page.getByRole('heading', { name: new RegExp(className) })).toBeVisible();
    await expect(page.getByText('0/25').first()).toBeVisible();

    // Inscrire un élève via le picker (1er option = placeholder, donc index 1)
    await page.getByLabel(/Choisir un élève/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Inscrire', exact: true }).click();

    await expect(page.getByText('1/25').first()).toBeVisible({ timeout: 10_000 });
  });
});

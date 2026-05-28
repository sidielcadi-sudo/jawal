import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Import CSV', () => {
  test('preview + commit d’un CSV de 3 élèves', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/fr/admin/persons/import');

    const tag = `CSV${Date.now()}`;
    const csv = `type,firstName,lastName,birthDate
STUDENT,A,${tag}-A,2012-01-01
STUDENT,B,${tag}-B,2012-02-02
STUDENT,C,${tag}-C,2012-03-03`;

    await page.locator('textarea').first().fill(csv);
    await page.getByRole('button', { name: 'Prévisualiser' }).click();

    // Vue preview
    await expect(page.getByText(/3.*valide/i)).toBeVisible();
    await page.getByRole('button', { name: /Importer 3/i }).click();

    // Done
    await expect(page.getByText('Import terminé')).toBeVisible();
    await expect(page.getByText(/3\s*\/\s*3/)).toBeVisible();

    // Vérif côté liste élèves
    await page.goto('/fr/admin/persons?type=STUDENT');
    await expect(page.getByText(`${tag}-A`)).toBeVisible();
    await expect(page.getByText(`${tag}-C`)).toBeVisible();
  });
});

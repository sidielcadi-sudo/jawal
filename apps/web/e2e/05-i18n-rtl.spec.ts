import { test, expect } from '@playwright/test';

test.describe('i18n FR/AR + RTL', () => {
  test('/ar/login rend en RTL avec textes arabes', async ({ page }) => {
    await page.goto('/ar/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  });

  test('/fr/login rend en LTR avec textes français', async ({ page }) => {
    await page.goto('/fr/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  });

  test('/ → redirige vers /fr (locale par défaut)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/fr\/?/);
  });
});

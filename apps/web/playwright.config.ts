import { defineConfig, devices } from '@playwright/test';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'pnpm dev --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://jawal:jawal@localhost:5433/jawal_e2e?schema=public',
      DATABASE_URL_APP:
        process.env.E2E_DATABASE_URL_APP ??
        'postgresql://jawal_app:jawal_app@localhost:5433/jawal_e2e?schema=public',
      AUTH_SECRET: 'e2e-test-secret-do-not-use-in-prod-xxxxxxxxxxxxx',
      // Cf. src/lib/auth/config.ts : AUTH_URL ferait réécrire l'origine des
      // requêtes par next-auth. L'hôte vient des en-têtes.
      AUTH_TRUST_HOST: 'true',
      APP_URL: BASE_URL,
      ROOT_DOMAIN: 'jawal.local',
      NODE_OPTIONS: '--use-system-ca',
    },
  },
});

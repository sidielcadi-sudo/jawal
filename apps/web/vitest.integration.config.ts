import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://jawal:jawal@localhost:5433/jawal_test?schema=public';
const TEST_DB_APP_URL =
  process.env.TEST_DATABASE_URL_APP ??
  'postgresql://jawal_app:jawal_app@localhost:5433/jawal_test?schema=public';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Doit être positionné AVANT le chargement des modules — sinon le singleton
    // prismaAdmin de @jawal/db est créé avec la mauvaise URL.
    env: {
      DATABASE_URL: TEST_DB_URL,
      DATABASE_URL_APP: TEST_DB_APP_URL,
      NODE_ENV: 'test',
    },
    server: {
      deps: {
        inline: ['@jawal/db', 'next-auth'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(here, './src'),
      'server-only': path.resolve(here, './tests/integration/stubs/server-only.ts'),
    },
  },
});

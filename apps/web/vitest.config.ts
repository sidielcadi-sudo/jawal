import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Config unit-tests (rapide, sans DB).
 * Voir vitest.integration.config.ts pour les tests d'intégration avec DB.
 */
export default defineConfig({
  test: {
    name: 'unit',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(here, './src'),
    },
  },
});

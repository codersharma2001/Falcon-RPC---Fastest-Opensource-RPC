import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    typecheck: {
      tsconfig: './tsconfig.vitest.json'
    },
    coverage: {
      enabled: false
    }
  }
});

import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/runtime-assets/retry.fixture.ts'],
    retry: 1,
    sequence: { concurrent: true },
  },
});

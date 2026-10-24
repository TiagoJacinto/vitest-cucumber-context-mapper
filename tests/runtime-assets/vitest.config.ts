import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/runtime-assets/failure.fixture.ts'],
    sequence: { concurrent: true },
  },
});

import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/runtime-assets/setup-failure.fixture.ts'] } });

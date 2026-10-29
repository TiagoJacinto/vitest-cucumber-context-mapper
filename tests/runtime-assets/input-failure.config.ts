import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/runtime-assets/input-failure.fixture.ts'] } });

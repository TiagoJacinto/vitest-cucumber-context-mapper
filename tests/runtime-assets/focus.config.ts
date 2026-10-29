import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/runtime-assets/focus.fixture.ts'], allowOnly: !process.env.BDD_FORBID_ONLY } });

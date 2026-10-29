import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { gherkinFeaturePlugin } from './src/vite-plugin.ts';

export default defineConfig({
  plugins: [gherkinFeaturePlugin()],
  test: {
    include: ['tests/scoped-runtime.test.ts', 'tests/localized.test.ts', 'tests/selection.test.ts', 'tests/no-effect.test.ts', 'example/checkout.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: {
        ...(process.env.BDD_BROWSER_EXECUTABLE ? { executablePath: process.env.BDD_BROWSER_EXECUTABLE } : {}),
        ...(process.getuid?.() === 0 ? { args: ['--no-sandbox'] } : {}),
      } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});

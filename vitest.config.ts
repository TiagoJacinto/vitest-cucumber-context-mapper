import { defineConfig } from 'vitest/config';
import { gherkinFeaturePlugin } from './src/vite-plugin.ts';

export default defineConfig({
  plugins: [gherkinFeaturePlugin()],
});

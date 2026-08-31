import { defineConfig } from 'vitest/config';
import { vendorAlias } from './vendorAlias.js';

export default defineConfig({
  /* Must mirror vite.config.ts, or a test that reaches engine code fails on a
     missing package that is in fact vendored — see vendorAlias.ts. */
  resolve: { alias: vendorAlias },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});

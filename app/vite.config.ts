import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vendorAlias } from './vendorAlias'

/* The site is served from a project page — kenkomu.github.io/airlock/ — so every
 * asset URL needs that prefix. It is an env var rather than a literal because
 * `pnpm dev` and `pnpm preview` serve from the root, and hardcoding the prefix
 * would break both. The Pages workflow sets it; nothing else does.
 */
export default defineConfig({
  base: process.env.AIRLOCK_BASE ?? '/',
  plugins: [react()],
  resolve: { alias: vendorAlias },
})

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* The site is served from a project page — kenkomu.github.io/airlock/ — so every
 * asset URL needs that prefix. It is an env var rather than a literal because
 * `pnpm dev` and `pnpm preview` serve from the root, and hardcoding the prefix
 * would break both. The Pages workflow sets it; nothing else does.
 */
export default defineConfig({
  base: process.env.AIRLOCK_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      /* The vendored bridge engine imports the pool SDK by its package name. The
       * SDK is vendored too — GitHub Packages needs a credential CI does not
       * have, and a token expiring mid-sprint would stop the site deploying —
       * so the name is mapped to the local copy here rather than by editing 7
       * files inside a dependency we want to keep byte-identical to upstream.
       *
       * Mirrored in tsconfig.app.json `paths`, which is what makes the types
       * resolve; this one is what makes the bundle resolve. Both are needed and
       * they must not drift. */
      '@starkware-libs/starknet-privacy-sdk': fileURLToPath(
        new URL('./vendor/starknet-privacy-sdk/dist/index.js', import.meta.url),
      ),
    },
  },
})

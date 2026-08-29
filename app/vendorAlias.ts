import { fileURLToPath } from 'node:url';

/* Where the vendored pool SDK actually lives.
 *
 * The vendored bridge engine imports the SDK by its package name. The SDK is
 * vendored too — GitHub Packages needs a credential CI does not have, and a
 * token expiring mid-sprint would stop the site deploying — so the name is
 * mapped to the local copy rather than by editing seven files inside a
 * dependency we want to keep byte-identical to upstream.
 *
 * It lives here, alone, because three separate tools need to agree on it and
 * two of them silently do nothing useful when they disagree: `vite.config.ts`
 * makes the bundle resolve, `vitest.config.ts` makes the tests resolve, and
 * `tsconfig.app.json` `paths` makes the types resolve. The tsconfig one cannot
 * import this, so it stays a duplicate; the two that can, do.
 *
 * The failure that prompted this: vitest had no alias at all, so any test that
 * reached engine code touching the pool died on "Cannot find package
 * @starkware-libs/starknet-privacy-sdk" — which reads like a missing
 * dependency and is really a missing line of config.
 */
export const vendorAlias = {
  '@starkware-libs/starknet-privacy-sdk': fileURLToPath(
    new URL('./vendor/starknet-privacy-sdk/dist/index.js', import.meta.url),
  ),
};

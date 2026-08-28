/* Which chain the bridge legs run against.
 *
 * This decides where real money goes, so both directions of the mistake are
 * pinned: an unset value must not wander onto testnet and quietly do nothing,
 * and a typo must not fall back to mainnet and quietly spend.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

async function withEnv(value: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_AIRLOCK_BRIDGE_NETWORK', value as string);
  return import('../deposit');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('bridgeNetwork', () => {
  it('defaults to mainnet when unset', async () => {
    /* The deployed site must read the chain it is deployed against. A build
       that silently pointed at testnet would show a live-looking interface
       reading the wrong pool. */
    const { bridgeNetwork } = await withEnv('');
    expect(bridgeNetwork()).toBe('mainnet');
  });

  it('accepts testnet when asked for explicitly', async () => {
    const { bridgeNetwork } = await withEnv('testnet');
    expect(bridgeNetwork()).toBe('testnet');
  });

  it('tolerates case and whitespace, because env files collect both', async () => {
    const { bridgeNetwork } = await withEnv('  Testnet  ');
    expect(bridgeNetwork()).toBe('testnet');
  });

  it('throws on anything else rather than guessing', async () => {
    /* The dangerous fallback would be mainnet: a typo would then spend real
       money while the author believed they were rehearsing. */
    const { bridgeNetwork } = await withEnv('sepolia');
    expect(() => bridgeNetwork()).toThrow(/must be 'mainnet' or 'testnet'/);
  });
});

describe('bridgeRpcUrl', () => {
  it('follows the chosen network', async () => {
    /* A deploy check pointed at the wrong chain would look for an account that
       the deposit never touches, and report it missing forever. */
    const { bridgeRpcUrl } = await withEnv('');
    expect(bridgeRpcUrl('mainnet')).toContain('mainnet');
    expect(bridgeRpcUrl('testnet')).toContain('sepolia');
  });
});

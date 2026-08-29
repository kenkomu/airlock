/* The engine has to accept the config the app hands it.
 *
 * It did not. `initBridgeConfig` requires `OZ_ACCOUNT_CLASS_HASH` for both
 * networks — there is no baked default for either — and the app was passing
 * only NETWORK. So the very first call in `runDeposit` threw
 *
 *   Config error: OZ_ACCOUNT_CLASS_HASH_MAINNET (or the shared
 *   OZ_ACCOUNT_CLASS_HASH) is not set for network 'mainnet'
 *
 * before any deposit could start. It failed closed, so nothing was ever at
 * risk, but nothing could ever work either — and no unit test caught it,
 * because every test stopped short of starting the engine.
 *
 * This one starts it. `initBridgeConfig` is pure config resolution with no
 * network access, so it is safe to run in CI, and it is the only place the
 * mistake was visible.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OZ_ACCOUNT_CLASS_HASH } from '../accountClass';

async function engineConfigFor(network: 'mainnet' | 'testnet') {
  vi.resetModules();
  vi.stubEnv('VITE_AIRLOCK_BRIDGE_NETWORK', network);
  const { bridgeVars } = await import('../deposit');
  const { initBridgeConfig, config } = await import(
    '../../../vendor/bridge-core/src/core/config'
  );
  initBridgeConfig({ dev: false, prod: true, vars: bridgeVars() });
  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(['mainnet', 'testnet'] as const)('engine config on %s', (network) => {
  it('starts at all', async () => {
    await expect(engineConfigFor(network)).resolves.toBeDefined();
  });

  it('deploys against the same class the address was derived from', async () => {
    /* The mismatch this rules out is the expensive one: the engine deploying a
       different address than the app displayed, so the STRK the user was told
       to send lands in an account the deposit never touches. */
    const config = await engineConfigFor(network);
    expect(BigInt(config.ozClassHash)).toBe(BigInt(OZ_ACCOUNT_CLASS_HASH));
  });

  it('gives the engine an RPC it can actually reach', async () => {
    /* The engine's default is `/rpc`, a same-origin path that needs a dev proxy
       or an OHTTP gateway behind it. Airlock is a static app with neither, so
       an unoverridden engine sends every read to its own origin and gets HTML
       back. */
    const config = await engineConfigFor(network);
    expect(config.rpcUrl).toMatch(/^https:\/\//);
    expect(config.rpcUrl).toContain(network === 'mainnet' ? 'mainnet' : 'sepolia');
  });

  it('points the pool at the network it was asked for', async () => {
    /* A config that started but silently resolved the other network's pool
       would be worse than one that threw. */
    const config = await engineConfigFor(network);
    expect(config.chainId).toBe(
      network === 'mainnet' ? '0x534e5f4d41494e' : '0x534e5f5345504f4c4941',
    );
    expect(BigInt(config.poolAddress)).toBe(
      BigInt(
        network === 'mainnet'
          ? '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a'
          : '0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91',
      ),
    );
  });
});

/* The client and the deployed contract, checked against each other.
 *
 * Every other test in this suite proves the client is self-consistent. This one
 * proves it agrees with the contract that is actually deployed — that the span
 * decoder matches Cairo's serialisation, that the ladder on chain is the ladder
 * the UI draws, and that an amount off the ladder comes back as a refusal
 * rather than as a plan the pool would reject later.
 *
 * Opt-in, because it needs the network and a live deployment:
 *
 *     AIRLOCK_LIVE=1 pnpm vitest run
 *
 * Left out of CI deliberately. A green pipeline should mean "the code is
 * correct", not "a public RPC answered within the timeout"; a network flake
 * failing an unrelated pull request teaches people to ignore red.
 */

import { describe, expect, it } from 'vitest';
import { RpcProvider } from 'starknet';
import { buildDenominate, fetchDenominations, fetchPlan } from '../actions';
import { SN_SEPOLIA, networkFor } from '../networks';

const live = process.env.AIRLOCK_LIVE === '1';
const net = networkFor(SN_SEPOLIA)!;
const M = 1_000_000n;
const OWNER = '0x05c66f610289cb55ec63ac953a3c3cc1f3812438ddef444f73f026c468a15802';

describe.skipIf(!live)('against the deployed Sepolia anonymizer', () => {
  const provider = new RpcProvider({ nodeUrl: net.rpcUrls[0] });
  const bucketer = net.bucketer!;

  it('reads the ladder the UI claims to enforce', async () => {
    expect(await fetchDenominations(provider, bucketer)).toEqual(
      [1000n, 500n, 250n, 100n, 50n, 25n, 10n, 5n, 1n].map((x) => x * M),
    );
  }, 30_000);

  it('agrees with the contract on how 847 splits', async () => {
    const legs = await fetchPlan(provider, bucketer, 847n * M);
    expect(legs).toEqual([500n, 250n, 50n, 25n, 10n, 10n, 1n, 1n].map((x) => x * M));
    expect(legs.reduce((a, b) => a + b, 0n)).toBe(847n * M);
  }, 30_000);

  it('builds an action array from the plan the chain supplied', async () => {
    const amount = 3n * M;
    const legs = await fetchPlan(provider, bucketer, amount);
    const actions = buildDenominate({ network: net, token: net.usdc, amount, legs, owner: OWNER });

    /* One withdraw, one note per leg, one invoke. */
    expect(actions).toHaveLength(legs.length + 2);
    expect(actions[0].type).toBe('withdraw');
    expect(actions.at(-1)?.type).toBe('invoke');
  }, 30_000);

  it('refuses an amount off the ladder instead of inventing a plan', async () => {
    /* 847.32 is the figure the whole project exists to talk about. The contract
       reverts NOT_ON_LADDER; what matters here is that the client surfaces that
       rather than silently rounding. */
    await expect(fetchPlan(provider, bucketer, 847_320_000n)).rejects.toThrow();
  }, 30_000);
});

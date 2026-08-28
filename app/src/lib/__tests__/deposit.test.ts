/* The interrupted-deposit contract.
 *
 * This is the guard against burning someone's USDC twice, so it is tested at the
 * boundary the app actually relies on: does a thrown `PENDING_POOL_DEPOSIT`
 * become something the interface can offer a Continue for, and does anything
 * else stay an ordinary error?
 *
 * The engine itself is not re-tested here — it is vendored, and upstream's own
 * suite covers it. What is tested is the seam, because a mistake in recognising
 * that error would turn a safe refusal into a retry loop that burns again.
 */

import { describe, expect, it } from 'vitest';
import { asPendingDeposit } from '../deposit';

/* Shaped exactly as `moveIntoPool` throws it. */
function pendingError(netWei: bigint): Error {
  const err = new Error(
    'A previous pool deposit is still in progress — continue it before starting a new deposit.',
  ) as Error & { code: string; pendingNetWei: bigint };
  err.code = 'PENDING_POOL_DEPOSIT';
  err.pendingNetWei = netWei;
  return err;
}

describe('asPendingDeposit', () => {
  it('recognises an interrupted deposit and carries the amount already moved', () => {
    /* The amount matters: it is what is sitting on the account, and it is what
       Continue will deposit — not whatever is currently typed in the form. */
    const found = asPendingDeposit(pendingError(2_500_000n));
    expect(found).not.toBeNull();
    expect(found?.pendingNetWei).toBe(2_500_000n);
  });

  it('does not mistake an ordinary failure for one', () => {
    /* The dangerous direction. Treating a normal error as "interrupted" would
       offer Continue, and continuing sends `resume: true`, which tells the engine
       to skip the burn it has not actually done. */
    expect(asPendingDeposit(new Error('network request failed'))).toBeNull();
    expect(asPendingDeposit(new Error('user rejected the request'))).toBeNull();
    expect(asPendingDeposit({ code: 'INSUFFICIENT_BALANCE' })).toBeNull();
    expect(asPendingDeposit(null)).toBeNull();
    expect(asPendingDeposit(undefined)).toBeNull();
  });

  it('is not fooled by an error that merely mentions it', () => {
    /* The code is the contract, not the wording. Message text gets rewritten. */
    expect(
      asPendingDeposit(new Error('PENDING_POOL_DEPOSIT happened earlier')),
    ).toBeNull();
  });

  it('survives an interrupted error with no amount attached', () => {
    /* Defensive: the code is what identifies it. If the amount is missing we
       still owe the user a Continue rather than an error — a deposit really is
       in flight. Zero is honest about not knowing, and the resume path reads the
       live balance anyway rather than trusting this number. */
    const err = new Error('interrupted') as Error & { code: string };
    err.code = 'PENDING_POOL_DEPOSIT';
    expect(asPendingDeposit(err)?.pendingNetWei).toBe(0n);
  });
});

describe('asNeedsGas', () => {
  it('recognises an account that cannot pay to create itself', async () => {
    /* Carries the address, because sending STRK there is the only thing that
       unblocks it — an error string with no address would be a dead end. */
    const { asNeedsGas } = await import('../deposit');
    const err = new Error('needs gas') as Error & {
      code: string;
      address: string;
      needWei: bigint;
    };
    err.code = 'AIRLOCK_DEPLOY_NEEDS_GAS';
    err.address = '0x0672abc';
    err.needWei = 500_000_000_000_000_000n;
    const found = asNeedsGas(err);
    expect(found?.address).toBe('0x0672abc');
    expect(found?.needWei).toBe(500_000_000_000_000_000n);
  });

  it('does not confuse it with the interrupted-deposit error', async () => {
    /* The two are both "not an ordinary failure" but lead to opposite actions:
       one says send gas, the other says continue a transfer already in flight. */
    const { asNeedsGas, asPendingDeposit } = await import('../deposit');
    const pending = new Error('in progress') as Error & { code: string };
    pending.code = 'PENDING_POOL_DEPOSIT';
    expect(asNeedsGas(pending)).toBeNull();

    const gas = new Error('needs gas') as Error & { code: string };
    gas.code = 'AIRLOCK_DEPLOY_NEEDS_GAS';
    expect(asPendingDeposit(gas)).toBeNull();
  });

  it('stays null for ordinary failures', async () => {
    const { asNeedsGas } = await import('../deposit');
    expect(asNeedsGas(new Error('network request failed'))).toBeNull();
    expect(asNeedsGas(null)).toBeNull();
  });
});

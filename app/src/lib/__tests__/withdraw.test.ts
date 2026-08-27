/* The two withdraw guards that stand between a typo and lost money.
 *
 * `isEvmAddress` runs before anything is signed, because a destination is the
 * one field here with no undo: CCTP mints to whatever address it is given, and
 * an address nobody controls swallows the funds silently.
 *
 * `inflightDestination` decides whether a failure means "an earlier cash-out is
 * still travelling somewhere else". Getting that wrong in the permissive
 * direction would tell the user a resume is happening when it is not.
 */

import { describe, expect, it } from 'vitest';
import { WITHDRAW_STEPS, inflightDestination, isEvmAddress } from '../withdraw';

describe('isEvmAddress', () => {
  it('accepts a well-formed address, in either case', () => {
    expect(isEvmAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
    expect(isEvmAddress('0xABCDEF1234567890abcdef1234567890ABCDEF12')).toBe(true);
  });

  it('tolerates surrounding whitespace, because pasting adds it', () => {
    expect(isEvmAddress('  0x1234567890abcdef1234567890abcdef12345678  ')).toBe(true);
  });

  it('rejects the near-misses that actually happen', () => {
    /* A truncated paste, an extra character, a missing prefix, and a Starknet
       felt pasted into an EVM field — that last one is the dangerous one,
       because it looks like an address to a human. */
    expect(isEvmAddress('0x1234567890abcdef1234567890abcdef123456')).toBe(false);
    expect(isEvmAddress('0x1234567890abcdef1234567890abcdef1234567890')).toBe(false);
    expect(isEvmAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false);
    expect(
      isEvmAddress('0x06c63f43ddfa18ce3e4b39ea4fae212cc65308ba181603d98fb5d5ee4a978643'),
    ).toBe(false);
  });

  it('rejects non-hex that is the right length', () => {
    /* Length alone is not the check — `zzzz…` is 40 characters too. */
    expect(isEvmAddress('0x' + 'z'.repeat(40))).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isEvmAddress('')).toBe(false);
    expect(isEvmAddress('   ')).toBe(false);
  });
});

describe('inflightDestination', () => {
  it('reads the address out of the engine’s refusal', () => {
    /* The address matters: the only way to continue is to ask for that same
       one, so the interface has to be able to show it. */
    const err = new Error(
      'A cash-out to 0xabc1230000000000000000000000000000000000 is already in progress — ' +
        're-enter that address to resume it, or wait for it to complete before ' +
        'cashing out to a different address.',
    );
    expect(inflightDestination(err)).toBe(
      '0xabc1230000000000000000000000000000000000',
    );
  });

  it('does not invent one from an ordinary failure', () => {
    /* The permissive direction is the dangerous one — claiming an in-flight
       cash-out that does not exist tells the user to wait for money that is not
       coming. */
    expect(inflightDestination(new Error('network request failed'))).toBeNull();
    expect(inflightDestination(new Error('user rejected the request'))).toBeNull();
    expect(inflightDestination(new Error('insufficient balance'))).toBeNull();
    expect(inflightDestination(null)).toBeNull();
    expect(inflightDestination('a string, not an error')).toBeNull();
  });

  it('is not fooled by prose that merely mentions a cash-out', () => {
    expect(
      inflightDestination(new Error('the cash-out to your wallet failed')),
    ).toBeNull();
  });
});

describe('WITHDRAW_STEPS', () => {
  it('is the burn, the wait and the arrival, in that order', () => {
    /* Order is what the progress list renders, and out of order it would show
       money arriving before it left. */
    expect(WITHDRAW_STEPS).toEqual(['burn', 'attest', 'mint']);
  });
});

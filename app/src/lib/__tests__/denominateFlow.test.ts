/* What the user is actually shown when the dry run stops them.
 *
 * The rest of this suite tests the predicates in isolation, and that is what
 * let a real bug through once already: every helper was correct, the wiring
 * between them was not, and `tsc` plus 167 green tests said the app was fine
 * while it threw on render. So this file runs the real `denominate()` and reads
 * the message off the stage the panel renders, which is the only string a user
 * ever sees.
 *
 * The case it was written for: a Sepolia account that had never shielded got
 * "The pool refused this transaction in simulation: An error occurred
 * (NOT_REGISTERED)" underneath a banner already explaining, in English, that
 * the account had never shielded. Two voices, one condition, and the tester
 * reasonably believed the jargon one.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Bucketer } from '../networks';

/* The plan comes off the contract, and there is no contract here. Everything
   else in the path is the real code. */
vi.mock('../actions', async (orig) => ({
  ...(await orig<typeof import('../actions')>()),
  fetchPlan: async () => [10n * 10n ** 18n],
  buildDenominate: () => [{ kind: 'stub' }],
}));

const { denominate } = await import('../denominate');

const bucketer: Bucketer = {
  address: '0x1',
  token: '0x2',
  symbol: 'STRK',
  decimals: 18,
  unit: 10n ** 18n,
};

/* A wallet whose dry run throws, and whose real path works. The second half
   matters: it is what distinguishes "simulation stopped this" from "this was
   always going to fail". */
function walletThatSimulates(throws: unknown) {
  return {
    strk20PrepareInvoke: async () => {
      throw throws;
    },
    strk20InvokeTransaction: async () => ({ transaction_hash: '0xhash' }),
  };
}

const provider = { waitForTransaction: async () => ({}) };

async function messageFor(thrown: unknown): Promise<string> {
  const stages: { at: string; message?: string }[] = [];
  await expect(
    denominate({
      account: walletThatSimulates(thrown) as never,
      provider: {} as never,
      network: 'sepolia' as never,
      bucketer,
      owner: '0xowner',
      amount: 10n * 10n ** 18n,
      onStage: (s) => stages.push(s as never),
      simulate: true,
    }),
  ).rejects.toThrow();
  const failed = stages.find((s) => s.at === 'failed');
  expect(failed, `no failed stage; got ${stages.map((s) => s.at).join(' → ')}`).toBeDefined();
  return failed!.message!;
}

describe('what the panel says when simulation refuses', () => {
  it('explains NOT_REGISTERED instead of repeating it', async () => {
    const m = await messageFor(new Error('An error occurred (NOT_REGISTERED)'));

    /* The failure of the old behaviour, stated as a test: the pool's word must
       not survive into the user's message. */
    expect(m).not.toContain('NOT_REGISTERED');
    expect(m).not.toContain('refused this transaction in simulation');

    /* And what replaces it has to carry the fix and the reassurance. Someone
       stopped here has signed nothing and spent nothing, and needs to know
       both that and where to go. */
    expect(m).toMatch(/not registered with the pool/i);
    expect(m).toMatch(/shield/i);
    expect(m).toMatch(/nothing was signed and nothing was spent/i);
  });

  it('still reports other refusals in the pool\'s own words', async () => {
    /* The translation is for one specific, self-clearable condition. Every
       other assert is a real finding the user should see verbatim, because
       guessing at it would be worse than quoting it. */
    const m = await messageFor(new Error('INSUFFICIENT_BALANCE'));
    expect(m).toContain('The pool refused this transaction in simulation');
    expect(m).toContain('INSUFFICIENT_BALANCE');
    expect(m).not.toMatch(/shield/i);
  });

  it('does not stop at all when the wallet simply has no dry run', async () => {
    /* A wallet without simulate is not a refusal, and treating it as one would
       lock out every wallet that can still transact perfectly well. So this
       one runs all the way through to a hash. */
    const stages: { at: string }[] = [];
    const hash = await denominate({
      account: walletThatSimulates(new Error('Unknown request type: strk20PrepareInvoke')) as never,
      provider: provider as never,
      network: 'sepolia' as never,
      bucketer,
      owner: '0xowner',
      amount: 10n * 10n ** 18n,
      onStage: (s) => stages.push(s as never),
      simulate: true,
    });

    expect(hash).toBe('0xhash');
    expect(stages.map((s) => s.at)).toContain('awaiting-signature');
    expect(stages.map((s) => s.at)).not.toContain('failed');
    /* Nor was it reported as unverified: an absent dry run is not a doubt
       about the transaction, it is an absent dry run. */
    expect(stages.map((s) => s.at)).not.toContain('unverified');
  });
});

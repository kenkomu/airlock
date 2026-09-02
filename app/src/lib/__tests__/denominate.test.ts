/* Whether we are entitled to say the pool refused something.
 *
 * The dry run used to report every failure as "the pool rejected this
 * transaction in simulation", including a bare UNKNOWN_ERROR — which is what a
 * wallet returns when it has nothing to say. That invented a finding, and it
 * blocked the button, so a wallet whose simulate is broken while its real path
 * works could not transact at all.
 *
 * The rule now: a named reason is evidence, a shrug is not.
 */

import { describe, expect, it } from 'vitest';
import { isNamedRefusal, isNotRegistered } from '../denominate';

describe('isNamedRefusal', () => {
  it('does not treat a shrug as a refusal', () => {
    /* The case that prompted this. Nothing here says the pool saw the
       transaction, let alone rejected it. */
    expect(isNamedRefusal(new Error('An error occurred (UNKNOWN_ERROR)'))).toBe(false);
    expect(isNamedRefusal(new Error('UNKNOWN_ERROR'))).toBe(false);
    expect(isNamedRefusal(new Error('unknown error'))).toBe(false);
  });

  it('recognises the pool\'s own asserts', () => {
    /* Cairo asserts arrive as SCREAMING_SNAKE short strings. These are real
       reasons with real causes, and they should stop the user. */
    for (const m of [
      'UNDEPOSITED_OPEN_NOTES',
      'TOO_MANY_OPEN_NOTES_DEPOSITED',
      'Execution failed: NOTE_ALREADY_DEPOSITED',
      'SCREENING_REQUIRED',
    ]) {
      expect(isNamedRefusal(new Error(m)), m).toBe(true);
    }
  });

  it('recognises our own asserts', () => {
    for (const m of ['NOT_ON_LADDER', 'LEG_COUNT_MISMATCH', 'CALLER_NOT_POOL', 'INSUFFICIENT_BALANCE']) {
      expect(isNamedRefusal(new Error(m)), m).toBe(true);
    }
  });

  it('recognises prose reasons too', () => {
    /* Not every wallet returns a Cairo short string. */
    expect(isNamedRefusal(new Error('transaction reverted'))).toBe(true);
    expect(isNamedRefusal(new Error('Insufficient private balance'))).toBe(true);
    expect(isNamedRefusal(new Error('user is not registered'))).toBe(true);
  });

  it('prefers silence to a guess on anything shapeless', () => {
    /* Network-level noise is not the pool speaking. */
    for (const m of ['', 'fetch failed', 'timeout', '502']) {
      expect(isNamedRefusal(new Error(m)), m).toBe(false);
    }
  });

  it('is not fooled by UNKNOWN_ERROR wrapped in other text', () => {
    /* The real message is "An error occurred (UNKNOWN_ERROR)" — the shrug has to
       win over the surrounding prose, or the wrapper reads as a reason. */
    expect(isNamedRefusal(new Error('Simulation failed: An error occurred (UNKNOWN_ERROR)'))).toBe(false);
  });
});

/* The one refusal a user can clear themselves.
 *
 * Found in a live Sepolia test: the panel showed a plain-English banner saying
 * the account had never shielded, and directly beneath it "The pool refused
 * this transaction in simulation: An error occurred (NOT_REGISTERED)". Both
 * described the same condition; only one was readable, and the unreadable one
 * looked like the real failure. The tester asked what had gone wrong. */
describe('isNotRegistered', () => {
  it('recognises the message the pool actually sent', () => {
    /* Verbatim from the screenshot. */
    expect(isNotRegistered(new Error('An error occurred (NOT_REGISTERED)'))).toBe(true);
  });

  it('recognises the felt when the wallet did not decode it', () => {
    /* 'NOT_REGISTERED' as a Cairo short string. Same fact, other spelling. */
    expect(isNotRegistered(new Error('0x4e4f545f52454749535445524544'))).toBe(true);
    expect(isNotRegistered(new Error('reverted with 4E4F545F52454749535445524544'))).toBe(true);
  });

  it('does not fire on every other refusal', () => {
    /* This message tells the user to go and shield. Saying that to someone
       who is already registered and merely short of funds would send them off
       to fix something that is not broken. */
    for (const m of [
      'NOT_ON_LADDER',
      'INSUFFICIENT_BALANCE',
      'UNDEPOSITED_OPEN_NOTES',
      'An error occurred (UNKNOWN_ERROR)',
      '',
    ]) {
      expect(isNotRegistered(new Error(m)), m).toBe(false);
    }
  });

  it('is checked before the generic refusal, which would also match it', () => {
    /* isNamedRefusal matches /not registered/i, so ordering is the whole fix:
       if the generic branch ran first the user would still see the felt. */
    expect(isNamedRefusal(new Error('An error occurred (NOT_REGISTERED)'))).toBe(true);
  });
});

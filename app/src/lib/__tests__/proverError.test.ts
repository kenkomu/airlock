/* The one failure a user is guaranteed to hit, and the one they must not
   misread. Both strings below are verbatim from real runs: the first from the
   dev server, where the unset default resolves to the app's own origin and
   returns an empty 404; the second from a static build, where `/prover` is not
   a URL at all. */

import { describe, expect, it } from 'vitest';
import { asMissingProver } from '../deposit';

const DEV_SERVER = new Error('Proving service HTTP 404: ');
const STATIC_BUILD = new Error('Failed to parse URL from /prover');

describe('asMissingProver', () => {
  it.each([
    ['an empty 404 from the dev server', DEV_SERVER],
    ['an unresolvable /prover in a static build', STATIC_BUILD],
  ])('recognises %s', (_label, err) => {
    expect(asMissingProver(err)).not.toBeNull();
  });

  it('says nothing was lost, because nothing was', () => {
    const m = asMissingProver(DEV_SERVER)!;
    expect(m).toMatch(/nothing was moved and nothing was lost/i);
    /* The account deploy really did happen and really was paid for. Telling
       someone it did not would be its own lie. */
    expect(m).toMatch(/account created in the step above is still yours/i);
  });

  it('names the cause rather than the symptom', () => {
    const m = asMissingProver(DEV_SERVER)!;
    expect(m).toMatch(/no public prover/i);
    expect(m).toMatch(/by design, not by fault/i);
    /* A bare status code invites the reader to suspect their own transfer. */
    expect(m).not.toMatch(/404|HTTP/);
  });

  it('leaves unrelated failures alone', () => {
    expect(asMissingProver(new Error('insufficient balance'))).toBeNull();
    expect(asMissingProver(new Error('user rejected the request'))).toBeNull();
    expect(asMissingProver(new Error('nonce too low'))).toBeNull();
  });
});
